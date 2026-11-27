begin;

create function public.actor_permission(capability text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.actor_admin() or (public.actor_staff() is not null and coalesce((
    select enabled from public.role_permissions where institution_id=public.actor_institution()
    and role='staff' and permission=capability),true))
$$;
revoke all on function public.actor_permission(text) from public,anon;
grant execute on function public.actor_permission(text) to authenticated;

drop policy read_role_permissions on public.role_permissions;
create policy read_role_permissions on public.role_permissions for select to authenticated
  using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or role='staff'));

create policy restrict_staff_insert on public.topic_progress as restrictive for insert to authenticated
  with check (public.actor_permission('syllabus'));
create policy restrict_staff_update on public.topic_progress as restrictive for update to authenticated
  using (public.actor_permission('syllabus')) with check (public.actor_permission('syllabus'));

create policy restrict_staff_insert on public.assignments as restrictive for insert to authenticated
  with check (public.actor_permission('assignments'));
create policy restrict_staff_update on public.assignments as restrictive for update to authenticated
  using (public.actor_permission('assignments')) with check (public.actor_permission('assignments'));

create policy restrict_staff_insert on public.assignment_submissions as restrictive for insert to authenticated
  with check (public.actor_permission('assignments'));
create policy restrict_staff_update on public.assignment_submissions as restrictive for update to authenticated
  using (public.actor_permission('assignments')) with check (public.actor_permission('assignments'));

create policy restrict_staff_insert on public.assignment_topics as restrictive for insert to authenticated
  with check (public.actor_permission('assignments'));
create policy restrict_staff_update on public.assignment_topics as restrictive for update to authenticated
  using (public.actor_permission('assignments')) with check (public.actor_permission('assignments'));

create policy restrict_staff_insert on public.assessments as restrictive for insert to authenticated
  with check (public.actor_permission('assessments'));
create policy restrict_staff_update on public.assessments as restrictive for update to authenticated
  using (public.actor_permission('assessments')) with check (public.actor_permission('assessments'));

create policy restrict_staff_insert on public.assessment_scores as restrictive for insert to authenticated
  with check (public.actor_permission('assessments'));
create policy restrict_staff_update on public.assessment_scores as restrictive for update to authenticated
  using (public.actor_permission('assessments')) with check (public.actor_permission('assessments'));

create policy restrict_staff_insert on public.assessment_topics as restrictive for insert to authenticated
  with check (public.actor_permission('assessments'));
create policy restrict_staff_update on public.assessment_topics as restrictive for update to authenticated
  using (public.actor_permission('assessments')) with check (public.actor_permission('assessments'));

create policy restrict_staff_insert on public.assessment_questions as restrictive for insert to authenticated
  with check (public.actor_permission('assessments'));
create policy restrict_staff_update on public.assessment_questions as restrictive for update to authenticated
  using (public.actor_permission('assessments')) with check (public.actor_permission('assessments'));

create policy restrict_staff_insert on public.assessment_question_scores as restrictive for insert to authenticated
  with check (public.actor_permission('assessments'));
create policy restrict_staff_update on public.assessment_question_scores as restrictive for update to authenticated
  using (public.actor_permission('assessments')) with check (public.actor_permission('assessments'));


-- Visible rosters contain academic identity only. Administrators use explicit privileged profile operations.
revoke select,insert,update on public.students from authenticated;
grant select(id,institution_id,name,admission_number,batch_id,academic_status,active,created_at) on public.students to authenticated;
create function public.read_student_profiles(p_offset int default 0,p_limit int default 500,p_id uuid default null)
returns setof public.students language plpgsql stable security definer set search_path='' as $$
begin
  if not public.actor_admin() then raise exception 'Administrator access is required' using errcode='42501'; end if;
  return query select s.* from public.students s where s.institution_id=public.actor_institution() and (p_id is null or s.id=p_id)
    order by s.created_at desc,s.id offset greatest(p_offset,0) limit least(greatest(p_limit,1),500);
