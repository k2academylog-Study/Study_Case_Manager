begin;
create function public.sync_enrollment() returns trigger language plpgsql security definer set search_path='' as $$
declare d date; original date;
begin
  if tg_op='INSERT' or new.batch_id is distinct from old.batch_id or new.active is distinct from old.active then
    select (now() at time zone coalesce(s.timezone,'Asia/Kolkata'))::date into d
      from public.institutions i left join public.institution_settings s on i.id=s.institution_id where i.id=new.institution_id;
    if tg_op='INSERT' then d:=coalesce(new.admission_date,d); end if;
    select starts_on into original from public.student_enrollments where student_id=new.id and ends_on is null;
    if original is not null then
       if original>=d and new.active then
          update public.student_enrollments set batch_id=new.batch_id where student_id=new.id and ends_on is null;
          return new;
       end if;
       update public.student_enrollments set ends_on=greatest(starts_on,d-1) where student_id=new.id and ends_on is null;
    end if;
    if new.active then insert into public.student_enrollments(institution_id,student_id,batch_id,starts_on)
       values(new.institution_id,new.id,new.batch_id,d); end if;
  end if;
  return new;
end $$;
create trigger student_enrollment after insert or update on public.students for each row execute function public.sync_enrollment();

create function public.validate_timezone() returns trigger language plpgsql set search_path='' as $$
begin
  if (new.opens_at is null)<>(new.closes_at is null) or new.opens_at>=new.closes_at then
    raise exception 'Specify both working hours, with closing time after opening time';
  end if;
  if cardinality(new.working_days) not between 1 and 7 or not new.working_days<@array[1,2,3,4,5,6,7]::smallint[] then
    raise exception 'Specify valid working days';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'Choose a valid IANA time zone';
  end if;
  return new;
end $$;
create trigger settings_timezone before insert or update on public.institution_settings for each row execute function public.validate_timezone();

create function public.validate_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.staff_assignments; rules public.institution_settings; local_start timestamp; local_end timestamp;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.institution_id::text,0));
  if tg_table_name='calendar_events' then
    if new.event_type='holiday' and exists(
      select 1 from public.timetable_entries e join public.staff_assignments t on t.id=e.staff_assignment_id
      where e.institution_id=new.institution_id and e.status<>'cancelled' and (new.batch_id is null or t.batch_id=new.batch_id)
        and e.starts_at<new.ends_at and e.ends_at>new.starts_at) then
      raise exception 'Cancel or reschedule overlapping classes before creating this holiday';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' and (old.staff_assignment_id,old.starts_at,old.ends_at,old.status) is distinct from (new.staff_assignment_id,new.starts_at,new.ends_at,new.status) then
    if exists(select 1 from public.class_sessions c where c.timetable_id=old.id) then
      raise exception 'A timetable entry with a saved session cannot be changed';
    end if;
    insert into public.timetable_history(institution_id,timetable_id,previous_start,previous_end,status,actor_id)
      values(old.institution_id,old.id,old.starts_at,old.ends_at,old.status,auth.uid());
    if new.status<>'cancelled' and (old.starts_at,old.ends_at) is distinct from (new.starts_at,new.ends_at) then new.status:='rescheduled'; end if;
  end if;
  if new.status='cancelled' then return new; end if;
  select * into a from public.staff_assignments where id=new.staff_assignment_id;
  if not coalesce(a.active,false) then raise exception 'Select an active teaching assignment'; end if;
  select * into rules from public.institution_settings where institution_id=new.institution_id;
  if rules.opens_at is not null and rules.closes_at is not null then
    local_start:=new.starts_at at time zone rules.timezone;
    local_end:=new.ends_at at time zone rules.timezone;
    if local_start::date<>local_end::date or local_start::time<rules.opens_at or local_end::time>rules.closes_at or
       not (extract(isodow from local_start)::smallint=any(rules.working_days)) then
       raise exception 'The class falls outside the configured institutional hours';
    end if;
  end if;
  if exists(select 1 from public.timetable_entries e join public.staff_assignments t on t.id=e.staff_assignment_id
      where e.institution_id=new.institution_id and e.id<>new.id and e.status<>'cancelled'
         and (t.batch_id=a.batch_id or t.staff_id=a.staff_id) and e.starts_at<new.ends_at and e.ends_at>new.starts_at) then
    raise exception 'The staff member or batch already has a class during this period';
  end if;
  if exists(select 1 from public.calendar_events e where e.institution_id=new.institution_id and e.event_type='holiday'
      and (e.batch_id is null or e.batch_id=a.batch_id) and e.starts_at<new.ends_at and e.ends_at>new.starts_at) then
    raise exception 'A holiday overlaps this session';
  end if;
  return new;
