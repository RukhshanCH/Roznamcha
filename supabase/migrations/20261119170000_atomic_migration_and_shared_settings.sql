create or replace function public.sync_user_setting(
  p_key text,
  p_value jsonb,
  p_installation_id uuid,
  p_expected_version bigint default null
)
returns table (applied boolean, sync_version bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_version bigint;
  v_updated_at timestamptz;
  v_same boolean := false;
  v_settings_installation_id constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_key is null or p_key = '' or p_installation_id is distinct from v_settings_installation_id then
    raise exception 'Setting identity is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_key, 0)
  );

  if p_expected_version is null then
    insert into public.user_settings (user_id, key, value, source_installation_id)
    values (v_user_id, p_key, p_value, v_settings_installation_id)
    on conflict (user_id, key, source_installation_id) do nothing
    returning user_settings.sync_version, user_settings.updated_at
    into v_version, v_updated_at;
    if found then
      return query select true, v_version, v_updated_at;
      return;
    end if;
  else
    update public.user_settings as target
    set value = p_value
    where target.user_id = v_user_id
      and target.key = p_key
      and target.source_installation_id = v_settings_installation_id
      and target.sync_version = p_expected_version
    returning target.sync_version, target.updated_at into v_version, v_updated_at;
    if found then
      return query select true, v_version, v_updated_at;
      return;
    end if;
  end if;

  select target.sync_version, target.updated_at, target.value = p_value
  into v_version, v_updated_at, v_same
  from public.user_settings as target
  where target.user_id = v_user_id
    and target.key = p_key
    and target.source_installation_id = v_settings_installation_id;
  return query select coalesce(v_same, false), v_version, v_updated_at;
end;
$$;

