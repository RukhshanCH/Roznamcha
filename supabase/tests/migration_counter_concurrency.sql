-- Run against a disposable, migrated local Supabase database as an administrator:
-- psql -v migration_test_user_id=<dedicated-auth-user-uuid> -f supabase/tests/migration_counter_concurrency.sql
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

select dblink_connect(
  'migration_counter_worker',
  format(
    'host=127.0.0.1 port=%s dbname=%s user=%s',
    current_setting('port'),
    current_database(),
    session_user
  )
);
select dblink_exec('migration_counter_worker', 'set role authenticated');
select dblink_exec(
  'migration_counter_worker',
  'set request.jwt.claim.sub = ' || quote_literal(:'migration_test_user_id')
);
set role authenticated;

do $$
begin
  if exists (
    select 1
    from public.invoice_counters
    where user_id = auth.uid()
      and invoice_date in ('1901-01-01', '1901-01-02')
  ) then
    raise notice 'Dedicated invoice concurrency test counters already exist; they will be overwritten under monotonic RPCs';
  end if;
end
$$;

select dblink_send_query(
  'migration_counter_worker',
  $query$
    with allocation as materialized (
      select public.next_invoice_sequence('1901-01-01'::date) as sequence
    )
    select allocation.sequence
    from allocation
    cross join lateral (
      select pg_catalog.pg_sleep(1)
      where allocation.sequence is not null
    ) as hold_lock
  $query$
);
do $$
declare
  lock_id bigint := pg_catalog.hashtextextended(
    auth.uid()::text || ':invoice-counter:1901-01-01',
    0
  );
  worker_holds_lock boolean := false;
begin
  for attempt in 1..50 loop
    if pg_catalog.pg_try_advisory_lock(lock_id) then
      perform pg_catalog.pg_advisory_unlock(lock_id);
      perform pg_catalog.pg_sleep(0.1);
    else
      worker_holds_lock := true;
      exit;
    end if;
  end loop;
  if not worker_holds_lock then
    raise exception 'Allocation worker did not acquire the expected advisory lock';
  end if;
end
$$;
select public.migrate_invoice_counter('1901-01-01', 50);
select * from dblink_get_result('migration_counter_worker') as result(sequence bigint);
select * from dblink_get_result('migration_counter_worker') as result(sequence bigint);

do $$
begin
  if coalesce((
    select sequence from public.invoice_counters
    where user_id = auth.uid() and invoice_date = '1901-01-01'
  ), 0) < 50 then
    raise exception 'Migration lowered a counter allocated concurrently';
  end if;
end
$$;

select dblink_send_query(
  'migration_counter_worker',
  $query$
    with migration as materialized (
      select public.migrate_invoice_counter('1901-01-02'::date, 50) as sequence
    )
    select migration.sequence
    from migration
    cross join lateral (
      select pg_catalog.pg_sleep(1)
      where migration.sequence is not null
    ) as hold_lock
  $query$
);
do $$
declare
  lock_id bigint := pg_catalog.hashtextextended(
    auth.uid()::text || ':invoice-counter:1901-01-02',
    0
  );
  worker_holds_lock boolean := false;
begin
  for attempt in 1..50 loop
    if pg_catalog.pg_try_advisory_lock(lock_id) then
      perform pg_catalog.pg_advisory_unlock(lock_id);
      perform pg_catalog.pg_sleep(0.1);
    else
      worker_holds_lock := true;
      exit;
    end if;
  end loop;
  if not worker_holds_lock then
    raise exception 'Migration worker did not acquire the expected advisory lock';
  end if;
end
$$;
select public.next_invoice_sequence('1901-01-02');
select * from dblink_get_result('migration_counter_worker') as result(sequence bigint);
select * from dblink_get_result('migration_counter_worker') as result(sequence bigint);

do $$
begin
  if coalesce((
    select sequence from public.invoice_counters
    where user_id = auth.uid() and invoice_date = '1901-01-02'
  ), 0) < 51 then
    raise exception 'Concurrent invoice allocation was lost after migration';
  end if;
end
$$;

select dblink_disconnect('migration_counter_worker');

set role postgres;
delete from public.invoice_counters
where user_id = :'migration_test_user_id'::uuid
  and invoice_date in ('1901-01-01', '1901-01-02');
