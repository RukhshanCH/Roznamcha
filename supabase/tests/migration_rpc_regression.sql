-- Run against an isolated, fully migrated PostgreSQL/Supabase-compatible database:
-- psql -v migration_test_user_id=<dedicated-auth-user-uuid> \
--   -f supabase/tests/migration_rpc_regression.sql
\set ON_ERROR_STOP on
\if :{?migration_test_user_id}
\else
\echo 'Set migration_test_user_id to a dedicated local auth.users UUID.'
\quit
\endif

create extension if not exists dblink;

select 1 / (
  select count(*)::integer
  from auth.users
  where id = :'migration_test_user_id'::uuid
);

set request.jwt.claim.sub = :'migration_test_user_id';

set role postgres;
delete from public.invoice_counters
where user_id = :'migration_test_user_id'::uuid
  and invoice_date in ('1902-02-02');
delete from public.journal_entries
where user_id = :'migration_test_user_id'::uuid
  and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
delete from public.user_settings
where user_id = :'migration_test_user_id'::uuid;
delete from public.migration_runs
where user_id = :'migration_test_user_id'::uuid
  and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
set role authenticated;

do $$
declare
  v_payload jsonb;
  v_different_uuid jsonb;
  v_conflict jsonb;
  v_applied boolean;
  v_existing_id uuid;
  v_existing_version bigint;
  v_remote jsonb;
  v_records jsonb;
  v_verified boolean;
  v_versions jsonb;
