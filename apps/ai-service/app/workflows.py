from contextlib import contextmanager
from hashlib import sha256
from datetime import datetime
from typing import TypedDict
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import END, START, StateGraph
from psycopg.types.json import Jsonb
from psycopg.conninfo import make_conninfo

from .config import config
from .db import Actor, database
from .model import model_call, PERFORMANCE, ASSISTANT_PLAN, ASSISTANT_ANSWER
from .schemas import Analyze, AnalysisAnswer, AssistantAnswer, AssistantPlan, AssistantQuery, DraftRequest, Filters, QueryTool
from .tools import BUNDLE_METRICS, calculate_performance, load_bundle, mean, run_tool, tool_filters


@contextmanager
def checkpointer():
    if not config().database_url:
        raise HTTPException(503,"Persistent workflow storage is awaiting configuration.")
    with PostgresSaver.from_conn_string(make_conninfo(config().database_url,options="-c search_path=scm_agent,pg_catalog")) as saver:
        yield saver


def initialize_checkpoints():
    with checkpointer() as saver:
        saver.setup()


class PerformanceState(TypedDict, total=False):
    evidence: dict
    finding_batches: list
    result: dict
    scope: dict


def performance(actor: Actor, request: Analyze, run_id: UUID, usage: list[int]):
    filters=Filters.model_validate(request.model_dump(exclude={"request_id"}))
    def gather(_state):
        bundle=load_bundle(actor,filters,BUNDLE_METRICS|{"academic_interventions","generated_reports"})
        if len(bundle["students"])>150:
            raise HTTPException(422,"Choose a cohort of 150 students or fewer for an AI analysis.")
        verified=calculate_performance(bundle)
        return {"evidence":verified,"scope":{key:str(bundle[key]) for key in ("from","to")}}
    def interpret(state):
        evidence=state["evidence"]
        flagged={key:value for key,value in evidence.items() if value["flags"]}
        keys=list(flagged)
        results=[]
        for i in range(0,len(keys),12):
            payload={key:flagged[key] for key in keys[i:i+12]}
            answer=model_call(AnalysisAnswer,PERFORMANCE,{"period":state["scope"],"verified_evidence":payload},usage)
            seen=set()
            for finding in answer.findings:
                identifier=str(finding.student_id)
                if identifier not in payload or identifier in seen or any(key not in payload[identifier] or payload[identifier][key] is None for key in finding.evidence_keys):
                    raise ValueError("AI returned an unsupported evidence reference.")
                seen.add(identifier)
                results.append(finding.model_dump(mode="json"))
            # Flagged records omitted by the model remain visible with deterministic evidence.
            for identifier in payload.keys()-seen:
                results.append({"student_id":identifier,"summary":"The verified indicators meet one or more configured review thresholds.",
                                "recommendations":["Review the flagged records and decide whether follow-up is appropriate."],"evidence_keys":["flags"]})
        return {"finding_batches":results}
    def persist(state):
        academic=state["evidence"]
        attendance=[v["attendance"] for v in academic.values() if v["attendance"] is not None]
        scores=[v["average_assessment"] for v in academic.values() if v["average_assessment"] is not None]
        unobserved=[label for label,values in (("Eligible attendance",attendance),("Finalized assessments",scores)) if not values]
        if not academic:
            unobserved.append("No eligible students")
        result={"analyzed":len(academic),"average_attendance":mean(attendance),"average_assessment":mean(scores),
                "findings":state.get("finding_batches",[]),"missing":unobserved,"evidence":academic,"period":state["scope"]}
        with database() as db:
            row=db.execute("""
                insert into public.ai_analysis_results(institution_id,run_id,filters,result)
                values(%s,%s,%s,%s) returning id
            """,(actor.institution,run_id,Jsonb(filters.model_dump(mode="json")),Jsonb(result))).fetchone()
            for sid, indicators in academic.items():
                db.execute("insert into public.ai_analysis_evidence(institution_id,analysis_id,evidence_key,value) values(%s,%s,%s,%s)",
                           (actor.institution,row["id"],sid,Jsonb(indicators)))
        return {"result":{"id":str(row["id"]),**result}}
    workflow=StateGraph(PerformanceState)
    workflow.add_node("retrieve_and_calculate",gather)
    workflow.add_node("interpret_verified_metrics",interpret)
    workflow.add_node("validate_and_save",persist)
    workflow.add_edge(START,"retrieve_and_calculate")
    workflow.add_conditional_edges("retrieve_and_calculate",lambda state:"interpret_verified_metrics" if any(v["flags"] for v in state["evidence"].values()) else "validate_and_save",
                                   ["interpret_verified_metrics","validate_and_save"])
    workflow.add_edge("interpret_verified_metrics","validate_and_save")
    workflow.add_edge("validate_and_save",END)
    # Performance evidence stays in institution-scoped result tables.
    result=workflow.compile().invoke({})
    return result["result"]


class AssistantState(TypedDict, total=False):
    plan: dict
    sources: list
    handoff: dict
    answer: dict


