-- Mutations run as the migration owner; each RPC derives and validates auth.uid().
-- Keep the empty search_path set by the original function definitions.
alter function public.sync_user_record(text, jsonb, bigint) security definer;
alter function public.delete_user_record(text, uuid, bigint) security definer;
alter function public.sync_user_setting(text, jsonb, uuid, bigint) security definer;
alter function public.migrate_user_setting(text, jsonb, text, bigint, jsonb) security definer;
alter function public.migrate_user_record(text, jsonb) security definer;
alter function public.migrate_invoice_counter(date, bigint) security definer;
alter function public.next_invoice_sequence(date) security definer;
alter function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb, jsonb) security definer;
alter function public.sync_user_record(text, jsonb, bigint) set search_path = '';
alter function public.delete_user_record(text, uuid, bigint) set search_path = '';
alter function public.sync_user_setting(text, jsonb, uuid, bigint) set search_path = '';
alter function public.migrate_user_setting(text, jsonb, text, bigint, jsonb) set search_path = '';
alter function public.migrate_user_record(text, jsonb) set search_path = '';
alter function public.migrate_invoice_counter(date, bigint) set search_path = '';
alter function public.next_invoice_sequence(date) set search_path = '';
alter function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb, jsonb) set search_path = '';

create function public.set_user_migration_status(
  p_installation_id uuid,
  p_source_db_version integer,
  p_status text,
  p_store_counts jsonb,
  p_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_installation_id is null then
    raise exception 'Authenticated user and installation are required';
  end if;
  if p_source_db_version is null or p_source_db_version < 1
    or p_status is null or p_status not in ('pending', 'running', 'failed')
    or pg_catalog.jsonb_typeof(p_store_counts) is distinct from 'object' then
    raise exception 'Migration status payload is invalid';
  end if;

  insert into public.migration_runs (
    user_id, installation_id, source_db_version, status, store_counts,
    last_error, completed_at
  ) values (
    v_user_id, p_installation_id, p_source_db_version, p_status,
    p_store_counts, p_last_error, null
  )
  on conflict (user_id, installation_id) do update
  set source_db_version = excluded.source_db_version,
      status = excluded.status,
      store_counts = excluded.store_counts,
      last_error = excluded.last_error,
      updated_at = pg_catalog.now(),
      started_at = case
        when excluded.status = 'running' then pg_catalog.now()
        else public.migration_runs.started_at
      end,
      completed_at = null;
end;
$$;

revoke all on function public.set_user_migration_status(uuid, integer, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.set_user_migration_status(uuid, integer, text, jsonb, text)
  to authenticated;

revoke all on table
  public.journal_entries, public.customers, public.expenses, public.payments,
  public.user_settings, public.invoice_counters, public.migration_runs
  from public, anon;
revoke insert, update, delete on table
  public.journal_entries, public.customers, public.expenses, public.payments,
  public.user_settings, public.invoice_counters, public.migration_runs
  from authenticated;
grant select on table
  public.journal_entries, public.customers, public.expenses, public.payments,
  public.user_settings, public.migration_runs
  to authenticated;
revoke all on table public.invoice_counters from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
