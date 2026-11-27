import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import TypedDict
from uuid import UUID, uuid4

from fastapi import HTTPException
from langgraph.graph import START, END, StateGraph
from langgraph.types import Command, interrupt
from psycopg.types.json import Jsonb

from .config import config
from .db import Actor, admin, database
from .model import model_call, COMMUNICATION_DRAFT, COMMUNICATION_INTENT
from .providers import approved_template
from .schemas import CampaignAction, DraftContent, DraftIntent, DraftRequest, EditDraft, Filters, TemplateRequest
from .tools import assessments_with_pending_scores, load_bundle, resolve_filter
from .workflows import checkpointer


def normalized_contact(channel, value):
    if not value:
        return None
    value=value.strip()
    if channel=="email":
        value=value.lower()
        return value if re.fullmatch(r"[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+",value) else None
    value=re.sub(r"[ ()-]","",value)
    return value if re.fullmatch(r"\+[1-9][0-9]{7,14}",value) else None


def sendable(row, channel, guardian=False):
    if guardian:
        return normalized_contact(channel,row["guardian_email" if channel=="email" else "guardian_phone"]) if row["guardian_contact_verified"] and row[f"guardian_{channel}_consent"] else None
    return normalized_contact(channel,row["email" if channel=="email" else "whatsapp"]) if row["active"] and row[f"{channel}_consent"] else None


def read_template(db, actor, identifier, channel):
    if not identifier:
        if channel=="whatsapp":
            raise HTTPException(422,"Choose an approved WhatsApp template.")
        return None
    result=db.execute("""
        select id,body,subject,provider_name,language from public.communication_templates
        where id=%s and institution_id=%s and channel=%s and active
    """,(identifier,actor.institution,channel)).fetchone()
    if not result:
        raise HTTPException(404,"This template is unavailable.")
    if channel=="whatsapp" and approved_template(result["provider_name"],result["language"])!=result["body"]:
        raise HTTPException(409,"The approved template changed. Register the current Meta template.")
    return result


def save_template(actor: Actor, request: TemplateRequest):
    admin(actor)
    if request.channel=="whatsapp":
        if not request.provider_name or not request.language:
            raise HTTPException(422,"Specify the approved Meta template name and language.")
        if approved_template(request.provider_name,request.language)!=request.body:
            raise HTTPException(422,"The supplied body differs from the approved Meta template.")
    with database() as db:
        row=db.execute("""
            insert into public.communication_templates(institution_id,name,channel,body,subject,provider_name,language)
            values(%s,%s,%s,%s,%s,%s,%s) on conflict(institution_id,channel,name) do update set
              body=excluded.body,subject=excluded.subject,provider_name=excluded.provider_name,language=excluded.language,active=true
            returning id,name,channel
        """,(actor.institution,request.name,request.channel,request.body,request.subject,request.provider_name,request.language)).fetchone()
    return row


