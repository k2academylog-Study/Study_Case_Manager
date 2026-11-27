-- Run once as the database owner. Set a password for scm_service outside source control.
-- Use this separate role in DATABASE_URL and connect directly or through the session pooler.
create role scm_service login bypassrls;
grant usage on schema public,scm_agent to scm_service;
grant create on schema scm_agent to scm_service;
grant select on public.profiles,public.user_roles,public.role_permissions,public.institution_settings,public.staff,public.staff_assignments,
  public.classes,public.batches,public.subjects,public.students,public.student_enrollments,public.class_sessions,
  public.attendance_records,public.student_observations,public.session_topics,public.session_subtopics,public.topics,public.subtopics,
  public.assessments,public.assessment_scores,public.assignments,public.assignment_submissions,public.syllabus_targets,
  public.topic_progress,public.timetable_entries,public.calendar_events,public.generated_reports to scm_service;
grant select,insert,update on public.ai_agent_runs,public.ai_usage_logs,public.ai_tool_execution_logs,public.ai_analysis_results,
  public.ai_analysis_evidence,public.ai_conversations,public.ai_messages,public.academic_interventions,
  public.communication_campaigns,public.communication_recipients,public.communication_drafts,public.communication_approvals,
  public.communication_templates,public.communication_delivery_logs,public.notification_schedules,public.provider_webhook_events
  to scm_service;

