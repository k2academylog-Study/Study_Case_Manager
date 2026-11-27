import hashlib
import hmac
import logging
from typing import Annotated
from uuid import UUID, uuid5

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from psycopg import Error as DatabaseError
from psycopg.types.json import Jsonb
from svix.webhooks import Webhook, WebhookVerificationError

from .communication import approval_action, campaign_status, create_draft, edit_draft, open_approval, queue_action, save_template
from .config import config
from .db import Actor, admin, authorize, begin_run, database, finish_run
from .delivery import apply_event
from .providers import graph_api
from .schemas import Analyze, AssistantQuery, CampaignAction, DraftRequest, EditDraft, Intervention, TemplateRequest
from .tools import tool_filters
from .worker import analyze_task, delivery_tick
from .workflows import access_scope, assistant, conversation

app=FastAPI(title="Study Case Manager AI",version="1.0.0",description="Institution-scoped academic agents and provider webhooks.")
log=logging.getLogger("scm")
Member=Annotated[Actor,Depends(authorize)]
prefix="/api/v1/ai"


@app.middleware("http")
async def academic_response(request:Request, next_handler):
    size=request.headers.get("content-length","0")
    if request.method in ("POST","PATCH") and (not size.isdecimal() or int(size)>1_000_000):
        return JSONResponse({"detail":"The request is too large."},status_code=413)
    response=await next_handler(request)
    response.headers["Cache-Control"]="no-store"
    return response


@app.exception_handler(DatabaseError)
async def database_error(_request,error):
    log.warning("DB operation failed with code %s",error.sqlstate)
    return JSONResponse({"detail":"The database could not complete the request."},status_code=503)


@app.get("/health")
def health():
    return {"status":"running","database_configured":bool(config().database_url),"model_configured":config().model_ready,"worker_configured":bool(config().broker)}


@app.get(prefix+"/usage")
def usage(actor:Member):
    admin(actor)
    with database() as db:
        row=db.execute("""
            select count(distinct run_id) as requests,coalesce(sum(input_tokens),0) as input_tokens,
              coalesce(sum(output_tokens),0) as output_tokens,coalesce(sum(estimated_usd),0) as estimated_usd
            from public.ai_usage_logs where institution_id=%s and created_at>=now()-interval '30 days'
        """,(actor.institution,)).fetchone()
    return row


@app.get(prefix+"/integrations")
def integrations(actor:Member,verify:bool=False):
    admin(actor)
    with database() as db:
        templates=db.execute("select id,name,channel from public.communication_templates where institution_id=%s and active order by name limit 200",
                             (actor.institution,)).fetchall()
    settings=config()
    verified={}
    if verify:
        for channel in ("email","whatsapp"):
            if not settings.channel_ready(channel):
                continue
            try:
                if channel=="email":
                    verified[channel]=httpx.get("https://api.resend.com/domains",headers={"Authorization":"Bearer "+settings.resend_api_key},timeout=6).is_success
                elif settings.whatsapp_phone_number_id.isdecimal():
                    verified[channel]=httpx.get(f"{graph_api()}/{settings.whatsapp_phone_number_id}",params={"fields":"id"},
                                                 headers={"Authorization":"Bearer "+settings.whatsapp_access_token},timeout=6).is_success
            except (httpx.HTTPError,HTTPException):
                verified[channel]=False
    return {"model":settings.model_ready,"email":settings.channel_ready("email"),"whatsapp":settings.channel_ready("whatsapp"),
            "background_delivery":bool(settings.broker),"templates":templates,"verified":verified}


def enqueue_analysis(actor,request):
    admin(actor)
    if not config().broker:
        raise HTTPException(503,"Background analysis is awaiting Redis configuration.")
    run,created=begin_run(actor,"performance",request.request_id)
    if created:
        try:
            analyze_task.delay(str(actor.user),str(actor.institution),request.model_dump(mode="json"),str(run["id"]))
        except Exception:
            finish_run(actor,run["id"],"failed",{"error":"The background worker could not be reached."})
            raise HTTPException(503,"The background worker could not be reached.")
    return {"run_id":run["id"],"status":run["status"],"details":run["details"]}


@app.post(prefix+"/performance/analyze",status_code=202)
def analyze(request:Analyze,actor:Member):
    return enqueue_analysis(actor,request)


@app.get(prefix+"/performance/results/{identifier}")
def result(identifier:UUID,actor:Member):
    admin(actor)
    with database() as db:
        row=db.execute("select id,filters,result,created_at from public.ai_analysis_results where id=%s and institution_id=%s",
                       (identifier,actor.institution)).fetchone()
    if not row:
        raise HTTPException(404,"Analysis not found.")
    return row


@app.get(prefix+"/runs/{identifier}")
def run_status(identifier:UUID,actor:Member):
    with database() as db:
        row=db.execute("select id,agent,status,case when agent='assistant' then null else details end as details,created_at from public.ai_agent_runs where id=%s and institution_id=%s and user_id=%s",
                       (identifier,actor.institution,actor.user)).fetchone()
    if not row:
        raise HTTPException(404,"Agent run not found.")
    return row


