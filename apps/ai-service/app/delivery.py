from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg.types.json import Jsonb

from .communication import sendable, snapshot_hash
from .db import database
from .providers import DeliveryError, deliver


def create_occurrences():
    with database() as db:
        due=db.execute("""
            select c.id,c.institution_id,c.next_run_at,c.recurring_days,s.timezone
            from public.communication_campaigns c left join public.notification_schedules s on s.campaign_id=c.id
            where c.status in ('queued','scheduled') and c.next_run_at<=now()
            order by c.next_run_at limit 50 for update of c skip locked
        """).fetchall()
        for campaign in due:
            identifier=campaign["id"]
            db.execute("""
                insert into public.communication_delivery_logs(institution_id,campaign_id,recipient_id,occurrence,channel,status)
                select c.institution_id,c.id,r.id,c.next_run_at,r.channel,'queued'
                from public.communication_campaigns c join public.communication_approvals a
                  on a.campaign_id=c.id and a.content_hash=c.content_hash
                join public.communication_recipients r on r.campaign_id=c.id and r.institution_id=c.institution_id
                where c.id=%s on conflict(recipient_id,occurrence) do nothing
            """,(identifier,))
            repeats=campaign["recurring_days"]
            upcoming=None
            if repeats:
                local=campaign["next_run_at"].astimezone(ZoneInfo(campaign["timezone"] or "Asia/Kolkata"))
                upcoming=local+timedelta(days=repeats)
                now=datetime.now(timezone.utc)
                while upcoming<=now:
                    upcoming+=timedelta(days=repeats)
            db.execute("update public.communication_campaigns set status=%s,next_run_at=%s,queued_at=now() where id=%s",
                       ("scheduled" if upcoming else "queued",upcoming,identifier))


def _maybe_close(db,campaign_id):
    db.execute("""
        update public.communication_campaigns c set status=case when exists(
          select 1 from public.communication_delivery_logs d where d.campaign_id=c.id and d.status in ('failed','uncertain','bounced')
        ) then 'failed' else 'sent' end
        where c.id=%s and c.status='queued' and c.next_run_at is null and exists(
          select 1 from public.communication_delivery_logs d where d.campaign_id=c.id
        ) and not exists(
          select 1 from public.communication_delivery_logs d where d.campaign_id=c.id and d.status in ('queued','sending')
        )
    """,(campaign_id,))


def _current_contact(db,row):
    if row["staff_id"]:
        record=db.execute("select email,whatsapp,email_consent,whatsapp_consent,active from public.staff where id=%s and institution_id=%s",
                          (row["staff_id"],row["institution_id"])).fetchone()
        return sendable(record,row["channel"]) if record else None
    record=db.execute("""
        select guardian_email,guardian_phone,guardian_contact_verified,guardian_email_consent,guardian_whatsapp_consent
        from public.students where id=%s and institution_id=%s and active
    """,(row["student_id"],row["institution_id"])).fetchone()
    return sendable(record,row["channel"],True) if record else None


def _claim(db):
    campaign=db.execute("""
        select c.id,c.institution_id,c.content_hash from public.communication_campaigns c
        where c.status in ('scheduled','queued','sent') and exists(
          select 1 from public.communication_delivery_logs d where d.campaign_id=c.id and d.status='queued'
        ) order by c.queued_at nulls last,c.id limit 1 for update of c skip locked
    """).fetchone()
    if not campaign:
        return None
    row=db.execute("""
        select r.*, d.id as delivery_id, d.attempts, d.occurrence, p.storage_path
        from public.communication_delivery_logs d join public.communication_recipients r on r.id=d.recipient_id
        left join public.generated_reports p on p.id=r.report_id and p.institution_id=r.institution_id
        where d.campaign_id=%s and d.status='queued' order by d.occurrence,d.id limit 1 for update of d
    """,(campaign["id"],)).fetchone()
    people=db.execute("select * from public.communication_recipients where campaign_id=%s and institution_id=%s",
                      (campaign["id"],campaign["institution_id"])).fetchall()
    approval=db.execute("""
        select 1 from public.communication_approvals a
        join public.profiles p on p.user_id=a.approver_id and p.institution_id=a.institution_id and p.active
        join public.user_roles role on role.profile_id=p.id and role.role='admin'
        where a.campaign_id=%s and a.content_hash=%s
    """,(campaign["id"],campaign["content_hash"])).fetchone()
    reason=None
    if not approval or not people or snapshot_hash(people)!=campaign["content_hash"]:
        reason="The approved snapshot or approver is no longer valid."
    elif _current_contact(db,row)!=row["destination"]:
        reason="Contact details or consent changed after approval."
    elif row["report_id"] and not row["storage_path"]:
        reason="The approved report is unavailable."
    if reason:
        db.execute("update public.communication_delivery_logs set status='failed',attempts=3,error=%s where id=%s",
                   (reason,row["delivery_id"]))
        _maybe_close(db,campaign["id"])
        return {"skip":True}
    db.execute("update public.communication_delivery_logs set status='sending',attempts=attempts+1,tried_at=now() where id=%s",(row["delivery_id"],))
    row["id"]=row["delivery_id"]
    return row