create or replace function public.migrate_user_setting(
  p_key text,
  p_value jsonb,
  p_resolution text default null,
  p_expected_version bigint default null,
  p_expected_cloud_value jsonb default null
)
returns table (
  applied boolean,
  value jsonb,
  sync_version bigint,
  updated_at timestamptz,
  conflict boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings_installation_id constant uuid := '00000000-0000-0000-0000-000000000000';
  v_cloud_value jsonb;
  v_cloud_version bigint;
  v_cloud_updated_at timestamptz;
  v_current_value jsonb;
  v_current_version bigint;
  v_current_updated_at timestamptz;
  v_has_different_value boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_key is null or p_key = '' or p_value is null then
    raise exception 'Setting migration identity or value is invalid';
  end if;
  if p_resolution is not null and p_resolution not in ('local', 'cloud') then
    raise exception 'Unsupported setting conflict resolution';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_key, 0)
  );

  select candidate.value, candidate.sync_version, candidate.updated_at
  into v_cloud_value, v_cloud_version, v_cloud_updated_at
  from public.user_settings as candidate
  where candidate.user_id = v_user_id and candidate.key = p_key
  order by
    (candidate.source_installation_id = v_settings_installation_id) desc,
    candidate.updated_at desc,
    candidate.source_installation_id
  limit 1;

  if p_resolution is null then
    select exists (
      select 1
      from public.user_settings as candidate
      where candidate.user_id = v_user_id
        and candidate.key = p_key
        and candidate.value is distinct from p_value
    ) into v_has_different_value;

    if v_has_different_value then
      return query select false, v_cloud_value, v_cloud_version, v_cloud_updated_at, true;
      return;
    end if;
  elsif p_resolution = 'cloud' then
    if v_cloud_value is null
      or p_expected_cloud_value is distinct from v_cloud_value
      or (p_expected_version is not null and p_expected_version is distinct from v_cloud_version) then
      return query select false, v_cloud_value, v_cloud_version, v_cloud_updated_at, true;
      return;
    end if;

    insert into public.user_settings (user_id, key, value, source_installation_id)
    values (v_user_id, p_key, v_cloud_value, v_settings_installation_id)
    on conflict (user_id, key, source_installation_id) do nothing;
  elsif p_resolution = 'local' then
    select target.value, target.sync_version, target.updated_at
    into v_current_value, v_current_version, v_current_updated_at
    from public.user_settings as target
    where target.user_id = v_user_id
      and target.key = p_key
      and target.source_installation_id = v_settings_installation_id
    for update;

    if found and v_current_value is not distinct from p_value then
      return query select true, v_current_value, v_current_version, v_current_updated_at, false;
      return;
    end if;

    if p_expected_cloud_value is distinct from v_cloud_value
      or (p_expected_version is not null and p_expected_version is distinct from v_cloud_version) then
      return query select false, v_cloud_value, v_cloud_version, v_cloud_updated_at, true;
      return;
    end if;

    select target.value, target.sync_version, target.updated_at
    into v_current_value, v_current_version, v_current_updated_at
    from public.user_settings as target
    where target.user_id = v_user_id
      and target.key = p_key
      and target.source_installation_id = v_settings_installation_id
    for update;

    if found then
      if v_current_value = p_value then
        return query select true, v_current_value, v_current_version, v_current_updated_at, false;
        return;
      end if;
      if p_expected_version is null or v_current_version <> p_expected_version then
        return query select false, v_current_value, v_current_version, v_current_updated_at, true;
        return;
      end if;

      update public.user_settings as target
      set value = p_value
      where target.user_id = v_user_id
        and target.key = p_key
        and target.source_installation_id = v_settings_installation_id
        and target.sync_version = p_expected_version
      returning target.value, target.sync_version, target.updated_at
      into v_current_value, v_current_version, v_current_updated_at;
      if found then
        return query select true, v_current_value, v_current_version, v_current_updated_at, false;
        return;
      end if;
    else
      insert into public.user_settings (user_id, key, value, source_installation_id)
      values (v_user_id, p_key, p_value, v_settings_installation_id)
      on conflict (user_id, key, source_installation_id) do nothing
      returning user_settings.value, user_settings.sync_version, user_settings.updated_at
      into v_current_value, v_current_version, v_current_updated_at;
      if found then
        return query select true, v_current_value, v_current_version, v_current_updated_at, false;
        return;
      end if;
    end if;
  end if;

  select target.value, target.sync_version, target.updated_at
  into v_current_value, v_current_version, v_current_updated_at
  from public.user_settings as target
  where target.user_id = v_user_id
    and target.key = p_key
    and target.source_installation_id = v_settings_installation_id
  for update;

  if not found and p_resolution is null then
    insert into public.user_settings (user_id, key, value, source_installation_id)
    values (v_user_id, p_key, p_value, v_settings_installation_id)
    on conflict (user_id, key, source_installation_id) do nothing
    returning user_settings.value, user_settings.sync_version, user_settings.updated_at
    into v_current_value, v_current_version, v_current_updated_at;
    if found then
      return query select true, v_current_value, v_current_version, v_current_updated_at, false;
      return;
    end if;

    select target.value, target.sync_version, target.updated_at
    into v_current_value, v_current_version, v_current_updated_at
    from public.user_settings as target
    where target.user_id = v_user_id
      and target.key = p_key
      and target.source_installation_id = v_settings_installation_id
    for update;
  elsif not found and p_resolution = 'cloud' then
    return query select false, v_cloud_value, v_cloud_version, v_cloud_updated_at, true;
    return;
  end if;

  return query select
    v_current_value = case when p_resolution = 'cloud' then v_cloud_value else p_value end,
    v_current_value,
    v_current_version,
    v_current_updated_at,
    v_current_value is distinct from case when p_resolution = 'cloud' then v_cloud_value else p_value end;
end;
$$;