@app.post(prefix+"/assistant/chat")
def chat(request:AssistantQuery,actor:Member):
    run,created=begin_run(actor,"assistant",request.request_id)
    if not created:
        if run["status"]=="completed":
            conversation(actor,UUID(run["details"]["conversation_id"]))
            return run["details"]
        raise HTTPException(409,"This question is already processing or failed. Start a new request to retry.")
    usage=[0,0]
    def handoff(plan,sources,question):
        scope=tool_filters(actor,plan.tools[0]).model_dump() if plan.tools else {}
        if plan.handoff=="performance":
            payload=Analyze(request_id=uuid5(request.request_id,"performance"),**scope)
            queued=enqueue_analysis(actor,payload)
            return {"note":"The academic analysis was queued. Open the analysis history after it completes.",
                    "links":[{"path":"/ai/student-performance","label":"Open performance analysis"}]}
        if plan.handoff=="communication":
            if "whatsapp" in question.casefold():
                return {"note":"Choose the approved WhatsApp template in the communication workspace before creating the draft.",
                        "links":[{"path":"/ai/communication","label":"Open communication workspace"}]}
            data=DraftRequest(request_id=uuid5(request.request_id,"communication"),command=question,channel="email")
            preview=draft_message(data,actor)
            return {"note":"An email draft is waiting for human review. No message has been sent.",
                    "links":[{"path":"/ai/communication?campaign="+str(preview["id"]),"label":"Review communication draft"}]}
        if plan.handoff=="student_report" and scope.get("student_id"):
            return {"note":"The authorized student report can be previewed and downloaded from the linked page.",
                    "links":[{"path":"/reports/students/"+str(scope["student_id"]),"label":"Open student report"}]}
        if plan.handoff in ("student_report","staff_report","class_report"):
            return {"note":"Select the reporting scope and download a PDF in the report centre.",
                    "links":[{"path":"/reports","label":"Open report centre"}]}
        return {}
    try:
        answer=assistant(actor,request,usage,handoff)
        finish_run(actor,run["id"],"completed",answer,tuple(usage),answer["message"]["sources"])
        return answer
    except HTTPException as error:
        finish_run(actor,run["id"],"failed",{"error":error.detail},tuple(usage))
        raise
    except Exception:
        finish_run(actor,run["id"],"failed",{"error":"The assistant could not verify a response."},tuple(usage))
        raise HTTPException(502,"The assistant could not verify a response.")


@app.get(prefix+"/assistant/conversations")
def conversations(actor:Member,limit:int=Query(50,ge=1,le=100),offset:int=Query(0,ge=0,le=1000)):
    with database() as db:
        rows=db.execute("""
          select id,title,created_at from public.ai_conversations where institution_id=%s and user_id=%s and access_scope=%s
          order by created_at desc,id desc limit %s offset %s
        """,(actor.institution,actor.user,access_scope(db,actor),limit,offset)).fetchall()
    return {"items":rows}


@app.get(prefix+"/assistant/conversations/{identifier}")
def messages(identifier:UUID,actor:Member):
    return conversation(actor,identifier)


def write_intervention(actor,request,identifier=None):
    admin(actor)
    values=request.model_dump()
    with database() as db:
        matches=db.execute("""
            select 1 from public.students s join public.staff_assignments a on a.batch_id=s.batch_id and a.active
            join public.staff t on a.staff_id=t.id and t.active
            where s.institution_id=%s and s.id=%s and t.id=%s
        """,(actor.institution,request.student_id,request.staff_id)).fetchone()
        if not matches:
            raise HTTPException(422,"Assign the intervention to an active teacher for this student’s batch.")
        columns=("student_id","staff_id","issue","evidence","action","target_on","followup_on","status","outcome","notes")
        params=tuple(values[key] for key in columns)
        if identifier:
            row=db.execute("""
                update public.academic_interventions set student_id=%s,staff_id=%s,issue=%s,evidence=%s,action=%s,target_on=%s,followup_on=%s,status=%s,outcome=%s,notes=%s
                where institution_id=%s and id=%s returning *
            """,(*params,actor.institution,identifier)).fetchone()
        else:
            row=db.execute("""
                insert into public.academic_interventions(student_id,staff_id,issue,evidence,action,target_on,followup_on,status,outcome,notes,institution_id)
                values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *
            """,(*params,actor.institution)).fetchone()
    if not row:
        raise HTTPException(404,"Intervention not found.")
    return row


@app.post(prefix+"/interventions",status_code=201)
def interventions(request:Intervention,actor:Member):
    return write_intervention(actor,request)


@app.patch(prefix+"/interventions/{identifier}")
def edit_intervention(identifier:UUID,request:Intervention,actor:Member):
    return write_intervention(actor,request,identifier)


