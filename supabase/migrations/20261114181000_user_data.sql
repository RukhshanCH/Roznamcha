create table public.journal_entries (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  local_id bigint not null,
  serial_no integer not null,
  name text not null default '',
  mobile_number text not null default '',
  total numeric not null default 0,
  advance numeric not null default 0,
  remaining numeric not null default 0,
  remaining_plus numeric not null default 0,
  note text not null default '',
  payment_method text not null default 'cash' check (payment_method in ('cash', 'online')),
  date date not null,
  created_at timestamptz not null,
  debt_id text,
  is_backup boolean not null default false,
  backup_id text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  sync_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, installation_id, local_id)
);

create table public.customers (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  local_id bigint not null,
  serial_no integer not null,
  name text not null default '',
  mobile_number text not null default '',
  date date not null,
  created_at timestamptz not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  sync_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, installation_id, local_id)
);

create table public.expenses (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  local_id bigint not null,
  serial_no integer not null,
  name text not null default '',
  description text not null default '',
  amount numeric not null default 0,
  date date not null,
  created_at timestamptz not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  sync_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, installation_id, local_id)
);

create table public.payments (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  local_id bigint not null,
  serial_no integer not null,
  name text not null default '',
  description text not null default '',
  amount numeric not null default 0,
  date date not null,
  created_at timestamptz not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  sync_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, installation_id, local_id)
);

create table public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  source_installation_id uuid not null,
  sync_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, key, source_installation_id)
);

create table public.invoice_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_date date not null,
  sequence bigint not null check (sequence > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, invoice_date)
);

create table public.migration_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  source_db_version integer not null,
  status text not null check (status in ('pending', 'running', 'failed', 'verified')),
  store_counts jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, installation_id)
);

create index journal_entries_user_date_idx
  on public.journal_entries (user_id, date, is_deleted, serial_no);
create index customers_user_date_idx
  on public.customers (user_id, date, is_deleted, serial_no);
create index expenses_user_date_idx
  on public.expenses (user_id, date, is_deleted, serial_no);
create index payments_user_date_idx
  on public.payments (user_id, date, is_deleted, serial_no);

create or replace function public.set_sync_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  if tg_op = 'UPDATE' then
    new.sync_version := old.sync_version + 1;
  else
    new.sync_version := 1;
  end if;
  return new;
end;
$$;
revoke all on function public.set_sync_metadata() from public, anon, authenticated;

create trigger journal_entries_sync_metadata
before insert or update on public.journal_entries
for each row execute function public.set_sync_metadata();
create trigger customers_sync_metadata
before insert or update on public.customers
for each row execute function public.set_sync_metadata();
create trigger expenses_sync_metadata
before insert or update on public.expenses
for each row execute function public.set_sync_metadata();
create trigger payments_sync_metadata
before insert or update on public.payments
for each row execute function public.set_sync_metadata();
create trigger user_settings_sync_metadata
before insert or update on public.user_settings
for each row execute function public.set_sync_metadata();

alter table public.journal_entries enable row level security;
alter table public.customers enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;
alter table public.user_settings enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.migration_runs enable row level security;

create policy "Users manage their journal entries"
  on public.journal_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their customers"
  on public.customers for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their expenses"
  on public.expenses for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their payments"
  on public.payments for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their settings"
  on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their invoice counters"
  on public.invoice_counters for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage their migration runs"
  on public.migration_runs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on
  public.journal_entries,
  public.customers,
  public.expenses,
  public.payments,
  public.user_settings,
  public.invoice_counters,
  public.migration_runs
to authenticated;
revoke all on
  public.journal_entries,
  public.customers,
  public.expenses,
  public.payments,
  public.user_settings,
  public.invoice_counters,
  public.migration_runs
from anon;

create or replace function public.next_invoice_sequence(p_date date)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_sequence bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.invoice_counters (user_id, invoice_date, sequence)
  values ((select auth.uid()), p_date, 1)
  on conflict (user_id, invoice_date)
  do update set
    sequence = public.invoice_counters.sequence + 1,
    updated_at = pg_catalog.now()
  returning sequence into next_sequence;

  return next_sequence;
end;
$$;

revoke all on function public.next_invoice_sequence(date) from public, anon;
grant execute on function public.next_invoice_sequence(date) to authenticated;