def selection(actor, request, intent):
    if intent.selection=="guardian":
        if not request.student_id or request.staff_ids:
            raise HTTPException(422,"Select one verified guardian through a student profile.")
        return [], {}, True
    if request.staff_ids:
        return request.staff_ids,{},False
    tables={"timetable_entries","class_sessions","assessments","assessment_scores","topic_progress"}
    bundle=load_bundle(actor,Filters(),set())
    staff=bundle["staff"]
    active={row["id"] for row in staff if row["active"]}
    if request.student_id:
        matches=[row for row in bundle["students"] if row["id"]==request.student_id]
        if not matches:
            raise HTTPException(404,"Student record is unavailable.")
        allocations=[item for item in bundle["staff_assignments"] if item["batch_id"]==matches[0]["batch_id"] and item["active"]]
        return list({item["staff_id"] for item in allocations}&active),{},False
    if intent.selection=="all":
        return list(active),{},False
    if intent.selection=="named":
        if not intent.staff_names:
            raise HTTPException(422,"Select the intended staff members.")
        return [resolve_filter(staff,name,"staff member") for name in intent.staff_names],{},False
    if intent.selection=="unclear":
        raise HTTPException(422,"Specify the intended staff, class, batch, or subject.")
    class_id=resolve_filter(bundle["classes"],intent.class_name,"class")
    batch_id=resolve_filter([row for row in bundle["batches"] if not class_id or row["class_id"]==class_id],intent.batch_name,"batch")
    subject_id=resolve_filter(bundle["subjects"],intent.subject_name,"subject")
    if ((intent.selection=="class" and not class_id) or (intent.selection=="batch" and not batch_id) or
        (intent.selection=="subject" and not subject_id)):
        raise HTTPException(422,"Choose a specific class, batch, or subject.")
    if intent.selection in ("class","batch","subject"):
        rows=load_bundle(actor,Filters(class_id=class_id,batch_id=batch_id,subject_id=subject_id),set())["staff_assignments"]
        return list({r["staff_id"] for r in rows if r["active"]}&active),{},False
    today=bundle["today"]
    begin=today if intent.selection=="pending_attendance" else today-timedelta(days=30)
    scoped=load_bundle(actor,Filters(class_id=class_id,batch_id=batch_id,subject_id=subject_id,from_date=begin,to_date=today+timedelta(days=14) if intent.selection=="timetable_changes" else today),tables)
    allocated={row["id"]:row["staff_id"] for row in scoped["staff_assignments"] if row["active"]}
    completed={row["timetable_id"] for row in scoped["class_sessions"]}
    if intent.selection=="pending_attendance":
        relevant=[r for r in scoped["timetable_entries"] if r["id"] not in completed and r["ends_at"]<=datetime.now(timezone.utc)]
    elif intent.selection=="pending_marks":
        relevant=assessments_with_pending_scores(scoped)
    elif intent.selection=="timetable_changes":
        relevant=[r for r in scoped["timetable_entries"] if r["status"]=="rescheduled"]
    else:
        relevant=[r for r in scoped["topic_progress"] if r["target_on"] and r["target_on"]<today and r["completion"]<100]
    evidence={}
    for item in relevant:
        staff_id=allocated.get(item["staff_assignment_id"])
        if staff_id in active:
            evidence[staff_id]=evidence.get(staff_id,0)+1
    return list(evidence),{key:{intent.selection:value} for key,value in evidence.items()},False