create or replace function public.verify_user_migration(
  p_installation_id uuid,
  p_source_db_version integer,
  p_store_counts jsonb,
  p_records jsonb,
  p_settings jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_record jsonb;
  v_setting jsonb;
  v_remote jsonb;
  v_remote_value jsonb;
  v_remote_version bigint;
  v_actual_count bigint;
  v_settings_installation_id constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_user_id is null or p_installation_id is null then
    raise exception 'Authenticated user and installation are required';
  end if;
  if jsonb_typeof(p_records) is distinct from 'object'
    or jsonb_typeof(p_settings) is distinct from 'array'
    or jsonb_typeof(p_store_counts) is distinct from 'object' then
    raise exception 'Migration verification payload is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_installation_id::text, 0)
  );

  if jsonb_array_length(coalesce(p_records -> 'entries', '[]'::jsonb))
    <> coalesce((p_store_counts ->> 'entries')::bigint, -1) then
    return false;
  end if;
  select count(*) into v_actual_count
  from public.journal_entries
  where user_id = v_user_id and installation_id = p_installation_id;
  if v_actual_count <> jsonb_array_length(coalesce(p_records -> 'entries', '[]'::jsonb)) then
    return false;
  end if;
  for v_record in select value from jsonb_array_elements(coalesce(p_records -> 'entries', '[]'::jsonb)) loop
    select pg_catalog.to_jsonb(target) into v_remote
    from public.journal_entries as target
    where target.user_id = v_user_id
      and target.installation_id = p_installation_id
      and target.local_id = (v_record ->> 'local_id')::bigint;
    if not found or (v_remote - 'sync_version' - 'updated_at' - 'created_at')
      <> (v_record - 'sync_version' - 'updated_at' - 'created_at')
      or (v_remote ->> 'created_at')::timestamptz
        is distinct from (v_record ->> 'created_at')::timestamptz then
      return false;
    end if;
  end loop;

  if jsonb_array_length(coalesce(p_records -> 'customers', '[]'::jsonb))
    <> coalesce((p_store_counts ->> 'customers')::bigint, -1) then
    return false;
  end if;
  select count(*) into v_actual_count
  from public.customers
  where user_id = v_user_id and installation_id = p_installation_id;
  if v_actual_count <> jsonb_array_length(coalesce(p_records -> 'customers', '[]'::jsonb)) then
    return false;
  end if;
  for v_record in select value from jsonb_array_elements(coalesce(p_records -> 'customers', '[]'::jsonb)) loop
    select pg_catalog.to_jsonb(target) into v_remote
    from public.customers as target
    where target.user_id = v_user_id
      and target.installation_id = p_installation_id
      and target.local_id = (v_record ->> 'local_id')::bigint;
    if not found or (v_remote - 'sync_version' - 'updated_at' - 'created_at')
      <> (v_record - 'sync_version' - 'updated_at' - 'created_at')
      or (v_remote ->> 'created_at')::timestamptz
        is distinct from (v_record ->> 'created_at')::timestamptz then
      return false;
    end if;
  end loop;

  if jsonb_array_length(coalesce(p_records -> 'expenses', '[]'::jsonb))
    <> coalesce((p_store_counts ->> 'expenses')::bigint, -1) then
    return false;
  end if;
  select count(*) into v_actual_count
  from public.expenses
  where user_id = v_user_id and installation_id = p_installation_id;
  if v_actual_count <> jsonb_array_length(coalesce(p_records -> 'expenses', '[]'::jsonb)) then
    return false;
  end if;
  for v_record in select value from jsonb_array_elements(coalesce(p_records -> 'expenses', '[]'::jsonb)) loop
    select pg_catalog.to_jsonb(target) into v_remote
    from public.expenses as target
    where target.user_id = v_user_id
      and target.installation_id = p_installation_id
      and target.local_id = (v_record ->> 'local_id')::bigint;
    if not found or (v_remote - 'sync_version' - 'updated_at' - 'created_at')
      <> (v_record - 'sync_version' - 'updated_at' - 'created_at')
      or (v_remote ->> 'created_at')::timestamptz
        is distinct from (v_record ->> 'created_at')::timestamptz then
      return false;
    end if;
  end loop;

  if jsonb_array_length(coalesce(p_records -> 'payments', '[]'::jsonb))
    <> coalesce((p_store_counts ->> 'payments')::bigint, -1) then
    return false;
  end if;
  select count(*) into v_actual_count
  from public.payments
  where user_id = v_user_id and installation_id = p_installation_id;
  if v_actual_count <> jsonb_array_length(coalesce(p_records -> 'payments', '[]'::jsonb)) then
    return false;
  end if;
  for v_record in select value from jsonb_array_elements(coalesce(p_records -> 'payments', '[]'::jsonb)) loop
    select pg_catalog.to_jsonb(target) into v_remote
    from public.payments as target
    where target.user_id = v_user_id
      and target.installation_id = p_installation_id
      and target.local_id = (v_record ->> 'local_id')::bigint;
    if not found or (v_remote - 'sync_version' - 'updated_at' - 'created_at')
      <> (v_record - 'sync_version' - 'updated_at' - 'created_at')
      or (v_remote ->> 'created_at')::timestamptz
        is distinct from (v_record ->> 'created_at')::timestamptz then
      return false;
    end if;
  end loop;

  for v_setting in select value from jsonb_array_elements(p_settings) loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || (v_setting ->> 'key'), 0)
    );
    select target.value, target.sync_version
    into v_remote_value, v_remote_version
    from public.user_settings as target
    where target.user_id = v_user_id
      and target.key = v_setting ->> 'key'
      and target.source_installation_id = v_settings_installation_id;
    if not found
      or v_remote_value is distinct from v_setting -> 'value'
      or v_remote_version is distinct from (v_setting ->> 'sync_version')::bigint then
      return false;
    end if;
  end loop;

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
  return true;