end $$;
create trigger timetable_conflicts before insert or update on public.timetable_entries for each row execute function public.validate_schedule();
create trigger calendar_conflicts before insert or update on public.calendar_events for each row execute function public.validate_schedule();

create function public.schedule_recurrence(p_value jsonb,p_weeks int) returns setof public.timetable_entries
language plpgsql security invoker set search_path='' as $$
declare n int; series uuid:=gen_random_uuid(); zone text; starts timestamptz; ends timestamptz;
begin
  if not public.actor_admin() or p_weeks not between 2 and 52 then raise exception 'Invalid recurring schedule'; end if;
  select timezone into zone from public.institution_settings limit 1;
  zone:=coalesce(zone,'Asia/Kolkata');
  starts:=(p_value->>'starts_at')::timestamptz; ends:=(p_value->>'ends_at')::timestamptz;
  for n in 0..p_weeks-1 loop
    return query insert into public.timetable_entries(institution_id,staff_assignment_id,title,starts_at,ends_at,recurrence_id)
      values(public.actor_institution(),(p_value->>'staff_assignment_id')::uuid,p_value->>'title',
        ((starts at time zone zone)+n*interval '7 days') at time zone zone,
        ((ends at time zone zone)+n*interval '7 days') at time zone zone,series) returning *;
  end loop;
end $$;
revoke all on function public.schedule_recurrence(jsonb,int) from public,anon;
grant execute on function public.schedule_recurrence(jsonb,int) to authenticated;

create function public.teachable_topic(a uuid,t uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.staff_assignments l join public.batches b on b.id=l.batch_id
    join public.syllabi s on s.class_id=b.class_id and s.academic_year_id=b.academic_year_id and s.subject_id=l.subject_id
    join public.chapters c on c.syllabus_id=s.id join public.topics p on p.chapter_id=c.id
    where l.id=a and p.id=t)
$$;
revoke all on function public.teachable_topic(uuid,uuid) from public,anon,authenticated;

create function public.topic_progress_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not public.teachable_topic(new.staff_assignment_id,new.topic_id) or
    (new.subtopic_id is not null and not exists(select 1 from public.subtopics where id=new.subtopic_id and topic_id=new.topic_id)) then
    raise exception 'This topic is outside the selected teaching assignment';
  end if;
  if new.completion>0 then new.actual_starts_on:=coalesce(new.actual_starts_on,current_date); end if;
  if new.completion=100 then
    new.completed_on:=coalesce(new.completed_on,current_date);
    if new.status<>'revision_required' then new.status:='completed'; end if;
  else
    new.completed_on:=null;
    if new.status='completed' then raise exception 'A completed topic must have 100%% progress'; end if;
  end if;
  return new;
end $$;
create trigger progress_guard before insert or update on public.topic_progress for each row execute function public.topic_progress_guard();
create function public.record_progress() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or (old.completion,old.status) is distinct from (new.completion,new.status) then
    insert into public.syllabus_progress_history(institution_id,progress_id,completion,status,actor_id)
    values(new.institution_id,new.id,new.completion,new.status,auth.uid());
  end if;
  return new;
end $$;
create trigger progress_history after insert or update on public.topic_progress for each row execute function public.record_progress();

