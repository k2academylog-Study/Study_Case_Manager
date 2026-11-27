begin;
create function public.current_actor()
returns table(institution_id uuid, role text, staff_id uuid, display_name text)
language sql stable security definer set search_path='' as $$
  select p.institution_id,r.role,p.staff_id,p.display_name
  from public.profiles p join public.user_roles r on r.profile_id=p.id
  left join public.staff s on s.id=p.staff_id
  where p.user_id=auth.uid() and p.active
    and (r.role='admin' or (p.staff_id is not null and s.active))
$$;
create function public.actor_institution() returns uuid language sql stable security definer set search_path='' as $$
  select institution_id from public.current_actor()
$$;
create function public.actor_staff() returns uuid language sql stable security definer set search_path='' as $$
  select staff_id from public.current_actor()
$$;
create function public.actor_admin() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select role='admin' from public.current_actor()),false)
$$;
create function public.can_batch(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.staff_assignments a where a.batch_id=target and a.active and a.staff_id=public.actor_staff())
$$;
create function public.can_teach(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.staff_assignments a where a.id=target and a.institution_id=public.actor_institution()
    and (public.actor_admin() or a.active and a.staff_id=public.actor_staff()))
$$;
do $$
declare f regprocedure;
begin
  foreach f in array array['public.current_actor()'::regprocedure,'public.actor_institution()'::regprocedure,'public.actor_staff()'::regprocedure,
    'public.actor_admin()'::regprocedure,'public.can_batch(uuid)'::regprocedure,'public.can_teach(uuid)'::regprocedure]
  loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to authenticated',f);
  end loop;
