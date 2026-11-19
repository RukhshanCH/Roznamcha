create or replace function public.migrate_invoice_counter(
  p_invoice_date date,
  p_sequence bigint
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_invoice_date is null or p_sequence is null or p_sequence < 1 then
    raise exception 'Invoice counter migration values are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':invoice-counter:' || p_invoice_date::text,
      0
    )
  );

  insert into public.invoice_counters (user_id, invoice_date, sequence)
  values (v_user_id, p_invoice_date, p_sequence)
  on conflict (user_id, invoice_date) do update
  set sequence = greatest(public.invoice_counters.sequence, excluded.sequence),
      updated_at = pg_catalog.now()
  returning sequence into v_sequence;

  return v_sequence;
end;
$$;

create or replace function public.next_invoice_sequence(p_date date)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_date is null then
    raise exception 'Invoice date is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':invoice-counter:' || p_date::text,
      0
    )
  );

  insert into public.invoice_counters (user_id, invoice_date, sequence)
  values (v_user_id, p_date, 1)
  on conflict (user_id, invoice_date) do update
  set sequence = public.invoice_counters.sequence + 1,
      updated_at = pg_catalog.now()
  returning sequence into v_sequence;

  return v_sequence;
end;
$$;

revoke all on function public.migrate_invoice_counter(date, bigint) from public, anon;
revoke all on function public.next_invoice_sequence(date) from public, anon;
grant execute on function public.migrate_invoice_counter(date, bigint) to authenticated;
grant execute on function public.next_invoice_sequence(date) to authenticated;
revoke delete on public.invoice_counters from authenticated;

create or replace function public.preserve_invoice_counter_monotonicity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.sequence := greatest(old.sequence, new.sequence);
  return new;
end;
$$;
revoke all on function public.preserve_invoice_counter_monotonicity() from public, anon, authenticated;

create trigger invoice_counters_monotonic_sequence
before update on public.invoice_counters
for each row execute function public.preserve_invoice_counter_monotonicity();

drop function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb);

create function public.verify_user_migration(
  p_installation_id uuid,
  p_source_db_version integer,
  p_store_counts jsonb,
  p_records jsonb,
  p_settings jsonb,
  p_invoice_counter jsonb
)
returns table (verified boolean, record_versions jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_store text;
  v_table text;
  v_record jsonb;
  v_remote jsonb;
  v_record_id uuid;
  v_local_id bigint;
  v_sync_version bigint;
  v_actual_count bigint;
  v_key text;
  v_setting jsonb;
  v_remote_value jsonb;
  v_remote_version bigint;
  v_invoice_date date;
  v_expected_sequence bigint;
  v_actual_sequence bigint;
  v_versions jsonb := '[]'::jsonb;
  v_settings_installation_id constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_user_id is null or p_installation_id is null then
    raise exception 'Authenticated user and installation are required';
  end if;
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_settings) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_store_counts) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_invoice_counter) is distinct from 'object' then
    raise exception 'Migration verification payload is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_installation_id::text, 0)
  );

  -- Lock order is installation identity, sorted setting keys, then invoice-counter identity.
  -- Do not row-lock records: their triggers may acquire the installation lock after tuple locking.
  -- Custom transactions taking these identities in another order can deadlock; retry 40P01/40001.
  for v_store, v_table in
    select pairs.store_name, pairs.table_name
    from (values
      ('entries', 'journal_entries'),
      ('customers', 'customers'),
      ('expenses', 'expenses'),
      ('payments', 'payments')
    ) as pairs(store_name, table_name)
  loop
    if pg_catalog.jsonb_typeof(p_records -> v_store) is distinct from 'array'
      or pg_catalog.jsonb_array_length(p_records -> v_store)
        <> coalesce((p_store_counts ->> v_store)::bigint, -1) then
      return query select false, v_versions;
      return;
    end if;

    execute pg_catalog.format(
      'select count(*) from public.%I where user_id = $1 and installation_id = $2',
      v_table
    ) into v_actual_count using v_user_id, p_installation_id;
    if v_actual_count <> pg_catalog.jsonb_array_length(p_records -> v_store) then
      return query select false, v_versions;
      return;
    end if;

    for v_record in
      select item.value from pg_catalog.jsonb_array_elements(p_records -> v_store) as item(value)
    loop
      execute pg_catalog.format(
        'select pg_catalog.to_jsonb(target), target.id, target.local_id, target.sync_version
         from public.%I as target
         where target.user_id = $1 and target.installation_id = $2 and target.local_id = $3',
        v_table
      )
      into v_remote, v_record_id, v_local_id, v_sync_version
      using v_user_id, p_installation_id, (v_record ->> 'local_id')::bigint;

      if not found
        or v_remote ->> 'sync_version' is distinct from v_record ->> 'sync_version'
        or (v_remote - 'sync_version' - 'updated_at' - 'created_at')
          is distinct from (v_record - 'sync_version' - 'updated_at' - 'created_at')
        or (v_remote ->> 'created_at')::timestamptz
          is distinct from (v_record ->> 'created_at')::timestamptz then
        return query select false, v_versions;
        return;
      end if;

      v_versions := v_versions || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'store', v_store,
          'id', v_record_id,
          'local_id', v_local_id,
          'sync_version', v_sync_version
        )
      );
    end loop;
  end loop;

  if pg_catalog.jsonb_array_length(p_settings)
    <> coalesce((p_store_counts ->> 'settings')::bigint, -1) then
    return query select false, v_versions;
    return;
  end if;

  for v_key in
    select distinct item.value ->> 'key'
    from pg_catalog.jsonb_array_elements(p_settings) as item(value)
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || v_key, 0)
    );
  end loop;

  for v_setting in
    select item.value from pg_catalog.jsonb_array_elements(p_settings) as item(value)
  loop
    select target.value, target.sync_version
    into v_remote_value, v_remote_version
    from public.user_settings as target
    where target.user_id = v_user_id
      and target.key = v_setting ->> 'key'
      and target.source_installation_id = v_settings_installation_id;
    if not found
      or v_remote_value is distinct from v_setting -> 'value'
      or v_remote_version is distinct from (v_setting ->> 'sync_version')::bigint then
      return query select false, v_versions;
      return;
    end if;
  end loop;

  if p_invoice_counter <> '{}'::jsonb then
    if not (p_invoice_counter ? 'invoice_date')
      or not (p_invoice_counter ? 'sequence') then
      raise exception 'Invoice counter verification payload is invalid';
    end if;
    v_invoice_date := (p_invoice_counter ->> 'invoice_date')::date;
    v_expected_sequence := (p_invoice_counter ->> 'sequence')::bigint;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_user_id::text || ':invoice-counter:' || v_invoice_date::text,
        0
      )
    );
    select target.sequence
    into v_actual_sequence
    from public.invoice_counters as target
    where target.user_id = v_user_id and target.invoice_date = v_invoice_date;
    if not found or v_actual_sequence is distinct from v_expected_sequence then
      return query select false, v_versions;
      return;
    end if;
  end if;

  update public.migration_runs
  set status = 'verified',
      store_counts = p_store_counts,
      source_db_version = p_source_db_version,
      last_error = null,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where user_id = v_user_id and installation_id = p_installation_id;
  if not found then
    raise exception 'Migration run was not initialized';
  end if;

  return query select true, v_versions;