begin
  delete from public.journal_entries
  where user_id = auth.uid()
    and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  delete from public.user_settings
  where user_id = auth.uid();
  delete from public.migration_runs
  where user_id = auth.uid()
    and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  insert into public.migration_runs (
    user_id, installation_id, source_db_version, status, store_counts
  ) values (
    auth.uid(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    6, 'running', '{}'::jsonb
  );

  v_payload := jsonb_build_object(
    'id', '11111111-1111-4111-8111-111111111111',
    'user_id', auth.uid(),
    'installation_id', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'local_id', 101,
    'serial_no', 1,
    'name', 'Natural key record',
    'mobile_number', '',
    'total', 25,
    'advance', 5,
    'remaining', 20,
    'remaining_plus', 0,
    'note', 'preserve exactly',
    'payment_method', 'cash',
    'date', '1902-02-02',
    'created_at', '1902-02-02T00:00:00Z',
    'debt_id', null,
    'is_backup', false,
    'backup_id', null,
    'is_deleted', false,
    'deleted_at', null
  );

  select result.applied, result.row_id, result.sync_version
  into v_applied, v_existing_id, v_existing_version
  from public.migrate_user_record('entries', v_payload) as result;
  if not v_applied or v_existing_id <> '11111111-1111-4111-8111-111111111111'
    or v_existing_version <> 1 then
    raise exception 'Initial natural-key migration upload failed';
  end if;

  v_different_uuid := jsonb_set(
    v_payload,
    '{id}',
    to_jsonb('22222222-2222-4222-8222-222222222222'::text)
  );
  select result.applied, result.row_id, result.sync_version
  into v_applied, v_existing_id, v_existing_version
  from public.migrate_user_record('entries', v_different_uuid) as result;
  if not v_applied
    or v_existing_id <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'Identical natural-key content did not return the existing UUID';
  end if;

  v_conflict := jsonb_set(v_different_uuid, '{name}', to_jsonb('Changed content'::text));
  select result.applied, result.row_id, result.sync_version
  into v_applied, v_existing_id, v_existing_version
  from public.migrate_user_record('entries', v_conflict) as result;
  if v_applied then
    raise exception 'Conflicting natural-key content was incorrectly overwritten';
  end if;

  select pg_catalog.to_jsonb(target)
  into v_remote
  from public.journal_entries as target
  where target.user_id = auth.uid()
    and target.installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    and target.local_id = 101;
  if v_remote ->> 'id' <> '11111111-1111-4111-8111-111111111111'
    or v_remote ->> 'name' <> 'Natural key record' then
    raise exception 'Natural-key conflict overwrote the existing cloud record';
  end if;

  insert into public.user_settings (
    user_id, key, value, source_installation_id, sync_version
  ) values (
    auth.uid(),
    'migrationTheme',
    '"dark"'::jsonb,
    '00000000-0000-0000-0000-000000000000',
    1
  )
  on conflict (user_id, key, source_installation_id)
  do update set value = excluded.value;

  if public.migrate_invoice_counter('1902-02-02', 8) <> 8 then
    raise exception 'Invoice counter migration did not establish the legacy sequence';
  end if;
  if public.next_invoice_sequence('1902-02-02') <> 9 then
    raise exception 'Invoice counter allocation did not advance monotonically';
  end if;

  v_records := jsonb_build_object(
    'entries', jsonb_build_array(v_remote),
    'customers', '[]'::jsonb,
    'expenses', '[]'::jsonb,
    'payments', '[]'::jsonb
  );

  select result.verified, result.record_versions
  into v_verified, v_versions
  from public.verify_user_migration(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    6,
    jsonb_build_object(
      'entries', 1,
      'customers', 0,
      'expenses', 0,
      'payments', 0,
      'settings', 1
    ),
    v_records,
    jsonb_build_array(jsonb_build_object(
      'key', 'migrationTheme',
      'value', '"dark"'::jsonb,
      'sync_version', 1
    )),
    jsonb_build_object(
      'invoice_date', '1902-02-02',
      'sequence', 9
    )
  ) as result;

  if not v_verified or jsonb_array_length(v_versions) <> 1 then
    raise exception 'Complete migration verification rejected valid records';
  end if;
end;
$$;

set role postgres;

select pg_catalog.set_config(
  'roznamcha.migration_rpc_regression_error',
  '',
  false
);

do $$
declare
  v_user_id uuid := auth.uid();
  v_installation_id constant uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_lock_id bigint;
  v_updater_pid integer;
  v_verifier_pid integer;
  v_verifier_sql text;
  v_waiting boolean := false;
  v_deadline timestamptz;
  v_verified boolean;
  v_versions jsonb;
  v_setting_value jsonb;
  v_setting_version bigint;
  v_migration_status text;
  v_cleanup_deadline timestamptz;
  v_failure text;
  v_cleanup_error text;
  v_connections text[];
  v_worker_pid integer;
begin
  if v_user_id is null then
    raise exception 'The regression test requires migration_test_user_id in the JWT claim';
  end if;

  v_lock_id := pg_catalog.hashtextextended(v_user_id::text || ':migrationTheme', 0);

  update public.migration_runs
  set status = 'running', completed_at = null
  where user_id = v_user_id and installation_id = v_installation_id;

  perform dblink_connect(
    'migration_settings_updater',
    pg_catalog.format(
      'host=127.0.0.1 port=%s dbname=%s user=%s',
      current_setting('port'),
      current_database(),
      session_user
    )
  );
  perform dblink_connect(
    'migration_settings_verifier',
    pg_catalog.format(
      'host=127.0.0.1 port=%s dbname=%s user=%s',
      current_setting('port'),
      current_database(),
      session_user
    )
  );

  perform dblink_exec('migration_settings_updater', 'begin');
  perform dblink_exec('migration_settings_updater', 'set role authenticated');
  perform dblink_exec(
    'migration_settings_updater',
    pg_catalog.format('set request.jwt.claim.sub = %L', v_user_id::text)
  );
  select worker.pid into v_updater_pid
  from dblink('migration_settings_updater', 'select pg_backend_pid()') as worker(pid integer);

  perform dblink_exec(
    'migration_settings_updater',
    pg_catalog.format(
      $command$
        do $block$
        begin
          perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(%L, 0)
          );
          update public.user_settings
          set value = '"light"'::jsonb
          where user_id = auth.uid()
            and key = 'migrationTheme'
            and source_installation_id = '00000000-0000-0000-0000-000000000000';
          if not found then
            raise exception 'Concurrent settings update did not find its fixture row';
          end if;
        end
        $block$;
      $command$,
      v_user_id::text || ':migrationTheme'
    )
  );

  if not exists (
    select 1
    from pg_catalog.pg_stat_activity
    where pid = v_updater_pid
      and state = 'idle in transaction'
      and xact_start is not null
  ) then
    raise exception 'Settings updater is not holding an open, uncommitted transaction';
  end if;
  select value, sync_version into v_setting_value, v_setting_version
  from public.user_settings
  where user_id = v_user_id
    and key = 'migrationTheme'
    and source_installation_id = '00000000-0000-0000-0000-000000000000';
  if v_setting_value is distinct from '"dark"'::jsonb or v_setting_version <> 1 then
    raise exception 'Coordinator observed the update before its transaction committed';
  end if;

  perform dblink_exec('migration_settings_verifier', 'set role authenticated');
  perform dblink_exec(
    'migration_settings_verifier',
    pg_catalog.format('set request.jwt.claim.sub = %L', v_user_id::text)
  );
  perform dblink_exec(
    'migration_settings_verifier',
    'set session characteristics as transaction isolation level read committed'
  );
  select worker.pid into v_verifier_pid
  from dblink('migration_settings_verifier', 'select pg_backend_pid()') as worker(pid integer);

  v_verifier_sql := pg_catalog.format(
    $query$
      select result.verified, result.record_versions
      from public.verify_user_migration(
        %L::uuid,
        6,
        '{"entries":1,"customers":0,"expenses":0,"payments":0,"settings":1}'::jsonb,
        jsonb_build_object(
          'entries', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(target))
            from public.journal_entries as target
            where target.user_id = auth.uid() and target.installation_id = %L::uuid
          ), '[]'::jsonb),
          'customers', '[]'::jsonb,
          'expenses', '[]'::jsonb,
          'payments', '[]'::jsonb
        ),
        jsonb_build_array(jsonb_build_object(
          'key', 'migrationTheme',
          'value', '"dark"'::jsonb,
          'sync_version', 1
        )),
        '{"invoice_date":"1902-02-02","sequence":9}'::jsonb
      ) as result
    $query$,
    v_installation_id::text,
    v_installation_id::text
  );
  if dblink_send_query('migration_settings_verifier', v_verifier_sql) <> 1 then
    raise exception 'Could not start the migration verification worker';
  end if;

  v_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    select exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      join pg_catalog.pg_locks as pending
        on pending.pid = activity.pid
      where activity.pid = v_verifier_pid
        and activity.state = 'active'
        and activity.wait_event_type = 'Lock'
        and activity.wait_event = 'advisory'
        and activity.query ilike '%verify_user_migration%'
        and pending.locktype = 'advisory'
        and not pending.granted
        and pending.classid = ((v_lock_id >> 32) & 4294967295)::oid
        and pending.objid = (v_lock_id & 4294967295)::oid
        and pending.objsubid = 1
    ) into v_waiting;
    exit when v_waiting;
    if pg_catalog.clock_timestamp() >= v_deadline then
      raise exception 'Verifier did not wait on the updater-held production settings lock';
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_stat_activity
    where pid = v_updater_pid
      and state = 'idle in transaction'
      and xact_start is not null
  ) then
    raise exception 'Updater transaction ended before the verifier was observed waiting';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_locks as granted
    where granted.pid = v_updater_pid
      and granted.locktype = 'advisory'
      and granted.granted
      and granted.classid = ((v_lock_id >> 32) & 4294967295)::oid
      and granted.objid = (v_lock_id & 4294967295)::oid
      and granted.objsubid = 1
  ) then
    raise exception 'Updater does not hold the production settings advisory lock';
  end if;

  raise notice
    'Observed overlap: verifier pid % waits on settings lock % while updater pid % remains uncommitted',
    v_verifier_pid, v_lock_id, v_updater_pid;

  perform dblink_exec('migration_settings_updater', 'commit');
  select result.verified, result.record_versions
  into v_verified, v_versions
  from dblink_get_result('migration_settings_verifier')
    as result(verified boolean, record_versions jsonb);

  if v_verified then
    raise exception 'Migration verification accepted stale settings after the competing commit';
  end if;
  select value, sync_version into v_setting_value, v_setting_version
  from public.user_settings
  where user_id = v_user_id
    and key = 'migrationTheme'
    and source_installation_id = '00000000-0000-0000-0000-000000000000';
  if v_setting_value is distinct from '"light"'::jsonb or v_setting_version <> 2 then
    raise exception 'Committed concurrent settings value/version is incorrect';
  end if;
  select status into v_migration_status
  from public.migration_runs
  where user_id = v_user_id and installation_id = v_installation_id;
  if v_migration_status is distinct from 'running' then
    raise exception 'Failed verification changed migration status to %', v_migration_status;
  end if;

  raise notice 'Actual verify_user_migration result: verified=%, versions=%',
    v_verified, v_versions;

  perform dblink_disconnect('migration_settings_verifier');
  perform dblink_disconnect('migration_settings_updater');
  if coalesce(dblink_get_connections(), array[]::text[])
    && array['migration_settings_updater', 'migration_settings_verifier']::text[] then
    raise exception 'A migration settings worker connection was not closed';
  end if;

  v_cleanup_deadline := pg_catalog.clock_timestamp() + interval '5 seconds';
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when not exists (
      select 1
      from pg_catalog.pg_stat_activity
      where pid in (v_updater_pid, v_verifier_pid)
    );
    if pg_catalog.clock_timestamp() >= v_cleanup_deadline then
      raise exception 'A migration settings worker backend remained after disconnect';
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
exception
  when others then
    get stacked diagnostics v_failure = message_text;
    v_connections := coalesce(dblink_get_connections(), array[]::text[]);

    if 'migration_settings_updater' = any(v_connections) then
      begin
        perform dblink_exec('migration_settings_updater', 'rollback');
      exception when others then
        get stacked diagnostics v_cleanup_error = message_text;
        v_failure := v_failure || '; updater rollback cleanup: ' || v_cleanup_error;
      end;
      begin
        perform dblink_disconnect('migration_settings_updater');
      exception when others then
        get stacked diagnostics v_cleanup_error = message_text;
        v_failure := v_failure || '; updater disconnect cleanup: ' || v_cleanup_error;
      end;
    end if;
    if 'migration_settings_verifier' = any(v_connections) then
      begin
        perform dblink_disconnect('migration_settings_verifier');
      exception when others then
        get stacked diagnostics v_cleanup_error = message_text;
        v_failure := v_failure || '; verifier disconnect cleanup: ' || v_cleanup_error;
      end;
    end if;

    for v_worker_pid in
      select activity.pid
      from pg_catalog.pg_stat_activity as activity
      where activity.pid in (v_updater_pid, v_verifier_pid)
    loop
      perform pg_catalog.pg_terminate_backend(v_worker_pid);
    end loop;
    v_cleanup_deadline := pg_catalog.clock_timestamp() + interval '5 seconds';
    loop
      perform pg_catalog.pg_stat_clear_snapshot();
      exit when not exists (
        select 1
        from pg_catalog.pg_stat_activity
        where pid in (v_updater_pid, v_verifier_pid)
      );
      if pg_catalog.clock_timestamp() >= v_cleanup_deadline then
        v_failure := v_failure || '; worker backend cleanup timed out';
        exit;
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;

    delete from public.invoice_counters
    where user_id = v_user_id and invoice_date = '1902-02-02';
    delete from public.journal_entries
    where user_id = v_user_id and installation_id = v_installation_id;
    delete from public.user_settings
    where user_id = v_user_id and key = 'migrationTheme';
    delete from public.migration_runs
    where user_id = v_user_id and installation_id = v_installation_id;
    perform pg_catalog.set_config(
      'roznamcha.migration_rpc_regression_error',
      v_failure,
      false
    );
    raise notice 'Concurrency regression failed after cleanup: %', v_failure;
