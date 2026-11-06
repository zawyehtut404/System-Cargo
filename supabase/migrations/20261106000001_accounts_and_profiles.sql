alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists avatar_url text not null default '';

update public.profiles p
set email = coalesce(u.email, '')
from auth.users u
where u.id = p.id and p.email = '';

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
begin
  select b.id into v_branch_id
  from public.branches b
  where b.code = 'MAIN';

  insert into public.profiles (id, email, full_name, role, branch_id, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    'staff',
    v_branch_id,
    false
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_user_email_sync on auth.users;

create trigger auth_user_email_sync
after update of email on auth.users
for each row execute function private.sync_auth_user_email();

revoke all on function private.sync_auth_user_email() from public, anon, authenticated;

drop policy if exists profiles_read_branch_staff on public.profiles;

create policy profiles_read_branch_staff
on public.profiles for select to authenticated
using ((select private.can_access_branch(branch_id)));

revoke update on public.profiles from authenticated;

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_avatar_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'A full name is required';
  end if;
  if pg_catalog.length(coalesce(p_avatar_url, '')) > 2048 then
    raise exception 'The profile image URL is too long';
  end if;

  update public.profiles
  set full_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_full_name, '')), 120),
      phone = pg_catalog.left(pg_catalog.btrim(coalesce(p_phone, '')), 40),
      avatar_url = coalesce(p_avatar_url, '')
  where id = (select auth.uid())
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_profile.id,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'avatar_url', v_profile.avatar_url,
    'role', v_profile.role,
    'branch_id', v_profile.branch_id,
    'is_active', v_profile.is_active
  );
end;
$$;

create or replace function public.admin_update_staff_profile(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_role text,
  p_branch_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'Invalid account role';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'A full name is required';
  end if;
  if p_is_active and p_branch_id is null then
    raise exception 'An active account must be assigned to a branch';
  end if;
  if p_user_id = (select auth.uid()) and (p_role <> 'admin' or not p_is_active or p_branch_id is null) then
    raise exception 'You cannot deactivate or demote your own administrator account';
  end if;

  update public.profiles
  set full_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_full_name, '')), 120),
      phone = pg_catalog.left(pg_catalog.btrim(coalesce(p_phone, '')), 40),
      role = p_role,
      branch_id = p_branch_id,
      is_active = p_is_active
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Account not found';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_profile.id,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'phone', v_profile.phone,
    'avatar_url', v_profile.avatar_url,
    'role', v_profile.role,
    'branch_id', v_profile.branch_id,
    'is_active', v_profile.is_active
  );
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public, anon;
revoke all on function public.admin_update_staff_profile(uuid, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
grant execute on function public.admin_update_staff_profile(uuid, text, text, text, uuid, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_public_read on storage.objects;
drop policy if exists profile_avatars_insert_own on storage.objects;
drop policy if exists profile_avatars_update_own on storage.objects;
drop policy if exists profile_avatars_delete_own on storage.objects;

create policy profile_avatars_public_read
on storage.objects for select to public
using (bucket_id = 'profile-avatars');

create policy profile_avatars_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_active_user())
);

create policy profile_avatars_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_active_user())
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_active_user())
);

create policy profile_avatars_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_active_user())
);