end;
$$;

create or replace function public.migrate_user_record(
  p_store text,
  p_payload jsonb
)
returns table (applied boolean, row_id uuid, sync_version bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_applied boolean;
  v_row_id uuid;
  v_sync_version bigint;
  v_remote jsonb;
  v_same boolean := false;
begin
  if v_user_id is null or (p_payload ->> 'user_id')::uuid is distinct from v_user_id then
    raise exception 'Authenticated user does not own this record';
  end if;
  if p_store not in ('entries', 'customers', 'expenses', 'payments') then
    raise exception 'Unsupported local data store';
  end if;

  select result.applied, result.row_id, result.sync_version
  into v_applied, v_row_id, v_sync_version
  from public.sync_user_record(p_store, p_payload, null) as result;

  if p_store = 'entries' then
    select pg_catalog.to_jsonb(target), target.id, target.sync_version
    into v_remote, v_row_id, v_sync_version
    from public.journal_entries as target
    where target.user_id = v_user_id
      and target.installation_id = (p_payload ->> 'installation_id')::uuid
      and target.local_id = (p_payload ->> 'local_id')::bigint
    for update;
  elsif p_store = 'customers' then
    select pg_catalog.to_jsonb(target), target.id, target.sync_version
    into v_remote, v_row_id, v_sync_version
    from public.customers as target
    where target.user_id = v_user_id
      and target.installation_id = (p_payload ->> 'installation_id')::uuid
      and target.local_id = (p_payload ->> 'local_id')::bigint
    for update;
  elsif p_store = 'expenses' then
    select pg_catalog.to_jsonb(target), target.id, target.sync_version
    into v_remote, v_row_id, v_sync_version
    from public.expenses as target
    where target.user_id = v_user_id
      and target.installation_id = (p_payload ->> 'installation_id')::uuid
      and target.local_id = (p_payload ->> 'local_id')::bigint
    for update;
  else
    select pg_catalog.to_jsonb(target), target.id, target.sync_version
    into v_remote, v_row_id, v_sync_version
    from public.payments as target
    where target.user_id = v_user_id
      and target.installation_id = (p_payload ->> 'installation_id')::uuid
      and target.local_id = (p_payload ->> 'local_id')::bigint
    for update;
  end if;

  if found then
    v_same :=
      (v_remote - 'id' - 'sync_version' - 'updated_at' - 'created_at')
        = (p_payload - 'id' - 'sync_version' - 'updated_at' - 'created_at')
      and (v_remote ->> 'created_at')::timestamptz
        is not distinct from (p_payload ->> 'created_at')::timestamptz;
    return query select v_same, v_row_id, v_sync_version;
    return;
  end if;

  return query select coalesce(v_applied, false), v_row_id, v_sync_version;
end;
$$;

revoke all on function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.migrate_user_record(text, jsonb) from public, anon;
grant execute on function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.migrate_user_record(text, jsonb) to authenticated;
