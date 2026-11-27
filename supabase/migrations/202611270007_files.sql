begin;
create function public.record_file_path(p_type text,p_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare result text; site uuid:=public.actor_institution();
begin
  if site is null then return null; end if;
  case p_type
    when 'student' then
      if public.actor_admin() then select photo_path into result from public.students where institution_id=site and id=p_id; end if;
    when 'staff' then
      if public.actor_admin() or p_id=public.actor_staff() then select photo_path into result from public.staff where institution_id=site and id=p_id; end if;
    when 'assignment' then
      select attachment_path into result from public.assignments where institution_id=site and id=p_id and public.can_teach(staff_assignment_id);
    when 'institution' then
      if public.actor_admin() then select logo_path into result from public.institution_settings where institution_id=site and id=p_id; end if;
    else return null;
  end case;
  return result;
end $$;
revoke all on function public.record_file_path(text,uuid) from public,anon;
grant execute on function public.record_file_path(text,uuid) to authenticated;

create function public.can_upload_assignment(name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare folders text[]:=storage.foldername(name);
begin
  if folders[1] is distinct from public.actor_institution()::text or folders[2] is distinct from 'assignment' or
    folders[3] is null or folders[3] !~ '^[a-fA-F0-9-]{36}$' or not public.actor_permission('assignments') then return false; end if;
  return exists(select 1 from public.assignments a where a.id=folders[3]::uuid and public.can_teach(a.staff_assignment_id));
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.can_upload_assignment(text) from public,anon;
grant execute on function public.can_upload_assignment(text) to authenticated;
create policy staff_assignment_upload on storage.objects for insert to authenticated with check (
  bucket_id='academic-files' and public.can_upload_assignment(name));
create policy staff_assignment_files on storage.objects for select to authenticated using (
  bucket_id='academic-files' and (storage.foldername(name))[1]=(select public.actor_institution())::text
  and (storage.foldername(name))[2]='assignment' and exists (
    select 1 from public.assignments a where a.attachment_path=storage.objects.name and public.can_teach(a.staff_assignment_id)));
create policy staff_profile_photo on storage.objects for select to authenticated using (
  bucket_id='academic-files' and (storage.foldername(name))[1]=(select public.actor_institution())::text
  and (storage.foldername(name))[2]='staff' and exists (
    select 1 from public.staff s where s.id=(select public.actor_staff()) and s.photo_path=storage.objects.name));
create policy staff_unlinked_file_cleanup on storage.objects for delete to authenticated using (
  bucket_id='academic-files' and public.can_upload_assignment(name)
  and not exists(select 1 from public.assignments a where a.attachment_path=storage.objects.name));

create function public.set_record_file(p_type text,p_id uuid,p_path text) returns boolean
language plpgsql security definer set search_path='' as $$
declare site uuid:=public.actor_institution(); saved uuid;
begin
  if site is null or p_path not like site::text||'/'||p_type||'/'||p_id::text||'/%' then return false; end if;
  if not exists(select 1 from storage.objects where bucket_id='academic-files' and name=p_path) then return false; end if;
  if p_type='assignment' and public.actor_permission('assignments') then
    update public.assignments set attachment_path=p_path where id=p_id and institution_id=site and public.can_teach(staff_assignment_id) returning id into saved;
  elsif public.actor_admin() then
    case p_type
      when 'student' then update public.students set photo_path=p_path where id=p_id and institution_id=site returning id into saved;
      when 'staff' then update public.staff set photo_path=p_path where id=p_id and institution_id=site returning id into saved;
      when 'institution' then update public.institution_settings set logo_path=p_path where id=p_id and institution_id=site returning id into saved;
      else return false;
    end case;
  end if;
  return saved is not null;
end $$;
revoke all on function public.set_record_file(text,uuid,text) from public,anon;
grant execute on function public.set_record_file(text,uuid,text) to authenticated;
commit;