create function public.record_class_session(p_session jsonb,p_topics uuid[],p_subtopics uuid[],p_roster jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  sid uuid; a public.staff_assignments; existing public.class_sessions; scheduled public.timetable_entries;
  inst uuid:=public.actor_institution(); topic uuid; subtopic uuid; parent uuid; roster jsonb; eligible int;
  day date:=(p_session->>'date')::date; request uuid:=(p_session->>'request_id')::uuid;
  scheduled_id uuid:=(p_session->>'timetable_id')::uuid; staff_assignment uuid:=(p_session->>'staff_assignment_id')::uuid;
  state text:=p_session->>'status'; is_revision boolean:=coalesce((p_session->>'revision')::boolean,false);
  started_at timestamptz:=(p_session->>'actual_start')::timestamptz; ended_at timestamptz:=(p_session->>'actual_end')::timestamptz;
begin
  if inst is null or not public.actor_permission('record_sessions') or not public.can_teach(staff_assignment) or state is null or state not in ('draft','completed') or request is null then
    raise exception 'This teaching assignment is unavailable';
  end if;
  if jsonb_typeof(p_roster) is distinct from 'array' or jsonb_array_length(p_roster)>2000 or cardinality(p_topics)>500 or cardinality(p_subtopics)>500 then
    raise exception 'Invalid roster or topic list';
  end if;
  select * into a from public.staff_assignments where id=staff_assignment;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(scheduled_id,request)::text,13));
  if scheduled_id is not null then
    select * into scheduled from public.timetable_entries where id=scheduled_id for update;
    if scheduled.id is null or scheduled.staff_assignment_id<>a.id or scheduled.status='cancelled' or
      day<>(scheduled.starts_at at time zone coalesce((select timezone from public.institution_settings where institution_id=inst),'Asia/Kolkata'))::date then
      raise exception 'The timetable entry is unavailable';
    end if;
  end if;
  select * into existing from public.class_sessions
    where request_id=request or (scheduled_id is not null and timetable_id=scheduled_id) for update;
  if existing.id is not null and (existing.institution_id<>inst or existing.staff_assignment_id<>a.id or
    (existing.status='completed' and (state<>'completed' or existing.date<>day or existing.request_id<>request))) then
    raise exception 'The session has already been submitted or has a different assignment';
  end if;
  if existing.id is null then
    insert into public.class_sessions(institution_id,staff_assignment_id,timetable_id,date,duration_minutes,status,notes,revision,request_id,actual_start,actual_end)
    values(inst,a.id,scheduled_id,day,(p_session->>'duration_minutes')::int,state,p_session->>'notes',is_revision,request,started_at,ended_at) returning id into sid;
  else
    sid:=existing.id;
    update public.class_sessions set duration_minutes=(p_session->>'duration_minutes')::int,status=state,date=day,
      notes=p_session->>'notes',revision=is_revision,actual_start=started_at,
      actual_end=ended_at where id=sid;
  end if;
  if state='completed' then
    select count(distinct student_id) into eligible from public.student_enrollments e
      where e.batch_id=a.batch_id and e.starts_on<=day and (e.ends_on is null or e.ends_on>=day);
    if eligible<>jsonb_array_length(p_roster) or eligible<>(select count(distinct value->>'student_id') from jsonb_array_elements(p_roster)) then
      raise exception 'Record an attendance status for every eligible student';
    end if;
  end if;
  delete from public.session_topics where session_id=sid;
  delete from public.session_subtopics where session_id=sid;
  foreach topic in array coalesce(p_topics,array[]::uuid[]) loop
    if not public.teachable_topic(a.id,topic) then raise exception 'A selected topic is outside this assignment'; end if;
    insert into public.session_topics(institution_id,session_id,topic_id,revision) values(inst,sid,topic,is_revision) on conflict do nothing;
    if state='completed' and not is_revision then
      insert into public.topic_progress(institution_id,staff_assignment_id,topic_id,completion,status,actual_starts_on,completed_on)
        values(inst,a.id,topic,100,'completed',day,day)
        on conflict(staff_assignment_id,topic_id,subtopic_id) do update set completion=100,status='completed',
          completed_on=coalesce(public.topic_progress.completed_on,excluded.completed_on);
    end if;
  end loop;
  foreach subtopic in array coalesce(p_subtopics,array[]::uuid[]) loop
    select topic_id into parent from public.subtopics where id=subtopic;
    if parent is null or not public.teachable_topic(a.id,parent) then raise exception 'A selected subtopic is outside this assignment'; end if;
    insert into public.session_subtopics(institution_id,session_id,subtopic_id,revision) values(inst,sid,subtopic,is_revision) on conflict do nothing;
    if state='completed' and not is_revision then
      insert into public.topic_progress(institution_id,staff_assignment_id,topic_id,subtopic_id,completion,status,actual_starts_on,completed_on)
        values(inst,a.id,parent,subtopic,100,'completed',day,day)
        on conflict(staff_assignment_id,topic_id,subtopic_id) do update set completion=100,status='completed',
          completed_on=coalesce(public.topic_progress.completed_on,excluded.completed_on);
    end if;
  end loop;
  if state='draft' then delete from public.attendance_records where session_id=sid; delete from public.student_observations where session_id=sid; end if;
  for roster in select value from jsonb_array_elements(p_roster) loop
    if not exists(select 1 from public.student_enrollments e where e.student_id=(roster->>'student_id')::uuid and e.batch_id=a.batch_id
      and e.starts_on<=day and (e.ends_on is null or e.ends_on>=day)) then raise exception 'A student was outside the session roster'; end if;
    if roster->>'status' is not null then
      insert into public.attendance_records(institution_id,session_id,student_id,status,remarks)
      values(inst,sid,(roster->>'student_id')::uuid,roster->>'status',roster->>'remarks')
      on conflict(session_id,student_id) do update set status=excluded.status,remarks=excluded.remarks
      where (public.attendance_records.status,public.attendance_records.remarks) is distinct from (excluded.status,excluded.remarks);
    elsif state='completed' then raise exception 'Every student needs an attendance status'; end if;
    insert into public.student_observations(institution_id,session_id,student_id,attentiveness,participation,understanding,completed_classwork,needs_support,follow_up,remarks)
      values(inst,sid,(roster->>'student_id')::uuid,roster->>'attentiveness',roster->>'participation',roster->>'understanding',
         (roster->>'completed_classwork')::boolean,(roster->>'needs_support')::boolean,(roster->>'follow_up')::boolean,roster->>'observation')
      on conflict(session_id,student_id) do update set attentiveness=excluded.attentiveness,participation=excluded.participation,understanding=excluded.understanding,
        completed_classwork=excluded.completed_classwork,needs_support=excluded.needs_support,follow_up=excluded.follow_up,remarks=excluded.remarks;
  end loop;
  return sid;
