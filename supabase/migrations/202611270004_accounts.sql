begin;
create function public.link_invited_staff(p_institution uuid,p_staff uuid,p_user uuid,p_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  insert into public.profiles(institution_id,staff_id,user_id,display_name) values(p_institution,p_staff,p_user,p_name)
    returning id into result;
  insert into public.user_roles(institution_id,profile_id,role) values(p_institution,result,'staff');
  return result;
end $$;
revoke all on function public.link_invited_staff(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.link_invited_staff(uuid,uuid,uuid,text) to service_role;
create unique index unique_staff_account on public.profiles(staff_id) where staff_id is not null;
commit;
