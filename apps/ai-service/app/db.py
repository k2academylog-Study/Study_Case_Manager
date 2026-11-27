from contextlib import contextmanager
from dataclasses import dataclass
from uuid import UUID

import httpx
import psycopg
from fastapi import Header, HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import config
from hmac import compare_digest


@dataclass(frozen=True)
class Actor:
    user: UUID
    institution: UUID
    role: str
    staff_id: UUID | None
    token: str = ""


@contextmanager
def database():
    if not config().database_url:
        raise HTTPException(503, "Database access is awaiting configuration.")
    with psycopg.connect(config().database_url, row_factory=dict_row, connect_timeout=5) as connection:
        yield connection


def supabase_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "apikey": config().next_public_supabase_anon_key}


async def authorize(authorization: str = Header(default=""), x_internal_secret: str = Header(default="")):
    settings = config()
    if not settings.internal_api_secret or not settings.next_public_supabase_url or not settings.next_public_supabase_anon_key:
        raise HTTPException(503, "Service authentication is awaiting configuration.")
    if not compare_digest(settings.internal_api_secret, x_internal_secret):
        raise HTTPException(403, "Service authentication failed.")
    prefix, _, token = authorization.partition(" ")
    if prefix.lower() != "bearer" or not token:
        raise HTTPException(401, "A Supabase access token is required.")
    base = settings.next_public_supabase_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(f"{base}/auth/v1/user", headers=supabase_headers(token))
            if response.status_code in (401, 403):
                raise HTTPException(401, "The institutional session has expired.")
            response.raise_for_status()
            user_id = UUID(response.json()["id"])
    except (httpx.HTTPError, KeyError, ValueError):
        raise HTTPException(502, "The identity service could not verify this session.")
    return lookup_actor(user_id, token)


def lookup_actor(user: UUID, token: str = "") -> Actor:
    with database() as db:
        row = db.execute("""
            SELECT p.institution_id, p.staff_id, r.role
            FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
            LEFT JOIN public.staff s ON s.id=p.staff_id
            WHERE p.user_id=%s AND p.active AND (r.role='admin' OR s.active)
        """, (user,)).fetchone()
    if not row:
        raise HTTPException(403, "Institutional membership is unavailable.")
    return Actor(user, row["institution_id"], row["role"], row["staff_id"], token)


def admin(actor: Actor):
    if actor.role != "admin":
        raise HTTPException(403, "Administrator access is required.")


def begin_run(actor: Actor, agent: str, request_id: UUID) -> tuple[dict, bool]:
    if not config().model_ready:
        raise HTTPException(503, "GPT-4o mini is awaiting configuration.")
    with database() as db:
        db.execute("select pg_advisory_xact_lock(hashtextextended(%s,21))", (str(actor.user),))
        previous = db.execute("""
            select id,status,details from public.ai_agent_runs where institution_id=%s and user_id=%s and agent=%s and request_id=%s
        """, (actor.institution, actor.user, agent, request_id)).fetchone()
        if previous:
            return previous, False
        rule = db.execute("select ai_enabled,ai_daily_limit from public.institution_settings where institution_id=%s", (actor.institution,)).fetchone()
        if not rule or not rule["ai_enabled"]:
            raise HTTPException(403, "AI agents are disabled for this institution.")
        if actor.role == "staff" and agent == "assistant":
            permission = db.execute("select enabled from public.role_permissions where institution_id=%s and role='staff' and permission='academic_assistant'",
                                    (actor.institution,)).fetchone()
            if permission and not permission["enabled"]:
                raise HTTPException(403, "The institution has disabled the staff academic assistant.")
        count = db.execute("""
            select count(*) n from public.ai_agent_runs where institution_id=%s and user_id=%s
            and created_at>=now()-interval '1 day'
        """, (actor.institution, actor.user)).fetchone()["n"]
        if count >= rule["ai_daily_limit"]:
            raise HTTPException(429, "The institution’s daily AI request limit has been reached.")
        row = db.execute("""
            insert into public.ai_agent_runs(institution_id,user_id,agent,status,request_id)
            values(%s,%s,%s,'running',%s) returning id,status,details
        """, (actor.institution, actor.user, agent, request_id)).fetchone()
        return row, True


def finish_run(actor: Actor, run_id: UUID, state: str, details: dict, usage: tuple[int, int] = (0, 0), tools: list[dict] | None = None):
    with database() as db:
        db.execute("""
            update public.ai_agent_runs set status=%s,details=%s where institution_id=%s and user_id=%s and id=%s
        """, (state, Jsonb(details), actor.institution, actor.user, run_id))
        if any(usage):
            ins, outs = usage
            settings = config()
            cost = (ins * settings.ai_input_usd_per_million + outs * settings.ai_output_usd_per_million) / 1_000_000
            db.execute("""
                insert into public.ai_usage_logs(institution_id,run_id,user_id,model,input_tokens,output_tokens,estimated_usd)
                values(%s,%s,%s,'gpt-4o-mini',%s,%s,%s)
            """, (actor.institution, run_id, actor.user, ins, outs, cost))
        for tool in tools or []:
            db.execute("""
                insert into public.ai_tool_execution_logs(institution_id,run_id,tool,result_count,status)
                values(%s,%s,%s,%s,'completed')
            """, (actor.institution, run_id, tool["tool"], tool["count"]))