SNAPSHOT=("recipient_key","staff_id","student_id","channel","destination","subject","body","template_name","template_language","template_variables","report_id")
def snapshot_hash(recipients):
    values=[{key:row.get(key) for key in SNAPSHOT} for row in recipients]
    values.sort(key=lambda row:(str(row["recipient_key"]),row["channel"]))
    encoded=json.dumps(values,sort_keys=True,default=str,ensure_ascii=False,separators=(",",":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def create_draft(actor: Actor,request: DraftRequest,run_id: UUID,usage: list[int]):
    admin(actor)
    intent=model_call(DraftIntent,COMMUNICATION_INTENT,{"command":request.command,"selected_staff_count":len(request.staff_ids),"has_selected_student":bool(request.student_id)},usage)
    staff_ids,context,guardian=selection(actor,request,intent)
    if len(set(staff_ids))>300 or (intent.personalized and len(set(staff_ids))>20):
        raise HTTPException(422,"Select up to 300 staff for a shared message or 20 for personal messages.")
    with database() as db:
        template=read_template(db,actor,request.template_id,request.channel)
        if guardian:
            contacts=db.execute("""
                select id,active,guardian_contact_verified,guardian_email,guardian_phone,guardian_email_consent,guardian_whatsapp_consent
                from public.students where institution_id=%s and id=%s and active
            """,(actor.institution,request.student_id)).fetchall()
        else:
            contacts=db.execute("""
                select id,active,email,whatsapp,email_consent,whatsapp_consent from public.staff
                where institution_id=%s and id=any(%s::uuid[])
            """,(actor.institution,staff_ids)).fetchall()
        report=None
        if request.report_id:
            report=db.execute("select report_type,subject_id from public.generated_reports where institution_id=%s and id=%s",(actor.institution,request.report_id)).fetchone()
            allowed=request.channel=="email" and report and (guardian and report["report_type"]=="student" and report["subject_id"]==request.student_id
                     or not guardian and report["report_type"]=="staff" and set(staff_ids)=={report["subject_id"]})
            if not allowed:
                raise HTTPException(403,"The selected report is unavailable for this recipient or channel.")
    verified=[(row["id"],destination) for row in contacts if (destination:=sendable(row,request.channel,guardian))]
    if not verified:
        raise HTTPException(422,"No eligible recipients have a valid contact address and recorded consent.")
    def text_content(identifier=None):
        content=model_call(DraftContent,COMMUNICATION_DRAFT,{"command":request.command,"channel":request.channel,
             "template":template["body"] if template else None,"template_subject":template["subject"] if template else None,
             "verified_recipient_metrics":context.get(identifier,{})},usage)
        if request.channel=="whatsapp":
            original=template["body"]
            slots=sorted({int(value) for value in re.findall(r"\{\{(\d+)\}\}",original)})
            if slots!=list(range(1,len(slots)+1)) or len(content.template_variables)!=len(slots):
                raise HTTPException(422,"The draft does not match the approved template variables.")
            if any(not value.strip() or len(value)>300 or "\n" in value or "\t" in value for value in content.template_variables):
                raise HTTPException(422,"Review the generated WhatsApp template values.")
            return None,re.sub(r"\{\{(\d+)\}\}",lambda match:content.template_variables[int(match[1])-1],original),content.template_variables
        return " ".join(content.subject.split()),content.body,None
    common=None if intent.personalized else text_content()
    recipients=[]
    for identifier,destination in verified:
        subject,body,variables=common if common is not None else text_content(identifier)
        recipients.append({"recipient_key":identifier,"staff_id":None if guardian else identifier,"student_id":identifier if guardian else None,
                           "channel":request.channel,"destination":destination,"subject":subject,"body":body,
                           "template_name":template["provider_name"] if template else None,"template_language":template["language"] if template else None,
                           "template_variables":variables,"report_id":request.report_id})
    checksum=snapshot_hash(recipients)
    title=recipients[0]["subject"] or (template["provider_name"] if template else "WhatsApp campaign")
    with database() as db:
        db.execute("insert into public.communication_campaigns(id,institution_id,title,user_id,content_hash) values(%s,%s,%s,%s,%s)",
                   (run_id,actor.institution,title,actor.user,checksum))
        db.execute("insert into public.communication_drafts(institution_id,campaign_id,content_hash,intent) values(%s,%s,%s,%s)",
                   (actor.institution,run_id,checksum,Jsonb({"selection":intent.selection,"excluded":max(0,(1 if guardian else len(set(staff_ids)))-len(verified))})))
        for row in recipients:
            db.execute("""
                insert into public.communication_recipients(institution_id,campaign_id,recipient_key,staff_id,student_id,channel,destination,
                   subject,body,template_name,template_language,template_variables,report_id)
                values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,(actor.institution,run_id,*(Jsonb(row[key]) if key=="template_variables" and row[key] is not None else row[key] for key in SNAPSHOT)))
    return checksum


class ApprovalState(TypedDict, total=False):
    campaign_id: str
    content_hash: str
    decision: str


def approval_workflow(saver):
    def review(state):
        reply=interrupt({"campaign_id":state["campaign_id"],"content_hash":state["content_hash"],"action":"review_exact_snapshot"})
        if not isinstance(reply,dict) or reply.get("content_hash")!=state["content_hash"] or reply.get("decision")!="approved":
            raise ValueError("Snapshot approval does not match.")
        return {"decision":"approved"}
    graph=StateGraph(ApprovalState)
    graph.add_node("review_exact_snapshot",review)
    graph.add_edge(START,"review_exact_snapshot")
    graph.add_edge("review_exact_snapshot",END)
    return graph.compile(checkpointer=saver)


def thread(identifier):
    return {"configurable":{"thread_id":"campaign-"+str(identifier)}}


def open_approval(identifier,checksum):
    with checkpointer() as saver:
        approval_workflow(saver).invoke({"campaign_id":str(identifier),"content_hash":checksum},thread(identifier))


def recipients(db,actor,campaign):
    return db.execute("select * from public.communication_recipients where campaign_id=%s and institution_id=%s order by recipient_key,channel",
                      (campaign,actor.institution)).fetchall()


def load_campaign(db,actor,identifier,lock=False):
    clause=" for update" if lock else ""
    row=db.execute("select * from public.communication_campaigns where id=%s and institution_id=%s"+clause,(identifier,actor.institution)).fetchone()
    if not row:
        raise HTTPException(404,"Campaign not found.")
    return row


def campaign_status(actor,identifier):
    admin(actor)
    with database() as db:
        campaign=load_campaign(db,actor,identifier)
        people=recipients(db,actor,identifier)
        deliveries=db.execute("""
            select id,channel,status,provider_id,attempts,error,occurrence from public.communication_delivery_logs
            where campaign_id=%s and institution_id=%s order by occurrence desc,id limit 500
        """,(identifier,actor.institution)).fetchall()
        extra=db.execute("select intent from public.communication_drafts where campaign_id=%s and institution_id=%s",(identifier,actor.institution)).fetchone()
        return {**campaign,"recipients":people,"deliveries":deliveries,"excluded":(extra or {}).get("intent",{}).get("excluded",0)}


def edit_draft(actor: Actor,request: EditDraft):
    admin(actor)
    with database() as db:
        old=load_campaign(db,actor,request.campaign_id,lock=True)
        people=recipients(db,actor,old["id"])
        if old["status"] not in ("awaiting_approval","approved") or not people or old["content_hash"]!=request.content_hash or snapshot_hash(people)!=request.content_hash:
            raise HTTPException(409,"Only the current preview of an unqueued campaign can be edited.")
        first=people[0]
        if any(any(row.get(k)!=first.get(k) for k in ("channel","subject","body","template_name","template_language","template_variables")) for row in people):
            raise HTTPException(422,"Regenerate the preview from new instructions for personalized messages.")
        if first["channel"]=="email":
            if not request.subject or not request.subject.strip() or not request.body or not request.body.strip():
                raise HTTPException(422,"Enter an email subject and message.")
            subject,body,variables=" ".join(request.subject.split()),request.body,None
        else:
            template=approved_template(first["template_name"],first["template_language"])
            variables=request.template_variables or []
            checked=sorted({int(value) for value in re.findall(r"\{\{(\d+)\}\}",template)})
            if checked!=list(range(1,len(checked)+1)) or len(variables)!=len(checked) or any(not value.strip() or len(value)>300 or "\n" in value for value in variables):
                raise HTTPException(422,"Enter the required values for the approved WhatsApp template.")
            body=re.sub(r"\{\{(\d+)\}\}",lambda match:variables[int(match[1])-1],template)
            subject=None
        edited=[{**row,"subject":subject,"body":body,"template_variables":variables} for row in people]
        checksum=snapshot_hash(edited)
        if checksum==old["content_hash"]:
            raise HTTPException(422,"Change the message to create a new preview.")
        identifier=uuid4()
        db.execute("insert into public.communication_campaigns(id,institution_id,title,user_id,content_hash) values(%s,%s,%s,%s,%s)",
                   (identifier,actor.institution,subject or old["title"],actor.user,checksum))
        db.execute("insert into public.communication_drafts(institution_id,campaign_id,content_hash,intent) values(%s,%s,%s,%s)",
                   (actor.institution,identifier,checksum,Jsonb({"edited_from":str(old["id"])})))
        for row in edited:
            db.execute("""
                insert into public.communication_recipients(institution_id,campaign_id,recipient_key,staff_id,student_id,channel,destination,
                   subject,body,template_name,template_language,template_variables,report_id)
                values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,(actor.institution,identifier,*(Jsonb(row[key]) if key=="template_variables" and row[key] is not None else row[key] for key in SNAPSHOT)))
        db.execute("update public.communication_campaigns set status='cancelled' where id=%s",(old["id"],))
    # Approval creates the exact new checkpoint on demand and rescues a failed initialization.
    return campaign_status(actor,identifier)


def approval_action(actor,request):
    admin(actor)
    with database() as db:
        campaign=load_campaign(db,actor,request.campaign_id,lock=True)
        if request.content_hash!=campaign["content_hash"] or snapshot_hash(recipients(db,actor,campaign["id"]))!=request.content_hash:
            raise HTTPException(409,"The message or recipient list changed. Generate a new preview.")
        if campaign["status"]=="awaiting_approval":
            with checkpointer() as saver:
                graph=approval_workflow(saver)
                graph_state=graph.get_state(thread(campaign["id"]))
                if not graph_state.values:
                    graph.invoke({"campaign_id":str(campaign["id"]),"content_hash":request.content_hash},thread(campaign["id"]))
                    graph_state=graph.get_state(thread(campaign["id"]))
                approved=graph_state.values if graph_state.values.get("decision")=="approved" else graph.invoke(
                    Command(resume={"decision":"approved","content_hash":request.content_hash}),thread(campaign["id"]))
                if approved.get("decision")!="approved":
                    raise HTTPException(409,"The approval checkpoint could not be resumed.")
            db.execute("insert into public.communication_approvals(institution_id,campaign_id,approver_id,content_hash) values(%s,%s,%s,%s) on conflict do nothing",
                       (actor.institution,campaign["id"],actor.user,request.content_hash))
            db.execute("update public.communication_campaigns set status='approved' where id=%s",(campaign["id"],))
            db.execute("update public.ai_agent_runs set status='completed' where id=%s and institution_id=%s",(campaign["id"],actor.institution))
        elif campaign["status"]!="approved":
            raise HTTPException(409,"This campaign can no longer be approved.")
    return campaign_status(actor,request.campaign_id)


def queue_action(actor,request: CampaignAction,action: str):
    admin(actor)
    now=datetime.now(timezone.utc)
    if action in ("send","schedule","retry") and not config().broker:
        raise HTTPException(503,"Background delivery is awaiting Redis configuration.")
    with database() as db:
        row=load_campaign(db,actor,request.campaign_id,lock=True)
        campaign=row["id"]
        if row["content_hash"]!=request.content_hash:
            raise HTTPException(409,"The approved snapshot no longer matches.")
        if action in ("send","schedule"):
            if row["status"] in ("scheduled","queued","sent"):
                return campaign_status(actor,campaign)
            if row["status"]!="approved" or not db.execute("select 1 from public.communication_approvals where campaign_id=%s and content_hash=%s",(campaign,request.content_hash)).fetchone():
                raise HTTPException(409,"Approve this exact preview before delivery.")
            recipients_now=recipients(db,actor,campaign)
            if not recipients_now or snapshot_hash(recipients_now)!=request.content_hash or not all(config().channel_ready(r["channel"]) for r in recipients_now):
                raise HTTPException(503,"Verify the message snapshot and provider configuration.")
            dt=request.when if action=="schedule" else now
            if not dt or dt.tzinfo is None or (action=="schedule" and dt<=now):
                raise HTTPException(422,"Select a future date and time with a time zone.")
            recurrence=request.recurring_days if action=="schedule" else None
            if recurrence and any(r["student_id"] or r["report_id"] for r in recipients_now):
                raise HTTPException(422,"Recurring delivery is available for staff messages without attachments.")
            db.execute("update public.communication_campaigns set status=%s,next_run_at=%s,recurring_days=%s where id=%s",
                       ("scheduled" if action=="schedule" else "queued",dt,recurrence,campaign))
            if recurrence:
                zone=db.execute("select timezone from public.institution_settings where institution_id=%s",(actor.institution,)).fetchone()
                db.execute("insert into public.notification_schedules(institution_id,campaign_id,timezone,interval_days) values(%s,%s,%s,%s)",
                           (actor.institution,campaign,(zone or {}).get("timezone","Asia/Kolkata"),recurrence))
        elif action=="cancel":
            if row["status"] not in ("awaiting_approval","approved","scheduled","queued","failed","cancelled"):
                raise HTTPException(409,"This campaign cannot be cancelled.")
            db.execute("update public.communication_campaigns set status='cancelled',next_run_at=null where id=%s",(campaign,))
            db.execute("update public.notification_schedules set active=false where campaign_id=%s",(campaign,))
            db.execute("update public.communication_delivery_logs set status='cancelled' where campaign_id=%s and status='queued'",(campaign,))
        elif action=="retry":
            if row["status"]=="cancelled":
                raise HTTPException(409,"Cancelled campaigns cannot be retried.")
            updated=db.execute("""
              update public.communication_delivery_logs set status='queued',error=null
              where campaign_id=%s and status='failed' and attempts<3 and provider_id is null
              and occurrence>now()-interval '23 hours'
            """,(campaign,)).rowcount
            if not updated:
                raise HTTPException(409,"No eligible failed deliveries can be retried.")
            if row["status"]=="failed":
                db.execute("update public.communication_campaigns set status='queued' where id=%s",(campaign,))
    return campaign_status(actor,request.campaign_id)