end $$;
grant select on public.institutions to authenticated;
create policy members_read on public.institutions for select to authenticated using (id=(select public.actor_institution()));
grant select on public.staff to authenticated;
create policy read_staff on public.staff for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (id=(select public.actor_staff()))));
grant insert, update on public.staff to authenticated;
create policy insert_staff on public.staff for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_staff on public.staff for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.profiles to authenticated;
create policy read_profiles on public.profiles for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.user_roles to authenticated;
create policy read_user_roles on public.user_roles for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.role_permissions to authenticated;
create policy read_role_permissions on public.role_permissions for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.role_permissions to authenticated;
create policy insert_role_permissions on public.role_permissions for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_role_permissions on public.role_permissions for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.academic_years to authenticated;
create policy read_academic_years on public.academic_years for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.batches b where b.academic_year_id=academic_years.id))));
grant insert, update on public.academic_years to authenticated;
create policy insert_academic_years on public.academic_years for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_academic_years on public.academic_years for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.academic_terms to authenticated;
create policy read_academic_terms on public.academic_terms for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.academic_years y where y.id=academic_terms.academic_year_id))));
grant insert, update on public.academic_terms to authenticated;
create policy insert_academic_terms on public.academic_terms for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_academic_terms on public.academic_terms for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.institution_settings to authenticated;
create policy read_institution_settings on public.institution_settings for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (true)));
grant insert, update on public.institution_settings to authenticated;
create policy insert_institution_settings on public.institution_settings for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_institution_settings on public.institution_settings for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.classes to authenticated;
create policy read_classes on public.classes for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.batches b where b.class_id=classes.id))));
grant insert, update on public.classes to authenticated;
create policy insert_classes on public.classes for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_classes on public.classes for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.subjects to authenticated;
create policy read_subjects on public.subjects for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.staff_assignments a where a.subject_id=subjects.id))));
grant insert, update on public.subjects to authenticated;
create policy insert_subjects on public.subjects for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_subjects on public.subjects for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.batches to authenticated;
create policy read_batches on public.batches for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_batch(id))));
grant insert, update on public.batches to authenticated;
create policy insert_batches on public.batches for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_batches on public.batches for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.class_subjects to authenticated;
create policy read_class_subjects on public.class_subjects for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.class_subjects to authenticated;
create policy insert_class_subjects on public.class_subjects for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_class_subjects on public.class_subjects for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.students to authenticated;
create policy read_students on public.students for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_batch(batch_id) or exists(select 1 from public.student_enrollments e where e.student_id=students.id))));
grant insert, update on public.students to authenticated;
create policy insert_students on public.students for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_students on public.students for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.guardians to authenticated;
create policy read_guardians on public.guardians for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.guardians to authenticated;
create policy insert_guardians on public.guardians for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_guardians on public.guardians for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.student_guardians to authenticated;
create policy read_student_guardians on public.student_guardians for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.student_guardians to authenticated;
create policy insert_student_guardians on public.student_guardians for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_student_guardians on public.student_guardians for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.student_enrollments to authenticated;
create policy read_student_enrollments on public.student_enrollments for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_batch(batch_id))));
grant select on public.staff_assignments to authenticated;
create policy read_staff_assignments on public.staff_assignments for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (active and staff_id=(select public.actor_staff()))));
grant insert, update on public.staff_assignments to authenticated;
create policy insert_staff_assignments on public.staff_assignments for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_staff_assignments on public.staff_assignments for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.staff_contact_preferences to authenticated;
create policy read_staff_contact_preferences on public.staff_contact_preferences for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.staff_contact_preferences to authenticated;
create policy insert_staff_contact_preferences on public.staff_contact_preferences for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_staff_contact_preferences on public.staff_contact_preferences for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.syllabi to authenticated;
create policy read_syllabi on public.syllabi for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.staff_assignments a join public.batches b on b.id=a.batch_id where a.subject_id=syllabi.subject_id and b.class_id=syllabi.class_id and b.academic_year_id=syllabi.academic_year_id))));
grant insert, update on public.syllabi to authenticated;
create policy insert_syllabi on public.syllabi for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_syllabi on public.syllabi for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.chapters to authenticated;
create policy read_chapters on public.chapters for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.syllabi s where s.id=chapters.syllabus_id))));
grant insert, update on public.chapters to authenticated;
create policy insert_chapters on public.chapters for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_chapters on public.chapters for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.topics to authenticated;
create policy read_topics on public.topics for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.chapters c where c.id=topics.chapter_id))));
grant insert, update on public.topics to authenticated;
create policy insert_topics on public.topics for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_topics on public.topics for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.subtopics to authenticated;
create policy read_subtopics on public.subtopics for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.topics t where t.id=subtopics.topic_id))));
grant insert, update on public.subtopics to authenticated;
create policy insert_subtopics on public.subtopics for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_subtopics on public.subtopics for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.syllabus_targets to authenticated;
create policy read_syllabus_targets on public.syllabus_targets for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant insert, update on public.syllabus_targets to authenticated;
create policy insert_syllabus_targets on public.syllabus_targets for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_syllabus_targets on public.syllabus_targets for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.topic_progress to authenticated;
create policy read_topic_progress on public.topic_progress for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant insert, update on public.topic_progress to authenticated;
create policy insert_topic_progress on public.topic_progress for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
create policy update_topic_progress on public.topic_progress for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant select on public.syllabus_progress_history to authenticated;
create policy read_syllabus_progress_history on public.syllabus_progress_history for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.topic_progress p where p.id=syllabus_progress_history.progress_id))));
grant select on public.calendar_events to authenticated;
create policy read_calendar_events on public.calendar_events for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (batch_id is null or public.can_batch(batch_id))));
grant insert, update on public.calendar_events to authenticated;
create policy insert_calendar_events on public.calendar_events for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_calendar_events on public.calendar_events for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.timetable_entries to authenticated;
create policy read_timetable_entries on public.timetable_entries for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant insert, update on public.timetable_entries to authenticated;
create policy insert_timetable_entries on public.timetable_entries for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_timetable_entries on public.timetable_entries for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.timetable_history to authenticated;
create policy read_timetable_history on public.timetable_history for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.class_sessions to authenticated;
create policy read_class_sessions on public.class_sessions for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant select on public.session_topics to authenticated;
create policy read_session_topics on public.session_topics for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.class_sessions s where s.id=session_topics.session_id))));
grant select on public.session_subtopics to authenticated;
create policy read_session_subtopics on public.session_subtopics for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.class_sessions s where s.id=session_subtopics.session_id))));
grant select on public.attendance_records to authenticated;
create policy read_attendance_records on public.attendance_records for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.class_sessions s where s.id=attendance_records.session_id))));
grant select on public.student_observations to authenticated;
create policy read_student_observations on public.student_observations for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.class_sessions s where s.id=student_observations.session_id))));
grant select on public.assignments to authenticated;
create policy read_assignments on public.assignments for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant insert, update on public.assignments to authenticated;
create policy insert_assignments on public.assignments for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
create policy update_assignments on public.assignments for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant select on public.assignment_topics to authenticated;
create policy read_assignment_topics on public.assignment_topics for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_topics.assignment_id))));
grant insert, update on public.assignment_topics to authenticated;
create policy insert_assignment_topics on public.assignment_topics for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_topics.assignment_id))));
create policy update_assignment_topics on public.assignment_topics for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_topics.assignment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_topics.assignment_id))));
grant select on public.assignment_submissions to authenticated;
create policy read_assignment_submissions on public.assignment_submissions for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_submissions.assignment_id))));
grant insert, update on public.assignment_submissions to authenticated;
create policy insert_assignment_submissions on public.assignment_submissions for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_submissions.assignment_id))));
create policy update_assignment_submissions on public.assignment_submissions for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_submissions.assignment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assignments p where p.id=assignment_submissions.assignment_id))));
grant select on public.assessments to authenticated;
create policy read_assessments on public.assessments for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant insert, update on public.assessments to authenticated;
create policy insert_assessments on public.assessments for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
create policy update_assessments on public.assessments for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (public.can_teach(staff_assignment_id))));
grant select on public.assessment_topics to authenticated;
create policy read_assessment_topics on public.assessment_topics for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_topics.assessment_id))));
grant insert, update on public.assessment_topics to authenticated;
create policy insert_assessment_topics on public.assessment_topics for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_topics.assessment_id))));
create policy update_assessment_topics on public.assessment_topics for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_topics.assessment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_topics.assessment_id))));
grant select on public.assessment_questions to authenticated;
create policy read_assessment_questions on public.assessment_questions for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_questions.assessment_id))));
grant insert, update on public.assessment_questions to authenticated;
create policy insert_assessment_questions on public.assessment_questions for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_questions.assessment_id))));
create policy update_assessment_questions on public.assessment_questions for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_questions.assessment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_questions.assessment_id))));
grant select on public.assessment_scores to authenticated;
create policy read_assessment_scores on public.assessment_scores for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_scores.assessment_id))));
grant insert, update on public.assessment_scores to authenticated;
create policy insert_assessment_scores on public.assessment_scores for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_scores.assessment_id))));
create policy update_assessment_scores on public.assessment_scores for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_scores.assessment_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessments p where p.id=assessment_scores.assessment_id))));
grant select on public.assessment_question_scores to authenticated;
create policy read_assessment_question_scores on public.assessment_question_scores for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessment_scores p where p.id=assessment_question_scores.score_id))));
grant insert, update on public.assessment_question_scores to authenticated;
create policy insert_assessment_question_scores on public.assessment_question_scores for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessment_scores p where p.id=assessment_question_scores.score_id))));
create policy update_assessment_question_scores on public.assessment_question_scores for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessment_scores p where p.id=assessment_question_scores.score_id)))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (exists(select 1 from public.assessment_scores p where p.id=assessment_question_scores.score_id))));
grant select on public.generated_reports to authenticated;
create policy read_generated_reports on public.generated_reports for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.generated_reports to authenticated;
create policy insert_generated_reports on public.generated_reports for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_generated_reports on public.generated_reports for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.report_templates to authenticated;
create policy read_report_templates on public.report_templates for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.report_templates to authenticated;
create policy insert_report_templates on public.report_templates for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_report_templates on public.report_templates for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.report_access_logs to authenticated;
create policy read_report_access_logs on public.report_access_logs for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.report_access_logs to authenticated;
create policy insert_report_access_logs on public.report_access_logs for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_report_access_logs on public.report_access_logs for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.ai_conversations to authenticated;
create policy read_ai_conversations on public.ai_conversations for select to authenticated using (institution_id=(select public.actor_institution()) and (user_id=(select auth.uid())));
grant select on public.ai_messages to authenticated;
create policy read_ai_messages on public.ai_messages for select to authenticated using (institution_id=(select public.actor_institution()) and (exists(select 1 from public.ai_conversations c where c.id=ai_messages.conversation_id)));
grant select on public.ai_agent_runs to authenticated;
create policy read_ai_agent_runs on public.ai_agent_runs for select to authenticated using (institution_id=(select public.actor_institution()) and (user_id=(select auth.uid())));
grant select on public.ai_tool_execution_logs to authenticated;
create policy read_ai_tool_execution_logs on public.ai_tool_execution_logs for select to authenticated using (institution_id=(select public.actor_institution()) and (exists(select 1 from public.ai_agent_runs r where r.id=ai_tool_execution_logs.run_id)));
grant select on public.ai_analysis_results to authenticated;
create policy read_ai_analysis_results on public.ai_analysis_results for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.ai_analysis_evidence to authenticated;
create policy read_ai_analysis_evidence on public.ai_analysis_evidence for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.academic_interventions to authenticated;
create policy read_academic_interventions on public.academic_interventions for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.academic_interventions to authenticated;
create policy insert_academic_interventions on public.academic_interventions for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_academic_interventions on public.academic_interventions for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.intervention_followups to authenticated;
create policy read_intervention_followups on public.intervention_followups for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.intervention_followups to authenticated;
create policy insert_intervention_followups on public.intervention_followups for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_intervention_followups on public.intervention_followups for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.academic_thresholds to authenticated;
create policy read_academic_thresholds on public.academic_thresholds for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.academic_thresholds to authenticated;
create policy insert_academic_thresholds on public.academic_thresholds for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_academic_thresholds on public.academic_thresholds for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.ai_usage_logs to authenticated;
create policy read_ai_usage_logs on public.ai_usage_logs for select to authenticated using (institution_id=(select public.actor_institution()) and (user_id=(select auth.uid())));
grant select on public.communication_campaigns to authenticated;
create policy read_communication_campaigns on public.communication_campaigns for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.communication_recipients to authenticated;
create policy read_communication_recipients on public.communication_recipients for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.communication_drafts to authenticated;
create policy read_communication_drafts on public.communication_drafts for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.communication_approvals to authenticated;
create policy read_communication_approvals on public.communication_approvals for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.communication_templates to authenticated;
create policy read_communication_templates on public.communication_templates for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant insert, update on public.communication_templates to authenticated;
create policy insert_communication_templates on public.communication_templates for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_communication_templates on public.communication_templates for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.communication_delivery_logs to authenticated;
create policy read_communication_delivery_logs on public.communication_delivery_logs for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.notification_schedules to authenticated;
create policy read_notification_schedules on public.notification_schedules for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.notification_preferences to authenticated;
create policy read_notification_preferences on public.notification_preferences for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (user_id=(select auth.uid()))));
grant select on public.notifications to authenticated;
create policy read_notifications on public.notifications for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()) or (staff_id is null or staff_id=(select public.actor_staff()))));
grant insert, update on public.notifications to authenticated;
create policy insert_notifications on public.notifications for insert to authenticated with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
create policy update_notifications on public.notifications for update to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin()))) with check (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.audit_logs to authenticated;
create policy read_audit_logs on public.audit_logs for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));
grant select on public.system_activity_logs to authenticated;
create policy read_system_activity_logs on public.system_activity_logs for select to authenticated using (institution_id=(select public.actor_institution()) and ((select public.actor_admin())));

