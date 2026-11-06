create or replace function public.track_shipment(p_tracking_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'receipt_no', s.receipt_no,
    'route_from', s.route_from,
    'route_to', s.route_to,
    'cargo_status', s.cargo_status,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'history', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('status', h.status, 'created_at', h.created_at)
        order by h.created_at
      )
      from public.cargo_status_history h
      where h.shipment_id = s.id
    ), '[]'::jsonb)
  )
  from public.cargo_shipments s
  where (
    (p_tracking_code ~ '^[0-9A-Fa-f]{32}$'
      and s.tracking_code = pg_catalog.lower(pg_catalog.btrim(p_tracking_code)))
    or pg_catalog.upper(s.receipt_no) = pg_catalog.upper(pg_catalog.btrim(p_tracking_code))
  )
  limit 1;
$$;

revoke all on function public.track_shipment(text) from public;
grant execute on function public.track_shipment(text) to anon, authenticated;

grant insert (code, name, address, phone, is_active) on public.branches to authenticated;
grant update (code, name, address, phone, is_active) on public.branches to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.company_settings (
  id boolean primary key default true check (id),
  logo_path text not null default '',
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.company_settings (id, logo_path)
values (true, '')
on conflict (id) do nothing;

alter table public.company_settings enable row level security;
revoke all on public.company_settings from anon, authenticated;
grant select on public.company_settings to anon, authenticated;
grant update (logo_path, updated_at) on public.company_settings to authenticated;

drop policy if exists company_settings_public_read on public.company_settings;
drop policy if exists company_settings_admin_update on public.company_settings;

create policy company_settings_public_read
on public.company_settings for select to anon, authenticated
using (id = true);

create policy company_settings_admin_update
on public.company_settings for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists company_assets_public_read on storage.objects;
drop policy if exists company_assets_admin_insert on storage.objects;
drop policy if exists company_assets_admin_update on storage.objects;
drop policy if exists company_assets_admin_delete on storage.objects;

create policy company_assets_public_read
on storage.objects for select to public
using (bucket_id = 'company-assets');

create policy company_assets_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-assets'
  and name = 'company-logo'
  and (select private.is_admin())
);

create policy company_assets_admin_update
on storage.objects for update to authenticated
using (
  bucket_id = 'company-assets'
  and name = 'company-logo'
  and (select private.is_admin())
)
with check (
  bucket_id = 'company-assets'
  and name = 'company-logo'
  and (select private.is_admin())
);

create policy company_assets_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-assets'
  and name = 'company-logo'
  and (select private.is_admin())
);
