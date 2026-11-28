alter table public.students add column if not exists stream text;

create or replace function public.save_student_profile(p_id uuid, p_value jsonb, p_create boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  form public.students;
  saved uuid;
  site uuid:=public.actor_institution();
begin
  if not public.actor_admin() then raise exception 'Administrator access is required' using errcode='42501'; end if;
  form:=jsonb_populate_record(null::public.students, p_value);
  if char_length(trim(form.name)) not between 1 and 250 or char_length(trim(form.admission_number)) not between 1 and 250 then
    raise exception 'Enter a student name and admission number';
  end if;
  if p_create then
    insert into public.students(id,institution_id,batch_id,name,admission_number,birth_date,gender,admission_date,
      guardian_name,guardian_phone,guardian_email,guardian_contact_verified,guardian_email_consent,guardian_whatsapp_consent,
      emergency_contact,address,academic_status,active,stream)
    values(p_id,site,form.batch_id,trim(form.name),trim(form.admission_number),form.birth_date,form.gender,form.admission_date,
      form.guardian_name,form.guardian_phone,form.guardian_email,coalesce(form.guardian_contact_verified,false),
      coalesce(form.guardian_email_consent,false),coalesce(form.guardian_whatsapp_consent,false),form.emergency_contact,form.address,
      coalesce(form.academic_status,'enrolled'),coalesce(form.active,true),form.stream)
    on conflict(id) do nothing returning id into saved;
    if saved is null then select id into saved from public.students where id=p_id and institution_id=site; end if;
  else
    update public.students set batch_id=form.batch_id,name=trim(form.name),admission_number=trim(form.admission_number),
      birth_date=form.birth_date,gender=form.gender,admission_date=form.admission_date,guardian_name=form.guardian_name,
      guardian_phone=form.guardian_phone,guardian_email=form.guardian_email,guardian_contact_verified=form.guardian_contact_verified,
      guardian_email_consent=form.guardian_email_consent,guardian_whatsapp_consent=form.guardian_whatsapp_consent,
      emergency_contact=form.emergency_contact,address=form.address,academic_status=form.academic_status,active=form.active,
      stream=form.stream
    where id=p_id and institution_id=site returning id into saved;
  end if;
  if saved is null then raise exception 'This student profile is unavailable' using errcode='42501'; end if;
  return saved;
end $$;
