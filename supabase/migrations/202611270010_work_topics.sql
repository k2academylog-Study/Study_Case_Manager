begin;
create function public.validate_work_topic() returns trigger language plpgsql security definer set search_path='' as $$
declare allocation uuid; maximum numeric;
begin
  if tg_table_name='assignment_topics' then
    select staff_assignment_id,max_marks into allocation,maximum from public.assignments where id=new.assignment_id;
  else
    select staff_assignment_id,max_marks into allocation,maximum from public.assessments where id=new.assessment_id;
  end if;
  if new.topic_id is not null and not public.teachable_topic(allocation,new.topic_id) then
    raise exception 'A selected topic is outside the teaching assignment';
  end if;
  if tg_table_name='assessment_questions' then
    if new.max_marks>maximum then raise exception 'Question marks exceed the assessment maximum'; end if;
    if tg_op='UPDATE' and exists(select 1 from public.assessment_question_scores q where q.question_id=old.id) and
       (new.assessment_id,new.topic_id,new.max_marks) is distinct from (old.assessment_id,old.topic_id,old.max_marks) then
      raise exception 'A question with scores keeps its topic and maximum marks';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_work_topic() from public,anon,authenticated;
create trigger assignment_topic_scope before insert or update on public.assignment_topics for each row execute function public.validate_work_topic();
create trigger assessment_topic_scope before insert or update on public.assessment_topics for each row execute function public.validate_work_topic();
create trigger question_topic_scope before insert or update on public.assessment_questions for each row execute function public.validate_work_topic();

create function public.validate_question_score() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.assessment_scores s join public.assessment_questions q on q.assessment_id=s.assessment_id
      where s.id=new.score_id and q.id=new.question_id and s.status='evaluated' and new.marks<=q.max_marks) then
    raise exception 'Check the selected question and its mark maximum';
  end if;
  return new;
end $$;
revoke all on function public.validate_question_score() from public,anon,authenticated;
create trigger question_score_scope before insert or update on public.assessment_question_scores for each row execute function public.validate_question_score();

create function public.save_work_topics(p_kind text,p_parent uuid,p_topics uuid[],p_questions jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare site uuid:=public.actor_institution(); allocation uuid; topic uuid; maximum numeric; question jsonb;
begin
  if p_kind='assignments' then
    select staff_assignment_id into allocation from public.assignments where institution_id=site and id=p_parent for update;
  elsif p_kind='assessments' then
    select staff_assignment_id,max_marks into allocation,maximum from public.assessments where institution_id=site and id=p_parent for update;
  else return false;
  end if;
  if allocation is null or not public.can_teach(allocation) or not public.actor_permission(p_kind) then
    raise exception 'This academic record is unavailable' using errcode='42501';
  end if;
  if coalesce(cardinality(p_topics),0)>250 or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)>60 then
    raise exception 'The topic or question list is invalid';
  end if;
  if p_kind='assignments' then
    delete from public.assignment_topics where assignment_id=p_parent;
    foreach topic in array p_topics loop
      insert into public.assignment_topics(institution_id,assignment_id,topic_id) values(site,p_parent,topic) on conflict do nothing;
    end loop;
  else
    if (select coalesce(sum((value->>'max_marks')::numeric),0) from jsonb_array_elements(p_questions))>maximum then
      raise exception 'The mapped questions exceed the assessment maximum';
    end if;
    if (select count(*) from jsonb_array_elements(p_questions))<>(select count(distinct value->>'question_number') from jsonb_array_elements(p_questions)) then
      raise exception 'Use a different number for each question';
    end if;
    delete from public.assessment_topics where assessment_id=p_parent;
    foreach topic in array p_topics loop
      insert into public.assessment_topics(institution_id,assessment_id,topic_id) values(site,p_parent,topic) on conflict do nothing;
    end loop;
    delete from public.assessment_questions q where q.assessment_id=p_parent and not exists(
      select 1 from jsonb_array_elements(p_questions) where (value->>'question_number')::int=q.question_number);
    for question in select value from jsonb_array_elements(p_questions) loop
      insert into public.assessment_questions(institution_id,assessment_id,topic_id,question_number,max_marks)
      values(site,p_parent,(question->>'topic_id')::uuid,(question->>'question_number')::int,(question->>'max_marks')::numeric)
      on conflict(assessment_id,question_number) do update set topic_id=excluded.topic_id,max_marks=excluded.max_marks;
    end loop;
  end if;
  return true;
end $$;
revoke all on function public.save_work_topics(text,uuid,uuid[],jsonb) from public,anon;
grant execute on function public.save_work_topics(text,uuid,uuid[],jsonb) to authenticated;

create function public.save_assessment_roster(p_parent uuid,p_rows jsonb,p_draft boolean)
returns int language plpgsql security definer set search_path='' as $$
declare site uuid:=public.actor_institution(); allocation uuid; input_row jsonb; sid uuid; mapped record;
begin
  select staff_assignment_id into allocation from public.assessments where id=p_parent and institution_id=site for update;
  if allocation is null or not public.can_teach(allocation) or not public.actor_permission('assessments') then
    raise exception 'This assessment is unavailable' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'The assessment roster is invalid';
  end if;
  for input_row in select value from jsonb_array_elements(p_rows) loop
    insert into public.assessment_scores(institution_id,assessment_id,student_id,status,marks,feedback,draft)
    values(site,p_parent,(input_row->>'student_id')::uuid,input_row->>'status',(input_row->>'marks')::numeric,input_row->>'feedback',p_draft)
    on conflict(assessment_id,student_id) do update set status=excluded.status,marks=excluded.marks,feedback=excluded.feedback,draft=excluded.draft
    returning id into sid;
    if input_row->>'status'<>'evaluated' then
      delete from public.assessment_question_scores where score_id=sid;
    elsif jsonb_typeof(input_row->'question_marks')='object' then
      delete from public.assessment_question_scores where score_id=sid;
      for mapped in select key,value from jsonb_each_text(input_row->'question_marks') loop
        if mapped.value is null then continue; end if;
        insert into public.assessment_question_scores(institution_id,score_id,question_id,marks)
        values(site,sid,mapped.key::uuid,mapped.value::numeric);
      end loop;
      if (select sum(marks) from public.assessment_question_scores where score_id=sid)>(input_row->>'marks')::numeric then
        raise exception 'Mapped question marks exceed the student’s total score';
      end if;
    end if;
  end loop;
  return jsonb_array_length(p_rows);
end $$;
revoke all on function public.save_assessment_roster(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_assessment_roster(uuid,jsonb,boolean) to authenticated;
commit;