end $$;
revoke all on function public.read_student_profiles(int,int,uuid) from public,anon;
grant execute on function public.read_student_profiles(int,int,uuid) to authenticated;

create function public.save_student_profile(p_id uuid,p_value jsonb,p_create boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  form public.students;
  saved uuid;
  site uuid:=public.actor_institution();
begin
  if not public.actor_admin() then raise exception 'Administrator access is required' using errcode='42501'; end if;
  form:=jsonb_populate_record(null::public.students,p_value);
  if char_length(trim(form.name)) not between 1 and 250 or char_length(trim(form.admission_number)) not between 1 and 250 then
    raise exception 'Enter a student name and admission number';
  end if;
  if p_create then
    insert into public.students(id,institution_id,batch_id,name,admission_number,birth_date,gender,admission_date,
      guardian_name,guardian_phone,guardian_email,guardian_contact_verified,guardian_email_consent,guardian_whatsapp_consent,
      emergency_contact,address,academic_status,active)
    values(p_id,site,form.batch_id,trim(form.name),trim(form.admission_number),form.birth_date,form.gender,form.admission_date,
      form.guardian_name,form.guardian_phone,form.guardian_email,coalesce(form.guardian_contact_verified,false),
      coalesce(form.guardian_email_consent,false),coalesce(form.guardian_whatsapp_consent,false),form.emergency_contact,form.address,
      coalesce(form.academic_status,'enrolled'),coalesce(form.active,true))
    on conflict(id) do nothing returning id into saved;
    if saved is null then select id into saved from public.students where id=p_id and institution_id=site; end if;
  else
    update public.students set batch_id=form.batch_id,name=trim(form.name),admission_number=trim(form.admission_number),
      birth_date=form.birth_date,gender=form.gender,admission_date=form.admission_date,guardian_name=form.guardian_name,
      guardian_phone=form.guardian_phone,guardian_email=form.guardian_email,guardian_contact_verified=form.guardian_contact_verified,
      guardian_email_consent=form.guardian_email_consent,guardian_whatsapp_consent=form.guardian_whatsapp_consent,
      emergency_contact=form.emergency_contact,address=form.address,academic_status=form.academic_status,active=form.active
    where id=p_id and institution_id=site returning id into saved;
  end if;
  if saved is null then raise exception 'This student profile is unavailable' using errcode='42501'; end if;
  return saved;
end $$;
revoke all on function public.save_student_profile(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_student_profile(uuid,jsonb,boolean) to authenticated;

create function public.import_student_profiles(p_rows jsonb)
returns int language plpgsql security definer set search_path='' as $$
declare student jsonb;
begin
  if not public.actor_admin() then raise exception 'Administrator access is required' using errcode='42501'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 300 then
    raise exception 'Import between 1 and 300 profiles';
  end if;
  for student in select value from jsonb_array_elements(p_rows) loop
    perform public.save_student_profile(gen_random_uuid(),student,true);
  end loop;
  return jsonb_array_length(p_rows);
end $$;
revoke all on function public.import_student_profiles(jsonb) from public,anon;
grant execute on function public.import_student_profiles(jsonb) to authenticated;

alter table public.report_templates add column report_type text;
alter table public.report_templates add column signature_label text;
alter table public.institution_settings add column logo_path text;

create function public.validate_intervention() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or (new.student_id,new.staff_id) is distinct from (old.student_id,old.staff_id) then
    if not exists(select 1 from public.students s join public.staff_assignments a on a.batch_id=s.batch_id
      join public.staff t on t.id=a.staff_id where s.id=new.student_id and t.id=new.staff_id and t.active and a.active) then
      raise exception 'Assign an active teacher for the student’s batch';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_intervention() from public,anon,authenticated;
create trigger intervention_assignment before insert or update on public.academic_interventions for each row execute function public.validate_intervention();

commit;