@app.post(prefix+"/communication/draft")
def draft_message(request:DraftRequest,actor:Member):
    admin(actor)
    run,created=begin_run(actor,"communication",request.request_id)
    identifier=run["id"]
    if not created:
        if run["status"] in ("awaiting_approval","completed"):
            return campaign_status(actor,identifier)
        raise HTTPException(409,"This draft request is processing or failed.")
    usage=[0,0]
    try:
        checksum=create_draft(actor,request,identifier,usage)
        open_approval(identifier,checksum)
        preview=campaign_status(actor,identifier)
        finish_run(actor,identifier,"awaiting_approval",{"campaign_id":str(identifier)},tuple(usage),
                   [{"tool":"validate_recipients","count":len(preview["recipients"])}])
        return preview
    except HTTPException as error:
        finish_run(actor,identifier,"failed",{"error":error.detail},tuple(usage))
        raise
    except Exception:
        finish_run(actor,identifier,"failed",{"error":"The draft could not be prepared."},tuple(usage))
        raise HTTPException(502,"The draft could not be prepared.")


@app.post(prefix+"/communication/edit")
def edit_message(request:EditDraft,actor:Member):
    return edit_draft(actor,request)


@app.post(prefix+"/communication/approve")
def approve(request:CampaignAction,actor:Member):
    return approval_action(actor,request)


@app.post(prefix+"/communication/send")
def send(request:CampaignAction,actor:Member):
    return queue_action(actor,request,"send")


@app.post(prefix+"/communication/schedule")
def schedule(request:CampaignAction,actor:Member):
    return queue_action(actor,request,"schedule")


@app.post(prefix+"/communication/cancel")
def cancel(request:CampaignAction,actor:Member):
    return queue_action(actor,request,"cancel")


@app.post(prefix+"/communication/retry")
def retry(request:CampaignAction,actor:Member):
    return queue_action(actor,request,"retry")


@app.get(prefix+"/communication/status/{identifier}")
def status(identifier:UUID,actor:Member):
    return campaign_status(actor,identifier)


@app.post(prefix+"/communication/templates")
def template(request:TemplateRequest,actor:Member):
    return save_template(actor,request)


@app.post("/api/v1/internal/delivery-tick",status_code=202)
def tick(x_internal_secret:str=Header(default="")):
    settings=config()
    if not settings.internal_api_secret or not hmac.compare_digest(settings.internal_api_secret,x_internal_secret):
        raise HTTPException(403,"Service authentication failed.")
    if not settings.broker:
        raise HTTPException(503,"Background delivery is awaiting Redis configuration.")
    try:
        delivery_tick.delay()
    except Exception:
        raise HTTPException(503,"Background delivery could not be queued.")
    return {"queued":True}


@app.get("/api/v1/webhooks/whatsapp")
def verify_whatsapp(mode:str=Query(alias="hub.mode"),token:str=Query(alias="hub.verify_token"),challenge:str=Query(alias="hub.challenge")):
    shared=config().whatsapp_verify_token
    if not shared or mode!="subscribe" or not hmac.compare_digest(shared,token):
        raise HTTPException(403,"Webhook verification failed.")
    return PlainTextResponse(challenge)


@app.post("/api/v1/webhooks/whatsapp")
async def whatsapp_hook(request:Request):
    settings=config()
    if not settings.meta_app_secret:
        raise HTTPException(503,"WhatsApp webhooks are awaiting configuration.")
    body=await request.body()
    expected="sha256="+hmac.new(settings.meta_app_secret.encode(),body,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,request.headers.get("x-hub-signature-256","")):
        raise HTTPException(403,"Webhook verification failed.")
    payload=await request.json()
    with database() as db:
        for entry in payload.get("entry",[]):
            if entry.get("id")!=settings.whatsapp_business_account_id:
                continue
            for change in entry.get("changes",[]):
                value=change.get("value",{})
                if value.get("metadata",{}).get("phone_number_id")!=settings.whatsapp_phone_number_id:
                    continue
                for status in value.get("statuses",[]):
                    if not status.get("id") or not status.get("status"):
                        continue
                    try:
                        opaque=UUID(status["biz_opaque_callback_data"])
                    except (ValueError,TypeError,KeyError):
                        opaque=None
                    event_key=":".join(map(str,(status["id"],status["status"],status.get("timestamp",""))))
                    apply_event(db,"meta",event_key,status["id"],status["status"],opaque)
    return {"received":True}


@app.post("/api/v1/webhooks/email")
async def email_hook(request:Request):
    settings=config()
    if not settings.email_webhook_secret:
        raise HTTPException(503,"Email webhooks are awaiting configuration.")
    try:
        payload=Webhook(settings.email_webhook_secret).verify(await request.body(),dict(request.headers))
    except (WebhookVerificationError,ValueError):
        raise HTTPException(403,"Webhook verification failed.")
    status={"email.sent":"sent","email.delivered":"delivered","email.bounced":"bounced","email.failed":"failed"}.get(payload.get("type"))
    provider_id=payload.get("data",{}).get("email_id")
    if status and provider_id:
        with database() as db:
            apply_event(db,"resend",request.headers["svix-id"],provider_id,status)
    return {"received":True}

