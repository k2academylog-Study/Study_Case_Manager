begin;
alter table public.assignments add constraint assignment_attachment_path check (
  attachment_path is null or attachment_path like institution_id::text||'/assignment/'||id::text||'/%');
alter table public.staff add constraint staff_photo_path check (
  photo_path is null or photo_path like institution_id::text||'/staff/'||id::text||'/%');
alter table public.students add constraint student_photo_path check (
  photo_path is null or photo_path like institution_id::text||'/student/'||id::text||'/%');
alter table public.institution_settings add constraint institution_logo_scope check (
  logo_path is null or logo_path like institution_id::text||'/institution/'||id::text||'/%');
commit;
