begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.institutions(id,name) values
 ('20000000-0000-4000-8000-000000000001','Test Institution'),('20000000-0000-4000-8000-000000000002','Other Institution');
insert into public.institution_settings(institution_id,institution_name) values ('20000000-0000-4000-8000-000000000001','Test Institution');
insert into public.staff(id,institution_id,name) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Test Teacher'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Unassigned Teacher');
insert into public.profiles(id,institution_id,user_id,display_name,staff_id) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test Administrator',null),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Test Teacher','30000000-0000-4000-8000-000000000001');
insert into public.user_roles(institution_id,profile_id,role) values
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','admin'),
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','staff');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare
  org constant uuid:='20000000-0000-4000-8000-000000000001';
  teacher constant uuid:='30000000-0000-4000-8000-000000000001';
  a uuid; c uuid; b uuid; b2 uuid; y uuid; subject uuid; syllabus uuid; chapter uuid; topic uuid; pupil uuid; schedule uuid; exam uuid; sid uuid; sid2 uuid; q uuid;
  payload jsonb;
begin
  if (select count(*) from public.institutions)<>1 or not public.actor_admin() then raise exception 'Institution boundary failed'; end if;
  insert into public.academic_years(institution_id,name,starts_on,ends_on) values(org,'Test year','2026-01-01','2027-12-31') returning id into y;
  insert into public.classes(institution_id,name) values(org,'Class 6') returning id into c;
  insert into public.batches(institution_id,class_id,academic_year_id,name) values(org,c,y,'Batch A') returning id into b;
  insert into public.batches(institution_id,class_id,academic_year_id,name) values(org,c,y,'Private batch') returning id into b2;
  insert into public.subjects(institution_id,name) values(org,'Mathematics') returning id into subject;
  insert into public.staff_assignments(institution_id,batch_id,staff_id,subject_id) values(org,b,teacher,subject) returning id into a;
  insert into public.syllabi(institution_id,class_id,academic_year_id,subject_id,name) values(org,c,y,subject,'Mathematics') returning id into syllabus;
  insert into public.chapters(institution_id,syllabus_id,name) values(org,syllabus,'Algebra') returning id into chapter;
  insert into public.topics(institution_id,chapter_id,name) values(org,chapter,'Linear equations') returning id into topic;
  pupil:=public.save_student_profile(gen_random_uuid(),jsonb_build_object('batch_id',b,'name','Eligible Student','admission_number','test-1','admission_date','2026-01-01'),true);
  perform public.save_student_profile(gen_random_uuid(),jsonb_build_object('batch_id',b2,'name','Private Student','admission_number','test-2','admission_date','2026-01-01'),true);
  insert into public.timetable_entries(institution_id,staff_assignment_id,title,starts_at,ends_at)
    values(org,a,'Algebra','2026-11-01T09:00+05:30','2026-11-01T09:45+05:30') returning id into schedule;
  begin
    insert into public.timetable_entries(institution_id,staff_assignment_id,title,starts_at,ends_at)
      values(org,a,'Conflicting','2026-11-01T09:15+05:30','2026-11-01T10:00+05:30');
    raise exception 'Conflict admitted' using errcode='23000';
  exception when raise_exception then if sqlerrm not like '%already has a class%' then raise; end if;
  end;
  insert into public.assessments(institution_id,staff_assignment_id,title,assessment_type,assessment_on,max_marks,pass_marks)
    values(org,a,'Unit test','unit_test','2026-11-01',50,20) returning id into exam;

  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  if (select count(*) from public.staff)<>1 or public.actor_admin() or (select count(*) from public.students)<>1 or (select count(*) from public.batches)<>1 then
    raise exception 'Staff isolation failed';
  end if;
  begin
    insert into public.classes(institution_id,name) values(org,'Forbidden');
    raise exception 'Staff wrote an administrator record' using errcode='23000';
  exception when insufficient_privilege then null;
  end;
  begin
    perform guardian_email from public.students;
    raise exception 'Staff read private guardian contacts' using errcode='23000';
  exception when insufficient_privilege then null;
  end;
  payload:=jsonb_build_object('staff_assignment_id',a,'timetable_id',schedule,'date','2026-11-01','status','completed','duration_minutes',45,'request_id',gen_random_uuid());
  sid:=public.record_class_session(payload,array[topic],array[]::uuid[],jsonb_build_array(jsonb_build_object('student_id',pupil,'status','present')));
  sid2:=public.record_class_session(payload,array[topic],array[]::uuid[],jsonb_build_array(jsonb_build_object('student_id',pupil,'status','late')));
  if sid<>sid2 or (select count(*) from public.attendance_records where session_id=sid)<>1 or
    (select status from public.attendance_records where session_id=sid)<>'late' or
    (select completion from public.topic_progress where topic_id=topic)<>100 then
    raise exception 'Session idempotency or syllabus update failed';
  end if;
  begin
    insert into public.assessment_scores(institution_id,assessment_id,student_id,status,marks,draft)
      values(org,exam,pupil,'evaluated',51,false);
    raise exception 'Invalid marks admitted' using errcode='23000';
  exception when raise_exception then if sqlerrm not like '%configured maximum%' then raise; end if;
  end;
  insert into public.assessment_scores(institution_id,assessment_id,student_id,status,marks,draft)
    values(org,exam,pupil,'evaluated',45,false);
  perform public.save_work_topics('assessments',exam,array[topic],jsonb_build_array(jsonb_build_object('topic_id',topic,'question_number',1,'max_marks',20)));
  select id into q from public.assessment_questions where assessment_id=exam and question_number=1;
  perform public.save_assessment_roster(exam,jsonb_build_array(jsonb_build_object(
    'student_id',pupil,'status','evaluated','marks',46,'question_marks',jsonb_build_object(q,19))),false);
  if (select marks from public.assessment_question_scores where question_id=q)<>19 then raise exception 'Question score was not persisted'; end if;
  begin
    perform public.save_assessment_roster(exam,jsonb_build_array(jsonb_build_object(
      'student_id',pupil,'status','evaluated','marks',47,'question_marks',jsonb_build_object(q,21))),false);
    raise exception 'Invalid question marks admitted' using errcode='23000';
  exception when raise_exception then if sqlerrm not like '%question and its mark maximum%' then raise; end if;
  end;
  if (select marks from public.assessment_scores where assessment_id=exam and student_id=pupil)<>46 then raise exception 'Roster changes did not roll back'; end if;
  if (select count(*) from public.audit_logs)<>0 then raise exception 'Staff could see audit logs'; end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  if (select count(*) from public.audit_logs where record_id=sid and table_name='class_sessions')<>2 then raise exception 'Missing audited correction'; end if;
  insert into public.role_permissions(institution_id,role,permission,enabled) values(org,'staff','record_sessions',false);
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
  if public.actor_permission('record_sessions') then raise exception 'Staff capability was not disabled'; end if;
  begin
    perform public.record_class_session(payload,array[topic],array[]::uuid[],jsonb_build_array(jsonb_build_object('student_id',pupil,'status','present')));
    raise exception 'Staff bypassed the role permission' using errcode='23000';
  exception when raise_exception then if sqlerrm not like '%assignment is unavailable%' then raise; end if;
  end;
end $$;
rollback;