end $$;
revoke all on function public.record_class_session(jsonb,uuid[],uuid[],jsonb) from public,anon;
grant execute on function public.record_class_session(jsonb,uuid[],uuid[],jsonb) to authenticated;

create function public.validate_score() returns trigger language plpgsql security definer set search_path='' as $$
declare batch uuid; max_score numeric; day date;
begin
  if tg_table_name='assessment_scores' then
    select a.batch_id,t.max_marks,t.assessment_on into batch,max_score,day from public.assessments t join public.staff_assignments a on a.id=t.staff_assignment_id
      where t.id=new.assessment_id for share of t;
    if tg_op='UPDATE' and not old.draft and new.draft then raise exception 'Finalized scores cannot be returned to draft'; end if;
  else
    select a.batch_id,t.max_marks,t.assigned_on into batch,max_score,day from public.assignments t join public.staff_assignments a on a.id=t.staff_assignment_id
      where t.id=new.assignment_id for share of t;
  end if;
  if not exists(select 1 from public.student_enrollments e where e.student_id=new.student_id and e.batch_id=batch
      and e.starts_on<=day and (e.ends_on is null or e.ends_on>=day)) then raise exception 'This student was outside the eligible roster'; end if;
  if new.marks is not null and (max_score is null or new.marks>max_score) then raise exception 'Marks must be within the configured maximum'; end if;
  return new;
end $$;
create trigger score_guard before insert or update on public.assessment_scores for each row execute function public.validate_score();
create trigger submission_guard before insert or update on public.assignment_submissions for each row execute function public.validate_score();

create function public.guard_academic_work() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='assessments' and exists(select 1 from public.assessment_scores where assessment_id=old.id
    and (marks>new.max_marks or old.staff_assignment_id<>new.staff_assignment_id or old.assessment_on<>new.assessment_on)) then
    raise exception 'Existing scores require the original roster, date, and a sufficient mark maximum';
  end if;
  if tg_table_name='assignments' and exists(select 1 from public.assignment_submissions where assignment_id=old.id
    and ((marks is not null and (new.max_marks is null or marks>new.max_marks))
    or old.staff_assignment_id<>new.staff_assignment_id or old.assigned_on<>new.assigned_on)) then
    raise exception 'Existing submissions require the original roster, date, and a sufficient mark maximum';
  end if;
  return new;
end $$;
create trigger assessment_integrity before update on public.assessments for each row execute function public.guard_academic_work();
create trigger assignment_integrity before update on public.assignments for each row execute function public.guard_academic_work();

-- Only expose notifications to Realtime clients that pass the regular SELECT policy.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
revoke all on function public.sync_enrollment(),public.validate_timezone(),public.validate_schedule(),public.topic_progress_guard(),
  public.record_progress(),public.validate_score(),public.guard_academic_work() from public,anon,authenticated;
commit;