def access_scope(db,actor: Actor):
    current=[str(actor.institution),actor.role]
    if actor.role=="staff":
        assignments=db.execute("""
            select id,batch_id,subject_id from public.staff_assignments where institution_id=%s and staff_id=%s and active order by id
        """,(actor.institution,actor.staff_id)).fetchall()
        current.extend(":".join(str(value) for value in row.values()) for row in assignments)
    return sha256("|".join(current).encode()).hexdigest()


def conversation(actor: Actor, conversation_id: UUID):
    with database() as db:
        row=db.execute("""
            select id,title,summary from public.ai_conversations where id=%s and user_id=%s and institution_id=%s and access_scope=%s
        """,(conversation_id,actor.user,actor.institution,access_scope(db,actor))).fetchone()
        if not row:
            raise HTTPException(404,"Conversation not found.")
        history=db.execute("""
            select id,role,body,sources from (
              select id,role,body,sources,created_at from public.ai_messages where conversation_id=%s and institution_id=%s
              order by created_at desc,id desc limit 100
            ) recent order by created_at asc,id asc
        """,(conversation_id,actor.institution)).fetchall()
        row["messages"]=[{"id":item["id"],"role":item["role"],"body":item["body"],
                          **(item["sources"] or {})} for item in history]
        return row


def assistant(actor: Actor,request: AssistantQuery,usage:list[int],on_handoff):
    past=conversation(actor,request.conversation_id) if request.conversation_id else {}
    history=[{"role":r["role"],"body":r["body"][:1200]} for r in past.get("messages",[])[-8:]]
    with database() as db:
        settings=db.execute("select timezone from public.institution_settings where institution_id=%s",(actor.institution,)).fetchone()
    today=datetime.now(ZoneInfo(settings["timezone"] if settings else "Asia/Kolkata")).date()
    def plan(_state):
        planned=model_call(AssistantPlan,ASSISTANT_PLAN,{"question":request.question,"history":history,"summary":past.get("summary"),
                                                        "role":actor.role,"today":str(today)},usage)
        return {"plan":planned.model_dump(mode="json")}
    def execute(state):
        requested=AssistantPlan.model_validate(state["plan"])
        results=[]
        for item in requested.tools:
            try:
                results.append(run_tool(actor,item))
            except HTTPException as exc:
                if exc.status_code not in (404,422):
                    raise
                results.append({"tool":item.tool,"count":0,"records":[],"limitation":exc.detail})
        return {"sources":results}
    def handoff(state):
        if actor.role!="admin":
            return {"handoff":{"note":"Creating reports, analyses and drafts requires administrator access."}}
        return {"handoff":on_handoff(AssistantPlan.model_validate(state["plan"]),state.get("sources",[]),request.question)}
    def answer(state):
        sources=state["sources"]
        connection=state.get("handoff",{})
        payload={"question":request.question,"verified_sources":sources,"handoff":connection.get("note")}
        result=model_call(AssistantAnswer,ASSISTANT_ANSWER,payload,usage)
        available={item["tool"]:item["count"] for item in sources}
        datasets=jsonable_encoder([{"tool":source["tool"],"count":source["count"],"records":source["records"][:12]}
                                  for source in sources if source.get("records")])
        return {"answer":{"body":result.body,"sources":[{"tool":key,"count":count} for key,count in available.items()],"datasets":datasets,
                          "links":connection.get("links",[]),"follow_up":result.follow_up}}
    graph=StateGraph(AssistantState)
    graph.add_node("plan",plan)
    graph.add_node("retrieve",execute)
    graph.add_node("handoff",handoff)
    graph.add_node("respond",answer)
    graph.add_edge(START,"plan")
    graph.add_edge("plan","retrieve")
    graph.add_conditional_edges("retrieve",lambda s:"handoff" if s["plan"]["handoff"]!="none" else "respond",["handoff","respond"])
    graph.add_edge("handoff","respond")
    graph.add_edge("respond",END)
    result=graph.compile().invoke({})["answer"]
    with database() as db:
        if request.conversation_id:
            conversation_id=request.conversation_id
            title=past["title"]
        else:
            title=request.question.strip().splitlines()[0][:90] or "Academic question"
            conversation_id=db.execute("insert into public.ai_conversations(institution_id,user_id,title,access_scope) values(%s,%s,%s,%s) returning id",
                                       (actor.institution,actor.user,title,access_scope(db,actor))).fetchone()["id"]
        db.execute("insert into public.ai_messages(institution_id,conversation_id,role,body) values(%s,%s,'user',%s)",
                   (actor.institution,conversation_id,request.question))
        message=db.execute("insert into public.ai_messages(institution_id,conversation_id,role,body,sources,created_at) values(%s,%s,'assistant',%s,%s,clock_timestamp()) returning id",
                           (actor.institution,conversation_id,result["body"],Jsonb({key:result[key] for key in ("sources","links","follow_up","datasets")}))).fetchone()
        if len(past.get("messages",[]))>=12:
            summary="Earlier topics: "+" | ".join(r["body"][:180] for r in past["messages"][:-8] if r["role"]=="user")
            db.execute("update public.ai_conversations set summary=%s where id=%s and institution_id=%s",(summary[:2000],conversation_id,actor.institution))
    return {"conversation_id":str(conversation_id),"title":title,"message":{"id":str(message["id"]),"role":"assistant",**result}}

