-- Development-only fictional institution. No authentication accounts or sendable contacts.
do $$
declare
  institution constant uuid:='20000000-0000-4000-8000-100000000001';
  school_year uuid; level uuid; batch uuid; subject uuid; teacher uuid; allocation uuid;
begin
  insert into public.institutions(id,name,demo) values(institution,'Northview Academy — Demonstration',true) on conflict(id) do nothing;
  insert into public.institution_settings(institution_id,institution_name) values(institution,'Northview Academy — Demonstration') on conflict(institution_id) do nothing;
  insert into public.academic_years(institution_id,name,starts_on,ends_on)
    values(institution,'Demo academic year',current_date-60,current_date+240)
    on conflict(institution_id,name) do update set name=excluded.name returning id into school_year;
  for grade in 6..12 loop
    insert into public.classes(institution_id,name) values(institution,'Class '||grade)
      on conflict(institution_id,name) do update set name=excluded.name returning id into level;
    insert into public.batches(institution_id,class_id,academic_year_id,name) values(institution,level,school_year,'Batch A')
      on conflict(class_id,academic_year_id,name) do update set name=excluded.name returning id into batch;
    insert into public.students(institution_id,batch_id,name,admission_number,admission_date)
      values(institution,batch,'Demo Student '||grade,'DEMO-'||grade,current_date-21) on conflict(institution_id,admission_number) do nothing;
  end loop;
  insert into public.subjects(institution_id,name) values(institution,'Mathematics')
    on conflict(institution_id,name) do update set name=excluded.name returning id into subject;
  insert into public.staff(institution_id,name,email) values(institution,'Demo Teacher','demo.teacher@example.test')
    on conflict(institution_id,email) do update set name=excluded.name returning id into teacher;
  insert into public.staff_assignments(institution_id,batch_id,staff_id,subject_id) values(institution,batch,teacher,subject)
    on conflict(staff_id,batch_id,subject_id) do nothing;
end $$;