ALLOWED = {
    "sent": {"queued","sending","uncertain","failed"},
    "delivered": {"queued","sending","sent","uncertain","failed"},
    "read": {"queued","sending","sent","delivered","uncertain","failed"},
    "failed": {"queued","sending","sent","uncertain"},
    "bounced": {"queued","sending","sent","delivered","uncertain","failed"},
}


def apply_event(db,provider,event_key,provider_id,status,opaque=None):
    channel="email" if provider=="resend" else "whatsapp"
    if status not in ALLOWED:
        return
    event=db.execute("""
        insert into public.provider_webhook_events(provider,event_key,provider_id,delivery_status)
        values(%s,%s,%s,%s) on conflict(provider,event_key) do nothing returning id
    """,(provider,event_key,provider_id,status)).fetchone()
    if not event:
        return
    row=db.execute("""
        select id,campaign_id,provider_id,status from public.communication_delivery_logs
        where channel=%s and (provider_id=%s or (id=%s and provider_id is null and status in ('sending','uncertain'))) limit 1 for update
    """,(channel,provider_id,opaque)).fetchone()
    if row:
        _apply_status(db,row,event["id"],provider_id,status)


def _apply_status(db,row,event_id,provider_id,status):
    if row["status"] in ALLOWED[status]:
        db.execute("update public.communication_delivery_logs set status=%s,provider_id=%s,error=%s where id=%s",
                   (status,provider_id,"Provider reported "+status if status in ("failed","bounced") else None,row["id"]))
    db.execute("update public.provider_webhook_events set applied_at=now() where id=%s",(event_id,))


def _reconcile(db,delivery,provider_id):
    provider="resend" if delivery["channel"]=="email" else "meta"
    events=db.execute("""
        select id,delivery_status from public.provider_webhook_events where provider=%s and provider_id=%s
        and applied_at is null order by created_at,id
    """,(provider,provider_id)).fetchall()
    for event in events:
        row=db.execute("select id,provider_id,status from public.communication_delivery_logs where id=%s for update",(delivery["id"],)).fetchone()
        _apply_status(db,row,event["id"],provider_id,event["delivery_status"])


def work_delivery(batch_size=12):
    for _ in range(batch_size):
        with database() as db:
            row=_claim(db)
        if not row:
            break
        if row.get("skip"):
            continue
        try:
            provider_id=deliver(row)
            next_status,error="sent",None
        except DeliveryError as failure:
            provider_id=None
            next_status,error=("uncertain" if failure.uncertain else "failed"),str(failure)
        except Exception:
            provider_id=None
            next_status,error="uncertain","Delivery requires reconciliation."
        with database() as db:
            db.execute("select id from public.communication_campaigns where id=%s for update",(row["campaign_id"],))
            db.execute("""
                update public.communication_delivery_logs set provider_id=%s,status=%s,error=%s where id=%s and status='sending'
            """,(provider_id,next_status,error,row["id"]))
            if provider_id:
                _reconcile(db,row,provider_id)
            _maybe_close(db,row["campaign_id"])


def recover_stalled():
    with database() as db:
        db.execute("""
            update public.communication_delivery_logs set status=case when channel='email' and
              attempts<3 and tried_at>now()-interval '23 hours' then 'queued' else 'uncertain' end,
              error='Worker stopped before the provider response was recorded.'
            where status='sending' and tried_at<now()-interval '5 minutes'
        """)
        campaigns=db.execute("select id from public.communication_campaigns where status='queued' and next_run_at is null").fetchall()
        for campaign in campaigns:
            _maybe_close(db,campaign["id"])

