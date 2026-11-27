begin;
create table public.api_rate_limits(
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  window_start timestamptz not null,
  requests integer not null,
  primary key(user_id,route,window_start)
);
create index api_rate_limits_retention on public.api_rate_limits(window_start);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public,anon,authenticated;
create function public.consume_api_quota(p_route text) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  slot timestamptz:=date_trunc('minute',clock_timestamp());
  cap int:=case p_route when 'academic' then 45 when 'files' then 10 when 'reports' then 8 when 'agent_write' then 30 when 'provider_check' then 4 end;
  count int;
begin
  if actor is null or cap is null or public.actor_institution() is null then return false; end if;
  if random()<0.02 then delete from public.api_rate_limits where window_start<slot-interval '1 day'; end if;
  insert into public.api_rate_limits(user_id,route,window_start,requests)
    values(actor,p_route,slot,1) on conflict(user_id,route,window_start) do update
    set requests=public.api_rate_limits.requests+1 where public.api_rate_limits.requests<cap returning requests into count;
  return count is not null;
end $$;
revoke all on function public.consume_api_quota(text) from public,anon;
grant execute on function public.consume_api_quota(text) to authenticated;
commit;
