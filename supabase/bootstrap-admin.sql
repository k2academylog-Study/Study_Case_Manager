-- Run once in the Supabase SQL editor after adding the initial administrator in Auth.
-- Replace admin@example.test and Your institution with the institution's values.
do $$
declare
  administrator uuid;
  institution uuid;
  profile uuid;
  email_address constant text:='k2academylog@gmail.com';
  school_name constant text:='Your institution';
begin
  select id into administrator from auth.users where lower(email)=lower(email_address);
  if administrator is null then raise exception 'Create and verify this Auth user first'; end if;
  if exists(select 1 from public.profiles where user_id=administrator) then raise exception 'This user already has institutional membership'; end if;
  insert into public.institutions(name) values(school_name) returning id into institution;
  insert into public.institution_settings(institution_id,institution_name,contact_email) values(institution,school_name,email_address);
  insert into public.profiles(institution_id,user_id,display_name) values(institution,administrator,'Administrator') returning id into profile;
  insert into public.user_roles(institution_id,profile_id,role) values(institution,profile,'admin');
  insert into public.classes(institution_id,name) select institution,'Class '||grade from generate_series(6,12) grade;
end $$;
