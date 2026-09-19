alter table "users" enable row level security;
alter table "sessions" enable row level security;
alter table "upload_batches" enable row level security;
alter table "upload_files" enable row level security;
alter table "notification_events" enable row level security;
alter table "audit_events" enable row level security;

do $$
begin
  execute 'revoke all on table public.users, public.sessions, public.upload_batches, public.upload_files, public.notification_events, public.audit_events from public';
  execute 'alter default privileges in schema public revoke all on tables from public';
  execute 'alter default privileges in schema public revoke execute on functions from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on table public.users, public.sessions, public.upload_batches, public.upload_files, public.notification_events, public.audit_events from service_role';
    execute 'alter default privileges in schema public revoke all on tables from service_role';
    execute 'alter default privileges in schema public revoke execute on functions from service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.users, public.sessions, public.upload_batches, public.upload_files, public.notification_events, public.audit_events from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
    execute 'alter default privileges in schema public revoke execute on functions from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.users, public.sessions, public.upload_batches, public.upload_files, public.notification_events, public.audit_events from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
    execute 'alter default privileges in schema public revoke execute on functions from authenticated';
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'revoke execute on function public.rls_auto_enable() from service_role';
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'revoke execute on function public.rls_auto_enable() from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'revoke execute on function public.rls_auto_enable() from authenticated';
    end if;
  end if;
end $$;
