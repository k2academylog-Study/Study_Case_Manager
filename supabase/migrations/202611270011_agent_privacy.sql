begin;
alter table public.ai_conversations add column access_scope text;
revoke select on public.ai_conversations,public.ai_messages,public.ai_agent_runs from authenticated;
commit;
