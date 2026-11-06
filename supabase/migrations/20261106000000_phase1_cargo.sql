create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.branches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.branches (code, name)
values ('MAIN', 'Main Branch')
on conflict (code) do nothing;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  branch_id uuid references public.branches (id),
  is_active boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.customers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  full_name text not null check (pg_catalog.length(pg_catalog.btrim(full_name)) > 0),
  phone text,
  address text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.cargo_shipments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  receipt_no text not null unique check (pg_catalog.length(pg_catalog.btrim(receipt_no)) between 1 and 80),
  tracking_code text not null unique default pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
  branch_id uuid not null references public.branches (id),
  sender_id uuid not null references public.customers (id),
  receiver_id uuid not null references public.customers (id),
  route_from text not null default '',
  route_to text not null default '',
  box_size text not null default '',
  weight_kg numeric(10, 3) not null default 0 check (weight_kg >= 0),
  item_description text not null default '',
  declared_value numeric(12, 2) not null default 0 check (declared_value >= 0),
  declared_currency text not null default 'SGD',
  fee_subtotal numeric(12, 2) not null default 0 check (fee_subtotal >= 0),
  fee_currency text not null default 'SGD',
  exchange_rate numeric(14, 4) not null default 1 check (exchange_rate > 0),
  total_local numeric(14, 2) not null default 0 check (total_local >= 0),
  local_currency text not null default 'MMK',
  cargo_status text not null default 'booked'
    check (cargo_status in ('booked', 'in_transit', 'arrived', 'ready_for_pickup', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0 and amount_paid <= total_local),
  receipt_data jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.cargo_items (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  shipment_id uuid not null references public.cargo_shipments (id) on delete cascade,
  description text not null default '',
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.cargo_status_history (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  shipment_id uuid not null references public.cargo_shipments (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  status text not null
    check (status in ('booked', 'in_transit', 'arrived', 'ready_for_pickup', 'delivered', 'cancelled')),
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  shipment_id uuid not null references public.cargo_shipments (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'MMK',
  payment_method text not null default 'Other',
  paid_by text not null default 'Sender',
  note text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.activity_logs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  branch_id uuid references public.branches (id),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create index cargo_shipments_branch_created_idx on public.cargo_shipments (branch_id, created_at desc);
create index cargo_shipments_tracking_code_idx on public.cargo_shipments (tracking_code);
create index cargo_shipments_receipt_no_idx on public.cargo_shipments (receipt_no);
create index customers_branch_phone_idx on public.customers (branch_id, phone);
create index cargo_items_shipment_idx on public.cargo_items (shipment_id);
create index cargo_status_history_shipment_created_idx on public.cargo_status_history (shipment_id, created_at desc);
create index payments_shipment_created_idx on public.payments (shipment_id, created_at desc);
create index activity_logs_branch_created_idx on public.activity_logs (branch_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger branches_set_updated_at
before update on public.branches
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute function private.set_updated_at();

create trigger cargo_shipments_set_updated_at
before update on public.cargo_shipments
for each row execute function private.set_updated_at();

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

  insert into public.profiles (id, full_name, role, branch_id, is_active)
  values (
    new.id,
    coalesce(nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    'staff',
    v_branch_id,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.is_active
  );
$$;

create or replace function private.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and (p.role = 'admin' or p.branch_id = p_branch_id)
  );
$$;

revoke all on function private.is_active_user() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.can_access_branch(uuid) from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.can_access_branch(uuid) to authenticated;

create or replace function private.log_shipment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.cargo_status is distinct from old.cargo_status then
    insert into public.cargo_status_history (shipment_id, branch_id, status, changed_by)
    values (new.id, new.branch_id, new.cargo_status, auth.uid());

    insert into public.activity_logs (branch_id, actor_id, action, entity, entity_id, details)
    values (
      new.branch_id,
      auth.uid(),
      case when tg_op = 'INSERT' then 'shipment_created' else 'status_changed' end,
      'cargo_shipment',
      new.id,
      pg_catalog.jsonb_build_object('status', new.cargo_status)
    );
  end if;
  return new;
end;
$$;

create trigger cargo_shipments_log_status
after insert or update of cargo_status on public.cargo_shipments
for each row execute function private.log_shipment_status();

create or replace function private.validate_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(14, 2);
  v_paid numeric(14, 2);
begin
  select s.total_local, s.amount_paid
  into v_total, v_paid
  from public.cargo_shipments s
  where s.id = new.shipment_id
  for update;

  if not found then
    raise exception 'Shipment not found';
  end if;
  if new.amount > v_total - v_paid then
    raise exception 'Payment exceeds the outstanding balance';
  end if;
  return new;
end;
$$;

create trigger payments_validate_amount
before insert on public.payments
for each row execute function private.validate_payment();

create or replace function private.apply_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cargo_shipments s
  set amount_paid = s.amount_paid + new.amount,
      payment_status = case
        when s.amount_paid + new.amount >= s.total_local then 'paid'
        when s.amount_paid + new.amount > 0 then 'partial'
        else 'unpaid'
      end
  where s.id = new.shipment_id;

  insert into public.activity_logs (branch_id, actor_id, action, entity, entity_id, details)
  select s.branch_id, new.created_by, 'payment_recorded', 'payment', new.id,
         pg_catalog.jsonb_build_object('shipment_id', new.shipment_id, 'amount', new.amount, 'currency', new.currency)
  from public.cargo_shipments s
  where s.id = new.shipment_id;
  return new;
end;
$$;

create trigger payments_apply_amount
after insert on public.payments
for each row execute function private.apply_payment();

create or replace function private.sync_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.total_local < new.amount_paid then
    raise exception 'Total cannot be less than the amount already paid';
  end if;
  new.payment_status := case
    when new.total_local > 0 and new.amount_paid >= new.total_local then 'paid'
    when new.amount_paid > 0 then 'partial'
    else 'unpaid'
  end;
  return new;
end;
$$;

create trigger cargo_shipments_sync_payment_status
before update of total_local on public.cargo_shipments
for each row execute function private.sync_payment_status();

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.log_shipment_status() from public, anon, authenticated;
revoke all on function private.validate_payment() from public, anon, authenticated;
revoke all on function private.apply_payment() from public, anon, authenticated;
revoke all on function private.sync_payment_status() from public, anon, authenticated;

create or replace function public.create_shipment(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_sender_id uuid;
  v_receiver_id uuid;
  v_shipment public.cargo_shipments%rowtype;
  v_initial_payment numeric(14, 2);
begin
  if (select auth.uid()) is null or not private.is_active_user() then
    raise exception 'An active staff account is required';
  end if;

  v_branch_id := (p_payload ->> 'branch_id')::uuid;
  if not private.can_access_branch(v_branch_id) then
    raise exception 'You cannot create shipments for this branch';
  end if;

  if pg_catalog.length(pg_catalog.btrim(coalesce(p_payload ->> 'receipt_no', ''))) = 0 then
    raise exception 'Receipt number is required';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_payload #>> '{sender,name}', ''))) = 0
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_payload #>> '{receiver,name}', ''))) = 0 then
    raise exception 'Sender and receiver names are required';
  end if;

  insert into public.customers (branch_id, full_name, phone, address, created_by)
  values (
    v_branch_id,
    pg_catalog.btrim(p_payload #>> '{sender,name}'),
    nullif(pg_catalog.btrim(p_payload #>> '{sender,phone}'), ''),
    nullif(pg_catalog.btrim(p_payload #>> '{sender,address}'), ''),
    (select auth.uid())
  )
  returning id into v_sender_id;

  insert into public.customers (branch_id, full_name, phone, address, created_by)
  values (
    v_branch_id,
    pg_catalog.btrim(p_payload #>> '{receiver,name}'),
    nullif(pg_catalog.btrim(p_payload #>> '{receiver,phone}'), ''),
    nullif(pg_catalog.btrim(p_payload #>> '{receiver,address}'), ''),
    (select auth.uid())
  )
  returning id into v_receiver_id;

  insert into public.cargo_shipments (
    receipt_no, branch_id, sender_id, receiver_id, route_from, route_to, box_size, weight_kg,
    item_description, declared_value, declared_currency, fee_subtotal, fee_currency,
    exchange_rate, total_local, local_currency, receipt_data, created_by, created_at
  )
  values (
    pg_catalog.btrim(p_payload ->> 'receipt_no'),
    v_branch_id,
    v_sender_id,
    v_receiver_id,
    coalesce(p_payload ->> 'route_from', ''),
    coalesce(p_payload ->> 'route_to', ''),
    coalesce(p_payload ->> 'box_size', ''),
    coalesce(nullif(p_payload ->> 'weight_kg', '')::numeric, 0),
    coalesce(p_payload ->> 'item_description', ''),
    coalesce(nullif(p_payload ->> 'declared_value', '')::numeric, 0),
    coalesce(nullif(p_payload ->> 'declared_currency', ''), 'SGD'),
    coalesce(nullif(p_payload ->> 'fee_subtotal', '')::numeric, 0),
    coalesce(nullif(p_payload ->> 'fee_currency', ''), 'SGD'),
    coalesce(nullif(p_payload ->> 'exchange_rate', '')::numeric, 1),
    coalesce(nullif(p_payload ->> 'total_local', '')::numeric, 0),
    coalesce(nullif(p_payload ->> 'local_currency', ''), 'MMK'),
    coalesce(p_payload -> 'receipt_data', '{}'::jsonb),
    (select auth.uid()),
    coalesce(nullif(p_payload ->> 'created_at', '')::timestamptz, pg_catalog.now())
  )
  returning * into v_shipment;

  insert into public.cargo_items (shipment_id, description)
  values (v_shipment.id, v_shipment.item_description);

  v_initial_payment := coalesce(nullif(p_payload ->> 'initial_payment_amount', '')::numeric, 0);
  if v_initial_payment > 0 then
    insert into public.payments (shipment_id, amount, currency, payment_method, paid_by, created_by)
    values (
      v_shipment.id,
      v_initial_payment,
      v_shipment.local_currency,
      coalesce(nullif(p_payload ->> 'payment_method', ''), 'Other'),
      coalesce(nullif(p_payload ->> 'paid_by', ''), 'Sender'),
      (select auth.uid())
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_shipment.id,
    'receipt_no', v_shipment.receipt_no,
    'tracking_code', v_shipment.tracking_code,
    'cargo_status', v_shipment.cargo_status
  );
end;
$$;

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
  where s.tracking_code = pg_catalog.lower(pg_catalog.btrim(p_tracking_code))
    and p_tracking_code ~ '^[0-9A-Fa-f]{32}$'
  limit 1;
$$;

create or replace function public.update_shipment(p_shipment_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shipment public.cargo_shipments%rowtype;
begin
  if (select auth.uid()) is null or not private.is_active_user() then
    raise exception 'An active staff account is required';
  end if;

  select s.* into v_shipment
  from public.cargo_shipments s
  where s.id = p_shipment_id
  for update;

  if not found or not private.can_access_branch(v_shipment.branch_id) then
    raise exception 'Shipment not found or access denied';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_payload ->> 'receipt_no', ''))) = 0 then
    raise exception 'Receipt number is required';
  end if;
  if coalesce(nullif(p_payload ->> 'total_local', '')::numeric, 0) < v_shipment.amount_paid then
    raise exception 'Total cannot be less than the amount already paid';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_payload #>> '{sender,name}', ''))) = 0
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_payload #>> '{receiver,name}', ''))) = 0 then
    raise exception 'Sender and receiver names are required';
  end if;

  update public.customers
  set full_name = pg_catalog.btrim(p_payload #>> '{sender,name}'),
      phone = nullif(pg_catalog.btrim(p_payload #>> '{sender,phone}'), ''),
      address = nullif(pg_catalog.btrim(p_payload #>> '{sender,address}'), '')
  where id = v_shipment.sender_id;

  update public.customers
  set full_name = pg_catalog.btrim(p_payload #>> '{receiver,name}'),
      phone = nullif(pg_catalog.btrim(p_payload #>> '{receiver,phone}'), ''),
      address = nullif(pg_catalog.btrim(p_payload #>> '{receiver,address}'), '')
  where id = v_shipment.receiver_id;

  update public.cargo_shipments
  set receipt_no = pg_catalog.btrim(p_payload ->> 'receipt_no'),
      route_from = coalesce(p_payload ->> 'route_from', ''),
      route_to = coalesce(p_payload ->> 'route_to', ''),
      box_size = coalesce(p_payload ->> 'box_size', ''),
      weight_kg = coalesce(nullif(p_payload ->> 'weight_kg', '')::numeric, 0),
      item_description = coalesce(p_payload ->> 'item_description', ''),
      declared_value = coalesce(nullif(p_payload ->> 'declared_value', '')::numeric, 0),
      declared_currency = coalesce(nullif(p_payload ->> 'declared_currency', ''), 'SGD'),
      fee_subtotal = coalesce(nullif(p_payload ->> 'fee_subtotal', '')::numeric, 0),
      fee_currency = coalesce(nullif(p_payload ->> 'fee_currency', ''), 'SGD'),
      exchange_rate = coalesce(nullif(p_payload ->> 'exchange_rate', '')::numeric, 1),
      total_local = coalesce(nullif(p_payload ->> 'total_local', '')::numeric, 0),
      local_currency = coalesce(nullif(p_payload ->> 'local_currency', ''), 'MMK'),
      receipt_data = coalesce(p_payload -> 'receipt_data', '{}'::jsonb)
  where id = p_shipment_id
  returning * into v_shipment;

  update public.cargo_items
  set description = v_shipment.item_description
  where shipment_id = v_shipment.id;

  return pg_catalog.jsonb_build_object(
    'id', v_shipment.id,
    'receipt_no', v_shipment.receipt_no,
    'tracking_code', v_shipment.tracking_code,
    'cargo_status', v_shipment.cargo_status
  );
end;
$$;

revoke all on function public.create_shipment(jsonb) from public, anon;
grant execute on function public.create_shipment(jsonb) to authenticated;
revoke all on function public.track_shipment(text) from public;
grant execute on function public.track_shipment(text) to anon, authenticated;
revoke all on function public.update_shipment(uuid, jsonb) from public, anon;
grant execute on function public.update_shipment(uuid, jsonb) to authenticated;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.cargo_shipments enable row level security;
alter table public.cargo_items enable row level security;
alter table public.cargo_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.activity_logs enable row level security;

create policy branches_read_active
on public.branches for select to authenticated
using ((select private.is_active_user()));

create policy branches_admin_manage
on public.branches for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy profiles_read_self_or_admin
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_admin_update
on public.profiles for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy customers_read_branch
on public.customers for select to authenticated
using ((select private.can_access_branch(branch_id)));

create policy customers_create_branch
on public.customers for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_access_branch(branch_id))
);

create policy customers_update_branch
on public.customers for update to authenticated
using ((select private.can_access_branch(branch_id)))
with check ((select private.can_access_branch(branch_id)));

create policy shipments_read_branch
on public.cargo_shipments for select to authenticated
using ((select private.can_access_branch(branch_id)));

create policy shipments_create_branch
on public.cargo_shipments for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_access_branch(branch_id))
);

create policy shipments_update_branch
on public.cargo_shipments for update to authenticated
using ((select private.can_access_branch(branch_id)))
with check ((select private.can_access_branch(branch_id)));

create policy items_read_branch
on public.cargo_items for select to authenticated
using (exists (
  select 1 from public.cargo_shipments s
  where s.id = shipment_id and (select private.can_access_branch(s.branch_id))
));

create policy items_create_branch
on public.cargo_items for insert to authenticated
with check (exists (
  select 1 from public.cargo_shipments s
  where s.id = shipment_id and (select private.can_access_branch(s.branch_id))
));

create policy items_update_branch
on public.cargo_items for update to authenticated
using (exists (
  select 1 from public.cargo_shipments s
  where s.id = shipment_id and (select private.can_access_branch(s.branch_id))
))
with check (exists (
  select 1 from public.cargo_shipments s
  where s.id = shipment_id and (select private.can_access_branch(s.branch_id))
));

create policy status_history_read_branch
on public.cargo_status_history for select to authenticated
using ((select private.can_access_branch(branch_id)));

create policy payments_read_branch
on public.payments for select to authenticated
using (exists (
  select 1 from public.cargo_shipments s
  where s.id = shipment_id and (select private.can_access_branch(s.branch_id))
));

create policy payments_create_branch
on public.payments for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.cargo_shipments s
    where s.id = shipment_id and (select private.can_access_branch(s.branch_id))
  )
);

create policy activity_logs_read_admin
on public.activity_logs for select to authenticated
using ((select private.is_admin()));

revoke all on public.branches, public.profiles, public.customers, public.cargo_shipments,
  public.cargo_items, public.cargo_status_history, public.payments, public.activity_logs
from anon, authenticated;

grant select on public.branches to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.customers to authenticated;
grant update (full_name, phone, address) on public.customers to authenticated;
grant select on public.cargo_shipments to authenticated;
grant insert (
  receipt_no, branch_id, sender_id, receiver_id, route_from, route_to, box_size, weight_kg,
  item_description, declared_value, declared_currency, fee_subtotal, fee_currency,
  exchange_rate, total_local, local_currency, receipt_data, created_by, created_at
) on public.cargo_shipments to authenticated;
grant update (
  receipt_no, route_from, route_to, box_size, weight_kg, item_description,
  declared_value, declared_currency, fee_subtotal, fee_currency, exchange_rate,
  total_local, local_currency, cargo_status, receipt_data
) on public.cargo_shipments to authenticated;
grant select, insert on public.cargo_items to authenticated;
grant update (description) on public.cargo_items to authenticated;
grant select on public.cargo_status_history to authenticated;
grant select on public.payments to authenticated;
grant insert (shipment_id, amount, currency, payment_method, paid_by, note, created_by)
on public.payments to authenticated;
grant select on public.activity_logs to authenticated;