end;
$$;

create or replace function public.lock_user_data_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_installation_id uuid;
  v_key text;
begin
  if tg_table_name = 'user_settings' then
    if tg_op = 'DELETE' then
      v_user_id := old.user_id;
      v_key := old.key;
    else
      v_user_id := new.user_id;
      v_key := new.key;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || v_key, 0)
    );
  else
    if tg_op = 'DELETE' then
      v_user_id := old.user_id;
      v_installation_id := old.installation_id;
    else
      v_user_id := new.user_id;
      v_installation_id := new.installation_id;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || v_installation_id::text, 0)
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.lock_user_data_identity() from public, anon, authenticated;

create trigger journal_entries_lock_identity
before insert or update or delete on public.journal_entries
for each row execute function public.lock_user_data_identity();
create trigger customers_lock_identity
before insert or update or delete on public.customers
for each row execute function public.lock_user_data_identity();
create trigger expenses_lock_identity
before insert or update or delete on public.expenses
for each row execute function public.lock_user_data_identity();
create trigger payments_lock_identity
before insert or update or delete on public.payments
for each row execute function public.lock_user_data_identity();
create trigger user_settings_lock_identity
before insert or update or delete on public.user_settings
for each row execute function public.lock_user_data_identity();

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

  select result.applied, result.row_id, result.sync_version
  into v_applied, v_row_id, v_sync_version
  from public.sync_user_record(p_store, p_payload, null) as result;
  if not coalesce(v_applied, false) then
    return query select false, v_row_id, v_sync_version;
    return;
  end if;

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
  elsif p_store = 'payments' then
    select pg_catalog.to_jsonb(target), target.id, target.sync_version
    into v_remote, v_row_id, v_sync_version
    from public.payments as target
    where target.user_id = v_user_id
      and target.installation_id = (p_payload ->> 'installation_id')::uuid
      and target.local_id = (p_payload ->> 'local_id')::bigint
    for update;
  else
    raise exception 'Unsupported local data store';
  end if;

  if v_remote is not null then
    v_same :=
      (v_remote - 'sync_version' - 'updated_at' - 'created_at')
        = (p_payload - 'sync_version' - 'updated_at' - 'created_at')
      and (v_remote ->> 'created_at')::timestamptz
        is not distinct from (p_payload ->> 'created_at')::timestamptz;
  end if;

  return query select coalesce(v_same, false), v_row_id, v_sync_version;
end;
$$;

revoke all on function public.sync_user_setting(text, jsonb, uuid, bigint) from public, anon;
revoke all on function public.migrate_user_setting(text, jsonb, text, bigint, jsonb) from public, anon;
revoke all on function public.migrate_user_record(text, jsonb) from public, anon;
revoke all on function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.sync_user_setting(text, jsonb, uuid, bigint) to authenticated;
grant execute on function public.migrate_user_setting(text, jsonb, text, bigint, jsonb) to authenticated;
grant execute on function public.migrate_user_record(text, jsonb) to authenticated;
grant execute on function public.verify_user_migration(uuid, integer, jsonb, jsonb, jsonb) to authenticated;
