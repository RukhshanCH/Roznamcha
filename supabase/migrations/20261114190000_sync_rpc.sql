create or replace function public.sync_user_record(
  p_store text,
  p_payload jsonb,
  p_expected_version bigint default null
)
returns table (applied boolean, row_id uuid, sync_version bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload_user_id uuid := (p_payload ->> 'user_id')::uuid;
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_installation_id uuid := (p_payload ->> 'installation_id')::uuid;
  v_local_id bigint := (p_payload ->> 'local_id')::bigint;
  v_applied boolean := false;
  v_same boolean := false;
begin
  if v_user_id is null or v_payload_user_id is distinct from v_user_id then
    raise exception 'Authenticated user does not own this record';
  end if;
  if v_id is null or v_installation_id is null or v_local_id is null then
    raise exception 'Record identity is incomplete';
  end if;

  if p_store = 'entries' then
    if p_expected_version is null then
      insert into public.journal_entries (
        id, user_id, installation_id, local_id, serial_no, name, mobile_number,
        total, advance, remaining, remaining_plus, note, payment_method, date,
        created_at, debt_id, is_backup, backup_id, is_deleted, deleted_at
      ) values (
        v_id, v_user_id, v_installation_id, v_local_id,
        (p_payload ->> 'serial_no')::integer, p_payload ->> 'name',
        p_payload ->> 'mobile_number', (p_payload ->> 'total')::numeric,
        (p_payload ->> 'advance')::numeric, (p_payload ->> 'remaining')::numeric,
        (p_payload ->> 'remaining_plus')::numeric, p_payload ->> 'note',
        p_payload ->> 'payment_method', (p_payload ->> 'date')::date,
        (p_payload ->> 'created_at')::timestamptz, p_payload ->> 'debt_id',
        coalesce((p_payload ->> 'is_backup')::boolean, false),
        p_payload ->> 'backup_id', coalesce((p_payload ->> 'is_deleted')::boolean, false),
        nullif(p_payload ->> 'deleted_at', '')::timestamptz
      )
      on conflict (user_id, installation_id, local_id) do nothing
      returning id, journal_entries.sync_version into row_id, sync_version;
      v_applied := found;
    else
      update public.journal_entries as target set
        serial_no = (p_payload ->> 'serial_no')::integer,
        name = p_payload ->> 'name',
        mobile_number = p_payload ->> 'mobile_number',
        total = (p_payload ->> 'total')::numeric,
        advance = (p_payload ->> 'advance')::numeric,
        remaining = (p_payload ->> 'remaining')::numeric,
        remaining_plus = (p_payload ->> 'remaining_plus')::numeric,
        note = p_payload ->> 'note',
        payment_method = p_payload ->> 'payment_method',
        date = (p_payload ->> 'date')::date,
        created_at = (p_payload ->> 'created_at')::timestamptz,
        debt_id = p_payload ->> 'debt_id',
        is_backup = coalesce((p_payload ->> 'is_backup')::boolean, false),
        backup_id = p_payload ->> 'backup_id',
        is_deleted = coalesce((p_payload ->> 'is_deleted')::boolean, false),
        deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz
      where target.user_id = v_user_id and target.id = v_id
        and target.sync_version = p_expected_version
      returning target.id, target.sync_version into row_id, sync_version;
      v_applied := found;
    end if;
    if row_id is null then
      select target.id, target.sync_version,
        (pg_catalog.to_jsonb(target) - 'sync_version' - 'updated_at' - 'created_at')
          = (p_payload - 'created_at')
        into row_id, sync_version, v_same
      from public.journal_entries as target
      where target.user_id = v_user_id and target.id = v_id;
      v_applied := found and v_same;
    end if;
  elsif p_store = 'customers' then
    if p_expected_version is null then
      insert into public.customers (
        id, user_id, installation_id, local_id, serial_no, name, mobile_number,
        date, created_at, is_deleted, deleted_at
      ) values (
        v_id, v_user_id, v_installation_id, v_local_id,
        (p_payload ->> 'serial_no')::integer, p_payload ->> 'name',
        p_payload ->> 'mobile_number', (p_payload ->> 'date')::date,
        (p_payload ->> 'created_at')::timestamptz,
        coalesce((p_payload ->> 'is_deleted')::boolean, false),
        nullif(p_payload ->> 'deleted_at', '')::timestamptz
      )
      on conflict (user_id, installation_id, local_id) do nothing
      returning id, customers.sync_version into row_id, sync_version;
      v_applied := found;
    else
      update public.customers as target set
        serial_no = (p_payload ->> 'serial_no')::integer,
        name = p_payload ->> 'name',
        mobile_number = p_payload ->> 'mobile_number',
        date = (p_payload ->> 'date')::date,
        created_at = (p_payload ->> 'created_at')::timestamptz,
        is_deleted = coalesce((p_payload ->> 'is_deleted')::boolean, false),
        deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz
      where target.user_id = v_user_id and target.id = v_id
        and target.sync_version = p_expected_version
      returning target.id, target.sync_version into row_id, sync_version;
      v_applied := found;
    end if;
    if row_id is null then
      select target.id, target.sync_version,
        (pg_catalog.to_jsonb(target) - 'sync_version' - 'updated_at' - 'created_at')
          = (p_payload - 'created_at')
        into row_id, sync_version, v_same
      from public.customers as target
      where target.user_id = v_user_id and target.id = v_id;
      v_applied := found and v_same;
    end if;
  elsif p_store = 'expenses' or p_store = 'payments' then
    if p_store = 'expenses' then
      if p_expected_version is null then
        insert into public.expenses (
          id, user_id, installation_id, local_id, serial_no, name, description,
          amount, date, created_at, is_deleted, deleted_at
        ) values (
          v_id, v_user_id, v_installation_id, v_local_id,
          (p_payload ->> 'serial_no')::integer, p_payload ->> 'name',
          p_payload ->> 'description', (p_payload ->> 'amount')::numeric,
          (p_payload ->> 'date')::date, (p_payload ->> 'created_at')::timestamptz,
          coalesce((p_payload ->> 'is_deleted')::boolean, false),
          nullif(p_payload ->> 'deleted_at', '')::timestamptz
        )
        on conflict (user_id, installation_id, local_id) do nothing
        returning id, expenses.sync_version into row_id, sync_version;
        v_applied := found;
      else
        update public.expenses as target set
          serial_no = (p_payload ->> 'serial_no')::integer,
          name = p_payload ->> 'name',
          description = p_payload ->> 'description',
          amount = (p_payload ->> 'amount')::numeric,
          date = (p_payload ->> 'date')::date,
          created_at = (p_payload ->> 'created_at')::timestamptz,
          is_deleted = coalesce((p_payload ->> 'is_deleted')::boolean, false),
          deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz
        where target.user_id = v_user_id and target.id = v_id
          and target.sync_version = p_expected_version
        returning target.id, target.sync_version into row_id, sync_version;
        v_applied := found;
      end if;
      if row_id is null then
        select target.id, target.sync_version,
          (pg_catalog.to_jsonb(target) - 'sync_version' - 'updated_at' - 'created_at')
            = (p_payload - 'created_at')
          into row_id, sync_version, v_same
        from public.expenses as target
        where target.user_id = v_user_id and target.id = v_id;
        v_applied := found and v_same;
      end if;
    else
      if p_expected_version is null then
        insert into public.payments (
          id, user_id, installation_id, local_id, serial_no, name, description,
          amount, date, created_at, is_deleted, deleted_at
        ) values (
          v_id, v_user_id, v_installation_id, v_local_id,
          (p_payload ->> 'serial_no')::integer, p_payload ->> 'name',
          p_payload ->> 'description', (p_payload ->> 'amount')::numeric,
          (p_payload ->> 'date')::date, (p_payload ->> 'created_at')::timestamptz,
          coalesce((p_payload ->> 'is_deleted')::boolean, false),
          nullif(p_payload ->> 'deleted_at', '')::timestamptz
        )
        on conflict (user_id, installation_id, local_id) do nothing
        returning id, payments.sync_version into row_id, sync_version;
        v_applied := found;
      else
        update public.payments as target set
          serial_no = (p_payload ->> 'serial_no')::integer,
          name = p_payload ->> 'name',
          description = p_payload ->> 'description',
          amount = (p_payload ->> 'amount')::numeric,
          date = (p_payload ->> 'date')::date,
          created_at = (p_payload ->> 'created_at')::timestamptz,
          is_deleted = coalesce((p_payload ->> 'is_deleted')::boolean, false),
          deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz
        where target.user_id = v_user_id and target.id = v_id
          and target.sync_version = p_expected_version
        returning target.id, target.sync_version into row_id, sync_version;
        v_applied := found;
      end if;
      if row_id is null then
        select target.id, target.sync_version,
          (pg_catalog.to_jsonb(target) - 'sync_version' - 'updated_at' - 'created_at')
            = (p_payload - 'created_at')
          into row_id, sync_version, v_same
        from public.payments as target
        where target.user_id = v_user_id and target.id = v_id;
        v_applied := found and v_same;
      end if;
    end if;
  else
    raise exception 'Unsupported local data store';
  end if;

  return query select v_applied, row_id, sync_version;
end;
$$;

create or replace function public.delete_user_record(
  p_store text,
  p_id uuid,
  p_expected_version bigint
)
returns table (applied boolean, sync_version bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_version bigint;
  v_deleted boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_store = 'entries' then
    update public.journal_entries set is_deleted = true, deleted_at = pg_catalog.now()
    where user_id = v_user_id and id = p_id and sync_version = p_expected_version
    returning journal_entries.sync_version into v_version;
    if found then
      v_deleted := true;
    else
      select sync_version, is_deleted into v_version, v_deleted from public.journal_entries
      where user_id = v_user_id and id = p_id;
    end if;
  elsif p_store = 'customers' then
    update public.customers set is_deleted = true, deleted_at = pg_catalog.now()
    where user_id = v_user_id and id = p_id and sync_version = p_expected_version
    returning customers.sync_version into v_version;
    if found then
      v_deleted := true;
    else
      select sync_version, is_deleted into v_version, v_deleted from public.customers
      where user_id = v_user_id and id = p_id;
    end if;
  elsif p_store = 'expenses' then
    update public.expenses set is_deleted = true, deleted_at = pg_catalog.now()
    where user_id = v_user_id and id = p_id and sync_version = p_expected_version
    returning expenses.sync_version into v_version;
    if found then
      v_deleted := true;
    else
      select sync_version, is_deleted into v_version, v_deleted from public.expenses
      where user_id = v_user_id and id = p_id;
    end if;
  elsif p_store = 'payments' then
    update public.payments set is_deleted = true, deleted_at = pg_catalog.now()
    where user_id = v_user_id and id = p_id and sync_version = p_expected_version
    returning payments.sync_version into v_version;
    if found then
      v_deleted := true;
    else
      select sync_version, is_deleted into v_version, v_deleted from public.payments
      where user_id = v_user_id and id = p_id;
    end if;
  else
    raise exception 'Unsupported local data store';
  end if;

  return query select v_version is null or v_deleted, v_version;
end;
$$;

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
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_key is null or p_key = '' or p_installation_id is null then
    raise exception 'Setting identity is incomplete';
  end if;

  if p_expected_version is null then
    insert into public.user_settings (user_id, key, value, source_installation_id)
    values (v_user_id, p_key, p_value, p_installation_id)
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
      and target.source_installation_id = p_installation_id
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
    and target.source_installation_id = p_installation_id;
  return query select coalesce(v_same, false), v_version, v_updated_at;
end;
$$;

revoke all on function public.sync_user_record(text, jsonb, bigint) from public, anon;
revoke all on function public.delete_user_record(text, uuid, bigint) from public, anon;
revoke all on function public.sync_user_setting(text, jsonb, uuid, bigint) from public, anon;
grant execute on function public.sync_user_record(text, jsonb, bigint) to authenticated;
grant execute on function public.delete_user_record(text, uuid, bigint) to authenticated;
grant execute on function public.sync_user_setting(text, jsonb, uuid, bigint) to authenticated;