end;
$$;

do $$
declare
  v_failure text := nullif(
    pg_catalog.current_setting('roznamcha.migration_rpc_regression_error', true),
    ''
  );
begin
  if v_failure is not null then
    raise exception 'Settings concurrency regression failed (workers and fixtures cleaned): %',
      v_failure;
  end if;
end;
$$;

set role postgres;
delete from public.invoice_counters
where user_id = :'migration_test_user_id'::uuid
  and invoice_date = '1902-02-02';
delete from public.journal_entries
where user_id = :'migration_test_user_id'::uuid
  and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
delete from public.user_settings
where user_id = :'migration_test_user_id'::uuid
  and key = 'migrationTheme';
delete from public.migration_runs
where user_id = :'migration_test_user_id'::uuid
  and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

do $$
begin
  if exists (
    select 1 from public.invoice_counters
    where user_id = auth.uid() and invoice_date = '1902-02-02'
  ) or exists (
    select 1 from public.journal_entries
    where user_id = auth.uid()
      and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ) or exists (
    select 1 from public.user_settings
    where user_id = auth.uid() and key = 'migrationTheme'
  ) or exists (
    select 1 from public.migration_runs
    where user_id = auth.uid()
      and installation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ) then
    raise exception 'Migration RPC regression test fixture cleanup failed';
  end if;
end;
$$;