-- Service-role access is reserved for server-side account provisioning, AI and delivery.
grant all on all tables in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('academic-files','academic-files',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp']),
       ('academic-reports','academic-reports',false,15728640,array['application/pdf'])
on conflict(id) do nothing;
create policy admin_academic_storage_read on storage.objects for select to authenticated using (
  bucket_id in ('academic-files','academic-reports') and (storage.foldername(name))[1]=(select public.actor_institution())::text and (select public.actor_admin()));
create policy admin_academic_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('academic-files','academic-reports') and (storage.foldername(name))[1]=(select public.actor_institution())::text and (select public.actor_admin()));
create policy admin_academic_storage_delete on storage.objects for delete to authenticated using (
  bucket_id in ('academic-files','academic-reports') and (storage.foldername(name))[1]=(select public.actor_institution())::text and (select public.actor_admin()));

create function public.write_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(institution_id,actor_id,table_name,action,record_id,changes)
  values(new.institution_id,auth.uid(),tg_table_name,lower(tg_op),new.id,
    case when tg_op='UPDATE' then jsonb_build_object('previous_status',to_jsonb(old)->'status','status',to_jsonb(new)->'status') else null end);
  return new;
end $$;
revoke all on function public.write_audit() from public;
do $$
declare t text;
begin
  foreach t in array array['students','staff','student_enrollments','staff_assignments','class_sessions','attendance_records','topic_progress','assignments','assignment_submissions',
     'assessments','assessment_scores','calendar_events','timetable_entries','institution_settings','academic_interventions','communication_campaigns','generated_reports','profiles','user_roles']
  loop
    execute format('create trigger audit_row after insert or update on public.%I for each row execute function public.write_audit()',t);
  end loop;
end $$;
commit;
