-- A setting whose value is JSON/SQL null means "removed" (e.g. the profile
-- picture). user_settings.value is jsonb NOT NULL, so inserting null failed
-- with a 400 and the removal never reached the cloud — on the next refresh
-- the old cloud value won and the removed value came back.
-- Treat p_value IS NULL as a delete of the shared settings row instead.
create or replace function public.sync_user_setting(
  p_key text,
  p_value jsonb,
  p_installation_id uuid,
  p_expected_version bigint default null
)
returns table (applied boolean, sync_version bigint, updated_at timestamptz)
language plpgsql
security definer
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

  if p_value is null then
    delete from public.user_settings as target
    where target.user_id = v_user_id
      and target.key = p_key
      and target.source_installation_id = v_settings_installation_id;
    return query select true, null::bigint, pg_catalog.now();
    return;
  end if;

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

revoke all on function public.sync_user_setting(text, jsonb, uuid, bigint) from public, anon;
grant execute on function public.sync_user_setting(text, jsonb, uuid, bigint) to authenticated;
