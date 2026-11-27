from uuid import UUID

from celery import Celery

from .config import config
from .db import admin, database, finish_run, lookup_actor
from .delivery import create_occurrences, recover_stalled, work_delivery
from .schemas import Analyze
from .workflows import performance

settings=config()
celery=Celery("study-case-manager",broker=settings.broker or "memory://",backend=settings.celery_result_backend or None)
celery.conf.update(
    timezone="UTC",enable_utc=True,task_serializer="json",accept_content=["json"],task_ignore_result=True,
    task_acks_late=True,worker_prefetch_multiplier=1,broker_connection_retry_on_startup=True,
    beat_schedule={"delivery-due":{"task":"scm.delivery_tick","schedule":30.0}},
)


@celery.task(name="scm.delivery_tick")
def delivery_tick():
    create_occurrences()
    recover_stalled()
    work_delivery()


@celery.task(name="scm.analyze")
def analyze_task(user_id, institution_id, payload, run_id):
    actor=lookup_actor(UUID(user_id))
    admin(actor)
    if str(actor.institution)!=institution_id:
        return
    identifier=UUID(run_id)
    with database() as lock:
        claimed=lock.execute("select pg_try_advisory_lock(hashtextextended(%s,34)) as locked",(str(identifier),)).fetchone()
        if claimed["locked"]:
            _analyze_claimed(actor,payload,identifier)


def _analyze_claimed(actor,payload,identifier):
    with database() as db:
        row=db.execute("""
            select status from public.ai_agent_runs where id=%s and user_id=%s and institution_id=%s for update
        """,(identifier,actor.user,actor.institution)).fetchone()
        existing=db.execute("select id from public.ai_analysis_results where institution_id=%s and run_id=%s",
                            (actor.institution,identifier)).fetchone()
    if not row or row["status"]!="running":
        return
    usage=[0,0]
    try:
        if existing:
            finish_run(actor,identifier,"completed",{"result_id":str(existing["id"])})
            return
        result=performance(actor,Analyze.model_validate(payload),identifier,usage)
        finish_run(actor,identifier,"completed",{"result_id":result["id"]},tuple(usage),
                   [{"tool":"verified_academic_metrics","count":result["analyzed"]}])
    except Exception:
        with database() as db:
            committed=db.execute("select id from public.ai_analysis_results where institution_id=%s and run_id=%s",
                                 (actor.institution,identifier)).fetchone()
        if committed:
            finish_run(actor,identifier,"completed",{"result_id":str(committed["id"])},tuple(usage))
        else:
            finish_run(actor,identifier,"failed",{"error":"The academic analysis failed. Check the cohort and AI configuration."},tuple(usage))

