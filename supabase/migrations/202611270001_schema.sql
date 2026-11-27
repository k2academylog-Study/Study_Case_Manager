begin;
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  demo boolean not null default false,
  logo_path text,
  created_at timestamptz not null default now()
);
alter table public.institutions enable row level security;
revoke all on public.institutions from public,anon,authenticated;

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.touch_updated_at() from public;

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  email text,
  phone text,
  whatsapp text,
  qualifications text,
  experience_years numeric check(experience_years>=0),
  joining_date date,
  employment_status text not null default 'employed' check(employment_status in ('employed','on_leave','departed')),
  email_consent boolean not null default false,
  whatsapp_consent boolean not null default false,
  active boolean not null default true,
  photo_path text,
  unique(institution_id,email),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.staff enable row level security;
revoke all on public.staff from public,anon,authenticated;
create index staff_institution on public.staff(institution_id,created_at desc);
create trigger touch_staff before update on public.staff for each row execute function public.touch_updated_at();

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_id uuid,
  foreign key (staff_id,institution_id) references public.staff(id,institution_id),
  user_id uuid not null unique references auth.users(id),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated;
create index profiles_institution on public.profiles(institution_id,created_at desc);
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  profile_id uuid not null,
  foreign key (profile_id,institution_id) references public.profiles(id,institution_id),
  role text not null check(role in ('admin','staff')),
  unique(profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.user_roles enable row level security;
revoke all on public.user_roles from public,anon,authenticated;
create index user_roles_institution on public.user_roles(institution_id,created_at desc);
create trigger touch_user_roles before update on public.user_roles for each row execute function public.touch_updated_at();

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  role text not null check(role in ('admin','staff')),
  permission text not null,
  enabled boolean not null default true,
  unique(institution_id,role,permission),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.role_permissions enable row level security;
revoke all on public.role_permissions from public,anon,authenticated;
create index role_permissions_institution on public.role_permissions(institution_id,created_at desc);
create trigger touch_role_permissions before update on public.role_permissions for each row execute function public.touch_updated_at();

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  starts_on date not null,
  ends_on date not null check(ends_on>=starts_on),
  unique(institution_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.academic_years enable row level security;
revoke all on public.academic_years from public,anon,authenticated;
create index academic_years_institution on public.academic_years(institution_id,created_at desc);
create trigger touch_academic_years before update on public.academic_years for each row execute function public.touch_updated_at();

create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  academic_year_id uuid not null,
  foreign key (academic_year_id,institution_id) references public.academic_years(id,institution_id),
  name text not null,
  starts_on date not null,
  ends_on date not null check(ends_on>=starts_on),
  unique(academic_year_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.academic_terms enable row level security;
revoke all on public.academic_terms from public,anon,authenticated;
create index academic_terms_institution on public.academic_terms(institution_id,created_at desc);
create trigger touch_academic_terms before update on public.academic_terms for each row execute function public.touch_updated_at();

create table public.institution_settings (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  institution_name text not null,
  contact_email text,
  timezone text not null default 'Asia/Kolkata',
  class_minutes int not null default 45 check(class_minutes between 1 and 1440),
  attendance_threshold numeric not null default 75 check(attendance_threshold between 0 and 100),
  assessment_threshold numeric not null default 50 check(assessment_threshold between 0 and 100),
  decline_threshold numeric not null default 15 check(decline_threshold between 0 and 100),
  pending_threshold int not null default 3 check(pending_threshold>0),
  consecutive_absences int not null default 3 check(consecutive_absences>0),
  ai_daily_limit int not null default 20 check(ai_daily_limit between 1 and 500),
  retention_days int not null default 365 check(retention_days>=30),
  syllabus_weighting text not null default 'weight' check(syllabus_weighting in ('weight','minutes')),
  late_present boolean not null default true,
  exclude_excused boolean not null default true,
  ai_enabled boolean not null default false,
  working_days smallint[] default '{1,2,3,4,5,6}',
  opens_at time,
  closes_at time,
  unique(institution_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.institution_settings enable row level security;
revoke all on public.institution_settings from public,anon,authenticated;
create index institution_settings_institution on public.institution_settings(institution_id,created_at desc);
create trigger touch_institution_settings before update on public.institution_settings for each row execute function public.touch_updated_at();

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  description text,
  unique(institution_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.classes enable row level security;
revoke all on public.classes from public,anon,authenticated;
create index classes_institution on public.classes(institution_id,created_at desc);
create trigger touch_classes before update on public.classes for each row execute function public.touch_updated_at();

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  description text,
  unique(institution_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.subjects enable row level security;
revoke all on public.subjects from public,anon,authenticated;
create index subjects_institution on public.subjects(institution_id,created_at desc);
create trigger touch_subjects before update on public.subjects for each row execute function public.touch_updated_at();

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  class_id uuid not null,
  foreign key (class_id,institution_id) references public.classes(id,institution_id),
  academic_year_id uuid not null,
  foreign key (academic_year_id,institution_id) references public.academic_years(id,institution_id),
  name text not null,
  unique(class_id,academic_year_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.batches enable row level security;
revoke all on public.batches from public,anon,authenticated;
create index batches_institution on public.batches(institution_id,created_at desc);
create trigger touch_batches before update on public.batches for each row execute function public.touch_updated_at();

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  class_id uuid not null,
  foreign key (class_id,institution_id) references public.classes(id,institution_id),
  subject_id uuid not null,
  foreign key (subject_id,institution_id) references public.subjects(id,institution_id),
  unique(class_id,subject_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.class_subjects enable row level security;
revoke all on public.class_subjects from public,anon,authenticated;
create index class_subjects_institution on public.class_subjects(institution_id,created_at desc);
create trigger touch_class_subjects before update on public.class_subjects for each row execute function public.touch_updated_at();

create table public.students (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  batch_id uuid not null,
  foreign key (batch_id,institution_id) references public.batches(id,institution_id),
  name text not null,
  admission_number text not null,
  birth_date date,
  gender text,
  admission_date date,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  guardian_email_consent boolean not null default false,
  guardian_whatsapp_consent boolean not null default false,
  emergency_contact text,
  address text,
  photo_path text,
  academic_status text not null default 'enrolled' check(academic_status in ('enrolled','graduated','withdrawn')),
  active boolean not null default true,
  unique(institution_id,admission_number),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.students enable row level security;
revoke all on public.students from public,anon,authenticated;
create index students_institution on public.students(institution_id,created_at desc);
create trigger touch_students before update on public.students for each row execute function public.touch_updated_at();

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  phone text,
  email text,
  email_consent boolean not null default false,
  whatsapp_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.guardians enable row level security;
revoke all on public.guardians from public,anon,authenticated;
create index guardians_institution on public.guardians(institution_id,created_at desc);
create trigger touch_guardians before update on public.guardians for each row execute function public.touch_updated_at();

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  guardian_id uuid not null,
  foreign key (guardian_id,institution_id) references public.guardians(id,institution_id),
  relationship text,
  unique(student_id,guardian_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.student_guardians enable row level security;
revoke all on public.student_guardians from public,anon,authenticated;
create index student_guardians_institution on public.student_guardians(institution_id,created_at desc);
create trigger touch_student_guardians before update on public.student_guardians for each row execute function public.touch_updated_at();

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  batch_id uuid not null,
  foreign key (batch_id,institution_id) references public.batches(id,institution_id),
  starts_on date not null,
  ends_on date check(ends_on>=starts_on),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.student_enrollments enable row level security;
revoke all on public.student_enrollments from public,anon,authenticated;
create index student_enrollments_institution on public.student_enrollments(institution_id,created_at desc);
create trigger touch_student_enrollments before update on public.student_enrollments for each row execute function public.touch_updated_at();

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_id uuid not null,
  foreign key (staff_id,institution_id) references public.staff(id,institution_id),
  batch_id uuid not null,
  foreign key (batch_id,institution_id) references public.batches(id,institution_id),
  subject_id uuid not null,
  foreign key (subject_id,institution_id) references public.subjects(id,institution_id),
  active boolean not null default true,
  unique(staff_id,batch_id,subject_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.staff_assignments enable row level security;
revoke all on public.staff_assignments from public,anon,authenticated;
create index staff_assignments_institution on public.staff_assignments(institution_id,created_at desc);
create trigger touch_staff_assignments before update on public.staff_assignments for each row execute function public.touch_updated_at();

create table public.staff_contact_preferences (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_id uuid not null,
  foreign key (staff_id,institution_id) references public.staff(id,institution_id),
  channel text not null check(channel in ('email','whatsapp')),
  consent boolean not null default false,
  consent_at timestamptz,
  unique(staff_id,channel),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.staff_contact_preferences enable row level security;
revoke all on public.staff_contact_preferences from public,anon,authenticated;
create index staff_contact_preferences_institution on public.staff_contact_preferences(institution_id,created_at desc);
create trigger touch_staff_contact_preferences before update on public.staff_contact_preferences for each row execute function public.touch_updated_at();

create table public.syllabi (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  academic_year_id uuid not null,
  foreign key (academic_year_id,institution_id) references public.academic_years(id,institution_id),
  class_id uuid not null,
  foreign key (class_id,institution_id) references public.classes(id,institution_id),
  subject_id uuid not null,
  foreign key (subject_id,institution_id) references public.subjects(id,institution_id),
  name text not null,
  unique(academic_year_id,class_id,subject_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.syllabi enable row level security;
revoke all on public.syllabi from public,anon,authenticated;
create index syllabi_institution on public.syllabi(institution_id,created_at desc);
create trigger touch_syllabi before update on public.syllabi for each row execute function public.touch_updated_at();

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  syllabus_id uuid not null,
  foreign key (syllabus_id,institution_id) references public.syllabi(id,institution_id),
  name text not null,
  position int not null default 1 check(position>0),
  unique(syllabus_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.chapters enable row level security;
revoke all on public.chapters from public,anon,authenticated;
create index chapters_institution on public.chapters(institution_id,created_at desc);
create trigger touch_chapters before update on public.chapters for each row execute function public.touch_updated_at();

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  chapter_id uuid not null,
  foreign key (chapter_id,institution_id) references public.chapters(id,institution_id),
  name text not null,
  description text,
  estimated_minutes int not null default 45 check(estimated_minutes>0),
  weight numeric not null default 1 check(weight>0),
  unique(chapter_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.topics enable row level security;
revoke all on public.topics from public,anon,authenticated;
create index topics_institution on public.topics(institution_id,created_at desc);
create trigger touch_topics before update on public.topics for each row execute function public.touch_updated_at();

create table public.subtopics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  topic_id uuid not null,
  foreign key (topic_id,institution_id) references public.topics(id,institution_id),
  name text not null,
  description text,
  estimated_minutes int not null default 15 check(estimated_minutes>0),
  weight numeric not null default 1 check(weight>0),
  unique(topic_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.subtopics enable row level security;
revoke all on public.subtopics from public,anon,authenticated;
create index subtopics_institution on public.subtopics(institution_id,created_at desc);
create trigger touch_subtopics before update on public.subtopics for each row execute function public.touch_updated_at();

create table public.syllabus_targets (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_assignment_id uuid not null,
  foreign key (staff_assignment_id,institution_id) references public.staff_assignments(id,institution_id),
  target_on date not null,
  target_completion numeric not null check(target_completion between 0 and 100),
  unique(staff_assignment_id,target_on),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.syllabus_targets enable row level security;
revoke all on public.syllabus_targets from public,anon,authenticated;
create index syllabus_targets_institution on public.syllabus_targets(institution_id,created_at desc);
create trigger touch_syllabus_targets before update on public.syllabus_targets for each row execute function public.touch_updated_at();

create table public.topic_progress (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_assignment_id uuid not null,
  foreign key (staff_assignment_id,institution_id) references public.staff_assignments(id,institution_id),
  topic_id uuid not null,
  foreign key (topic_id,institution_id) references public.topics(id,institution_id),
  subtopic_id uuid,
  foreign key (subtopic_id,institution_id) references public.subtopics(id,institution_id),
  target_starts_on date,
  target_on date,
  actual_starts_on date,
  completed_on date,
  completion numeric not null default 0 check(completion between 0 and 100),
  status text not null default 'not_started' check(status in ('not_started','in_progress','completed','revision_required','delayed')),
  unique nulls not distinct(staff_assignment_id,topic_id,subtopic_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.topic_progress enable row level security;
revoke all on public.topic_progress from public,anon,authenticated;
create index topic_progress_institution on public.topic_progress(institution_id,created_at desc);
create trigger touch_topic_progress before update on public.topic_progress for each row execute function public.touch_updated_at();

create table public.syllabus_progress_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  progress_id uuid not null,
  foreign key (progress_id,institution_id) references public.topic_progress(id,institution_id),
  completion numeric not null,
  status text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.syllabus_progress_history enable row level security;
revoke all on public.syllabus_progress_history from public,anon,authenticated;
create index syllabus_progress_history_institution on public.syllabus_progress_history(institution_id,created_at desc);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  batch_id uuid,
  foreign key (batch_id,institution_id) references public.batches(id,institution_id),
  title text not null,
  event_type text not null check(event_type in ('meeting','holiday','assessment','deadline','other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from public,anon,authenticated;
create index calendar_events_institution on public.calendar_events(institution_id,created_at desc);
create trigger touch_calendar_events before update on public.calendar_events for each row execute function public.touch_updated_at();

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_assignment_id uuid not null,
  foreign key (staff_assignment_id,institution_id) references public.staff_assignments(id,institution_id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'),
  status text not null default 'scheduled' check(status in ('scheduled','rescheduled','cancelled')),
  recurrence_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.timetable_entries enable row level security;
revoke all on public.timetable_entries from public,anon,authenticated;
create index timetable_entries_institution on public.timetable_entries(institution_id,created_at desc);
create trigger touch_timetable_entries before update on public.timetable_entries for each row execute function public.touch_updated_at();

create table public.timetable_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  timetable_id uuid not null,
  foreign key (timetable_id,institution_id) references public.timetable_entries(id,institution_id),
  previous_start timestamptz not null,
  previous_end timestamptz not null,
  status text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.timetable_history enable row level security;
revoke all on public.timetable_history from public,anon,authenticated;
create index timetable_history_institution on public.timetable_history(institution_id,created_at desc);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_assignment_id uuid not null,
  foreign key (staff_assignment_id,institution_id) references public.staff_assignments(id,institution_id),
  timetable_id uuid,
  foreign key (timetable_id,institution_id) references public.timetable_entries(id,institution_id),
  date date not null,
  actual_start timestamptz,
  actual_end timestamptz,
  duration_minutes int not null check(duration_minutes between 1 and 1440),
  status text not null default 'draft' check(status in ('draft','completed')),
  notes text,
  revision boolean not null default false,
  request_id uuid not null unique,
  unique(timetable_id),
  check(actual_end is null or actual_start is not null and actual_end>actual_start),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.class_sessions enable row level security;
revoke all on public.class_sessions from public,anon,authenticated;
create index class_sessions_institution on public.class_sessions(institution_id,created_at desc);
create trigger touch_class_sessions before update on public.class_sessions for each row execute function public.touch_updated_at();

create table public.session_topics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  session_id uuid not null,
  foreign key (session_id,institution_id) references public.class_sessions(id,institution_id),
  topic_id uuid not null,
  foreign key (topic_id,institution_id) references public.topics(id,institution_id),
  revision boolean not null default false,
  unique(session_id,topic_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.session_topics enable row level security;
revoke all on public.session_topics from public,anon,authenticated;
create index session_topics_institution on public.session_topics(institution_id,created_at desc);
create trigger touch_session_topics before update on public.session_topics for each row execute function public.touch_updated_at();

create table public.session_subtopics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  session_id uuid not null,
  foreign key (session_id,institution_id) references public.class_sessions(id,institution_id),
  subtopic_id uuid not null,
  foreign key (subtopic_id,institution_id) references public.subtopics(id,institution_id),
  revision boolean not null default false,
  unique(session_id,subtopic_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.session_subtopics enable row level security;
revoke all on public.session_subtopics from public,anon,authenticated;
create index session_subtopics_institution on public.session_subtopics(institution_id,created_at desc);
create trigger touch_session_subtopics before update on public.session_subtopics for each row execute function public.touch_updated_at();

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  session_id uuid not null,
  foreign key (session_id,institution_id) references public.class_sessions(id,institution_id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  status text not null check(status in ('present','absent','late','excused')),
  remarks text,
  unique(session_id,student_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.attendance_records enable row level security;
revoke all on public.attendance_records from public,anon,authenticated;
create index attendance_records_institution on public.attendance_records(institution_id,created_at desc);
create trigger touch_attendance_records before update on public.attendance_records for each row execute function public.touch_updated_at();

create table public.student_observations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  session_id uuid not null,
  foreign key (session_id,institution_id) references public.class_sessions(id,institution_id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  attentiveness text check(attentiveness in ('highly_attentive','attentive','moderately_attentive','requires_attention','not_observed')),
  participation text check(participation in ('active','moderate','limited','not_observed')),
  understanding text check(understanding in ('demonstrated_understanding','requires_practice','requires_revision','not_assessed')),
  completed_classwork boolean,
  needs_support boolean,
  follow_up boolean,
  remarks text,
  unique(session_id,student_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.student_observations enable row level security;
revoke all on public.student_observations from public,anon,authenticated;
create index student_observations_institution on public.student_observations(institution_id,created_at desc);
create trigger touch_student_observations before update on public.student_observations for each row execute function public.touch_updated_at();

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_assignment_id uuid not null,
  foreign key (staff_assignment_id,institution_id) references public.staff_assignments(id,institution_id),
  title text not null,
  assigned_on date not null,
  due_on date not null check(due_on>=assigned_on),
  max_marks numeric check(max_marks>0),
  description text,
  instructions text,
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assignments enable row level security;
revoke all on public.assignments from public,anon,authenticated;
create index assignments_institution on public.assignments(institution_id,created_at desc);
create trigger touch_assignments before update on public.assignments for each row execute function public.touch_updated_at();

create table public.assignment_topics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  assignment_id uuid not null,
  foreign key (assignment_id,institution_id) references public.assignments(id,institution_id),
  topic_id uuid not null,
  foreign key (topic_id,institution_id) references public.topics(id,institution_id),
  unique(assignment_id,topic_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assignment_topics enable row level security;
revoke all on public.assignment_topics from public,anon,authenticated;
create index assignment_topics_institution on public.assignment_topics(institution_id,created_at desc);
create trigger touch_assignment_topics before update on public.assignment_topics for each row execute function public.touch_updated_at();

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  assignment_id uuid not null,
  foreign key (assignment_id,institution_id) references public.assignments(id,institution_id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  status text not null check(status in ('submitted','not_submitted','late','excused','under_review','evaluated')),
  marks numeric check(marks>=0),
  feedback text,
  unique(assignment_id,student_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assignment_submissions enable row level security;
revoke all on public.assignment_submissions from public,anon,authenticated;
create index assignment_submissions_institution on public.assignment_submissions(institution_id,created_at desc);
create trigger touch_assignment_submissions before update on public.assignment_submissions for each row execute function public.touch_updated_at();

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_assignment_id uuid not null,
  foreign key (staff_assignment_id,institution_id) references public.staff_assignments(id,institution_id),
  title text not null,
  assessment_type text not null check(assessment_type in ('weekly_test','unit_test','quiz','assignment_assessment','monthly_test','revision_test','model_examination','term_examination')),
  assessment_on date not null,
  max_marks numeric not null check(max_marks>0),
  pass_marks numeric not null check(pass_marks>=0 and pass_marks<=max_marks),
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assessments enable row level security;
revoke all on public.assessments from public,anon,authenticated;
create index assessments_institution on public.assessments(institution_id,created_at desc);
create trigger touch_assessments before update on public.assessments for each row execute function public.touch_updated_at();

create table public.assessment_topics (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  assessment_id uuid not null,
  foreign key (assessment_id,institution_id) references public.assessments(id,institution_id),
  topic_id uuid not null,
  foreign key (topic_id,institution_id) references public.topics(id,institution_id),
  unique(assessment_id,topic_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assessment_topics enable row level security;
revoke all on public.assessment_topics from public,anon,authenticated;
create index assessment_topics_institution on public.assessment_topics(institution_id,created_at desc);
create trigger touch_assessment_topics before update on public.assessment_topics for each row execute function public.touch_updated_at();

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  assessment_id uuid not null,
  foreign key (assessment_id,institution_id) references public.assessments(id,institution_id),
  topic_id uuid,
  foreign key (topic_id,institution_id) references public.topics(id,institution_id),
  question_number int not null check(question_number>0),
  max_marks numeric not null check(max_marks>0),
  unique(assessment_id,question_number),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assessment_questions enable row level security;
revoke all on public.assessment_questions from public,anon,authenticated;
create index assessment_questions_institution on public.assessment_questions(institution_id,created_at desc);
create trigger touch_assessment_questions before update on public.assessment_questions for each row execute function public.touch_updated_at();

create table public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  assessment_id uuid not null,
  foreign key (assessment_id,institution_id) references public.assessments(id,institution_id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  status text not null check(status in ('evaluated','absent','not_evaluated')),
  marks numeric check(marks>=0),
  feedback text,
  draft boolean not null default true,
  check((status='evaluated')=(marks is not null)),
  unique(assessment_id,student_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assessment_scores enable row level security;
revoke all on public.assessment_scores from public,anon,authenticated;
create index assessment_scores_institution on public.assessment_scores(institution_id,created_at desc);
create trigger touch_assessment_scores before update on public.assessment_scores for each row execute function public.touch_updated_at();

create table public.assessment_question_scores (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  score_id uuid not null,
  foreign key (score_id,institution_id) references public.assessment_scores(id,institution_id),
  question_id uuid not null,
  foreign key (question_id,institution_id) references public.assessment_questions(id,institution_id),
  marks numeric not null check(marks>=0),
  unique(score_id,question_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.assessment_question_scores enable row level security;
revoke all on public.assessment_question_scores from public,anon,authenticated;
create index assessment_question_scores_institution on public.assessment_question_scores(institution_id,created_at desc);
create trigger touch_assessment_question_scores before update on public.assessment_question_scores for each row execute function public.touch_updated_at();

create table public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  report_type text not null,
  title text not null,
  subject_id uuid,
  storage_path text not null unique,
  requested_by uuid not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.generated_reports enable row level security;
revoke all on public.generated_reports from public,anon,authenticated;
create index generated_reports_institution on public.generated_reports(institution_id,created_at desc);
create trigger touch_generated_reports before update on public.generated_reports for each row execute function public.touch_updated_at();

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  options jsonb not null default '{}',
  unique(institution_id,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.report_templates enable row level security;
revoke all on public.report_templates from public,anon,authenticated;
create index report_templates_institution on public.report_templates(institution_id,created_at desc);
create trigger touch_report_templates before update on public.report_templates for each row execute function public.touch_updated_at();

create table public.report_access_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  report_id uuid not null,
  foreign key (report_id,institution_id) references public.generated_reports(id,institution_id),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.report_access_logs enable row level security;
revoke all on public.report_access_logs from public,anon,authenticated;
create index report_access_logs_institution on public.report_access_logs(institution_id,created_at desc);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  user_id uuid not null,
  title text not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_conversations enable row level security;
revoke all on public.ai_conversations from public,anon,authenticated;
create index ai_conversations_institution on public.ai_conversations(institution_id,created_at desc);
create trigger touch_ai_conversations before update on public.ai_conversations for each row execute function public.touch_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  conversation_id uuid not null,
  foreign key (conversation_id,institution_id) references public.ai_conversations(id,institution_id),
  role text not null check(role in ('user','assistant')),
  body text not null,
  sources jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_messages enable row level security;
revoke all on public.ai_messages from public,anon,authenticated;
create index ai_messages_institution on public.ai_messages(institution_id,created_at desc);
create trigger touch_ai_messages before update on public.ai_messages for each row execute function public.touch_updated_at();

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  agent text not null check(agent in ('performance','assistant','communication')),
  user_id uuid not null,
  status text not null check(status in ('running','completed','failed','awaiting_approval')),
  request_id uuid not null,
  details jsonb,
  unique(user_id,agent,request_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_agent_runs enable row level security;
revoke all on public.ai_agent_runs from public,anon,authenticated;
create index ai_agent_runs_institution on public.ai_agent_runs(institution_id,created_at desc);
create trigger touch_ai_agent_runs before update on public.ai_agent_runs for each row execute function public.touch_updated_at();

create table public.ai_tool_execution_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  run_id uuid not null,
  foreign key (run_id,institution_id) references public.ai_agent_runs(id,institution_id),
  tool text not null,
  result_count int not null default 0,
  status text not null,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_tool_execution_logs enable row level security;
revoke all on public.ai_tool_execution_logs from public,anon,authenticated;
create index ai_tool_execution_logs_institution on public.ai_tool_execution_logs(institution_id,created_at desc);

create table public.ai_analysis_results (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  run_id uuid not null,
  foreign key (run_id,institution_id) references public.ai_agent_runs(id,institution_id),
  filters jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_analysis_results enable row level security;
revoke all on public.ai_analysis_results from public,anon,authenticated;
create index ai_analysis_results_institution on public.ai_analysis_results(institution_id,created_at desc);
create trigger touch_ai_analysis_results before update on public.ai_analysis_results for each row execute function public.touch_updated_at();

create table public.ai_analysis_evidence (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  analysis_id uuid not null,
  foreign key (analysis_id,institution_id) references public.ai_analysis_results(id,institution_id),
  evidence_key text not null,
  value jsonb not null,
  unique(analysis_id,evidence_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_analysis_evidence enable row level security;
revoke all on public.ai_analysis_evidence from public,anon,authenticated;
create index ai_analysis_evidence_institution on public.ai_analysis_evidence(institution_id,created_at desc);
create trigger touch_ai_analysis_evidence before update on public.ai_analysis_evidence for each row execute function public.touch_updated_at();

create table public.academic_interventions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  student_id uuid not null,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  staff_id uuid not null,
  foreign key (staff_id,institution_id) references public.staff(id,institution_id),
  issue text not null,
  evidence text,
  action text not null,
  target_on date not null,
  followup_on date,
  status text not null check(status in ('proposed','approved','in_progress','completed','follow_up_required')),
  outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.academic_interventions enable row level security;
revoke all on public.academic_interventions from public,anon,authenticated;
create index academic_interventions_institution on public.academic_interventions(institution_id,created_at desc);
create trigger touch_academic_interventions before update on public.academic_interventions for each row execute function public.touch_updated_at();

create table public.intervention_followups (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  intervention_id uuid not null,
  foreign key (intervention_id,institution_id) references public.academic_interventions(id,institution_id),
  followup_on date not null,
  outcome text not null,
  measures jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.intervention_followups enable row level security;
revoke all on public.intervention_followups from public,anon,authenticated;
create index intervention_followups_institution on public.intervention_followups(institution_id,created_at desc);
create trigger touch_intervention_followups before update on public.intervention_followups for each row execute function public.touch_updated_at();

create table public.academic_thresholds (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  metric text not null,
  threshold numeric not null,
  unique(institution_id,metric),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.academic_thresholds enable row level security;
revoke all on public.academic_thresholds from public,anon,authenticated;
create index academic_thresholds_institution on public.academic_thresholds(institution_id,created_at desc);
create trigger touch_academic_thresholds before update on public.academic_thresholds for each row execute function public.touch_updated_at();

create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  run_id uuid not null,
  foreign key (run_id,institution_id) references public.ai_agent_runs(id,institution_id),
  user_id uuid not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  estimated_usd numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.ai_usage_logs enable row level security;
revoke all on public.ai_usage_logs from public,anon,authenticated;
create index ai_usage_logs_institution on public.ai_usage_logs(institution_id,created_at desc);

create table public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  title text not null,
  user_id uuid not null,
  status text not null default 'awaiting_approval' check(status in ('awaiting_approval','approved','scheduled','queued','sent','cancelled','failed')),
  content_hash text not null,
  next_run_at timestamptz,
  queued_at timestamptz,
  recurring_days int check(recurring_days between 1 and 365),
  unique(id,content_hash),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.communication_campaigns enable row level security;
revoke all on public.communication_campaigns from public,anon,authenticated;
create index communication_campaigns_institution on public.communication_campaigns(institution_id,created_at desc);
create trigger touch_communication_campaigns before update on public.communication_campaigns for each row execute function public.touch_updated_at();

create table public.communication_recipients (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  campaign_id uuid not null,
  foreign key (campaign_id,institution_id) references public.communication_campaigns(id,institution_id),
  staff_id uuid,
  foreign key (staff_id,institution_id) references public.staff(id,institution_id),
  student_id uuid,
  foreign key (student_id,institution_id) references public.students(id,institution_id),
  channel text not null check(channel in ('email','whatsapp')),
  recipient_key uuid not null,
  destination text not null,
  subject text,
  body text not null,
  template_name text,
  template_language text,
  template_variables jsonb,
  report_id uuid,
  foreign key (report_id,institution_id) references public.generated_reports(id,institution_id),
  unique(campaign_id,recipient_key,channel),
  check(num_nonnulls(staff_id,student_id)=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.communication_recipients enable row level security;
revoke all on public.communication_recipients from public,anon,authenticated;
create index communication_recipients_institution on public.communication_recipients(institution_id,created_at desc);
create trigger touch_communication_recipients before update on public.communication_recipients for each row execute function public.touch_updated_at();

create table public.communication_drafts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  campaign_id uuid not null,
  foreign key (campaign_id,institution_id) references public.communication_campaigns(id,institution_id),
  content_hash text not null,
  intent jsonb not null,
  unique(campaign_id,content_hash),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.communication_drafts enable row level security;
revoke all on public.communication_drafts from public,anon,authenticated;
create index communication_drafts_institution on public.communication_drafts(institution_id,created_at desc);
create trigger touch_communication_drafts before update on public.communication_drafts for each row execute function public.touch_updated_at();

create table public.communication_approvals (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  campaign_id uuid not null,
  foreign key (campaign_id,institution_id) references public.communication_campaigns(id,institution_id),
  approver_id uuid not null,
  content_hash text not null,
  unique(campaign_id,content_hash),
  foreign key(campaign_id,content_hash) references public.communication_campaigns(id,content_hash),
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.communication_approvals enable row level security;
revoke all on public.communication_approvals from public,anon,authenticated;
create index communication_approvals_institution on public.communication_approvals(institution_id,created_at desc);

create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  name text not null,
  channel text not null check(channel in ('email','whatsapp')),
  provider_name text,
  language text,
  subject text,
  body text not null,
  active boolean not null default true,
  unique(institution_id,channel,name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.communication_templates enable row level security;
revoke all on public.communication_templates from public,anon,authenticated;
create index communication_templates_institution on public.communication_templates(institution_id,created_at desc);
create trigger touch_communication_templates before update on public.communication_templates for each row execute function public.touch_updated_at();

create table public.communication_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  campaign_id uuid not null,
  foreign key (campaign_id,institution_id) references public.communication_campaigns(id,institution_id),
  recipient_id uuid not null,
  foreign key (recipient_id,institution_id) references public.communication_recipients(id,institution_id),
  occurrence timestamptz not null,
  channel text not null,
  provider_id text,
  status text not null check(status in ('queued','sending','sent','delivered','read','failed','bounced','cancelled','uncertain')),
  attempts int not null default 0,
  tried_at timestamptz,
  error text,
  unique(recipient_id,occurrence),
  unique(channel,provider_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.communication_delivery_logs enable row level security;
revoke all on public.communication_delivery_logs from public,anon,authenticated;
create index communication_delivery_logs_institution on public.communication_delivery_logs(institution_id,created_at desc);
create trigger touch_communication_delivery_logs before update on public.communication_delivery_logs for each row execute function public.touch_updated_at();

create table public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  campaign_id uuid not null,
  foreign key (campaign_id,institution_id) references public.communication_campaigns(id,institution_id),
  timezone text not null,
  interval_days int not null check(interval_days between 1 and 365),
  active boolean not null default true,
  unique(campaign_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.notification_schedules enable row level security;
revoke all on public.notification_schedules from public,anon,authenticated;
create index notification_schedules_institution on public.notification_schedules(institution_id,created_at desc);
create trigger touch_notification_schedules before update on public.notification_schedules for each row execute function public.touch_updated_at();

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  user_id uuid not null,
  category text not null,
  enabled boolean not null default true,
  unique(user_id,category),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
create index notification_preferences_institution on public.notification_preferences(institution_id,created_at desc);
create trigger touch_notification_preferences before update on public.notification_preferences for each row execute function public.touch_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  staff_id uuid,
  foreign key (staff_id,institution_id) references public.staff(id,institution_id),
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
create index notifications_institution on public.notifications(institution_id,created_at desc);
create trigger touch_notifications before update on public.notifications for each row execute function public.touch_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  actor_id uuid,
  table_name text not null,
  action text not null,
  record_id uuid not null,
  changes jsonb,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
create index audit_logs_institution on public.audit_logs(institution_id,created_at desc);

create table public.system_activity_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  actor_id uuid,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  unique(id,institution_id)
);
alter table public.system_activity_logs enable row level security;
revoke all on public.system_activity_logs from public,anon,authenticated;
create index system_activity_logs_institution on public.system_activity_logs(institution_id,created_at desc);

create table public.provider_webhook_events(
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  provider_id text not null,
  delivery_status text not null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider,event_key)
);
alter table public.provider_webhook_events enable row level security;
revoke all on public.provider_webhook_events from public,anon,authenticated;
create unique index current_student_enrollment on public.student_enrollments(student_id) where ends_on is null;
create index enrollment_batch_period on public.student_enrollments(batch_id,starts_on,ends_on);
create index staff_assignment_scope on public.staff_assignments(staff_id,batch_id) where active;
create index schedule_by_assignment on public.timetable_entries(staff_assignment_id,starts_at,ends_at) where status <> 'cancelled';
create index sessions_by_assignment on public.class_sessions(staff_assignment_id,date);
create index attendance_by_student on public.attendance_records(student_id,session_id);
create index scores_by_student on public.assessment_scores(student_id,assessment_id);
create index submissions_by_student on public.assignment_submissions(student_id,assignment_id);
create index queued_campaigns on public.communication_campaigns(status,next_run_at) where status in('approved','scheduled','queued');
create index delivery_work on public.communication_delivery_logs(campaign_id,status);
commit;
