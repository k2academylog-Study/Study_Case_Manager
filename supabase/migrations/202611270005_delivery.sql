begin;
alter table public.students add column guardian_contact_verified boolean not null default false;
alter table public.communication_delivery_logs add column created_by_approval uuid;
create index pending_delivery_work on public.communication_delivery_logs(status,created_at) where status in ('queued','sending');
create index unapplied_provider_events on public.provider_webhook_events(provider,provider_id) where applied_at is null;
create unique index one_result_per_ai_run on public.ai_analysis_results(run_id);

-- Keep service checkpoints out of PostgREST exposes. Application credentials must not be used in browser code.
create schema if not exists scm_agent;
revoke all on schema scm_agent from public,anon,authenticated;
commit;
