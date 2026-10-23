-- Isolated PostgreSQL regression test for supabase/008_admin_panel.sql.
-- Never connects to the hosted database. Run against a throwaway local Postgres:
--   createdb humor_admin_test
--   psql -v ON_ERROR_STOP=1 -d humor_admin_test -f scripts/admin-db-test.sql
-- (run from the repo root; it \i-includes the main project's migrations from
--  ../the-humor-project/supabase and this repo's 008/009.)
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\o /dev/null

-- ---------- Supabase stand-ins ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email varchar(255), created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.objects (id uuid primary key, bucket_id text, name text);
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
grant usage on schema storage to anon, authenticated;
create table public.jokes (id uuid primary key);
grant usage on schema public to anon, authenticated;

\i ../the-humor-project/supabase/001_profiles.sql
\i ../the-humor-project/supabase/002_caption_rating.sql
\i ../the-humor-project/supabase/004_week4_schema_and_rls.sql
\i ../the-humor-project/supabase/005_publish_generation.sql
\i ../the-humor-project/supabase/006_caption_previews.sql
\i ../the-humor-project/supabase/007_my_humor.sql
\i supabase/008_admin_panel.sql
\i supabase/008_admin_panel.sql
\i supabase/010_trash_and_restore.sql
\i supabase/011_admin_soft_remove.sql

-- users: admin-to-be, author, fan (profile rows come from the 001 trigger)
insert into auth.users (id, email, last_sign_in_at) values
  ('10000000-0000-4000-8000-00000000000a', 'Boss@Example.com', now()),
  ('10000000-0000-4000-8000-000000000001', 'author@example.com', now()),
  ('10000000-0000-4000-8000-000000000002', 'fan@example.com', null);
update public.profiles set first_name = 'F', last_name = 'L';
insert into public.images (id, url, alt_text) values
  ('20000000-0000-4000-8000-000000000001', 'https://example.com/a.jpg', 'Sample A'),
  ('20000000-0000-4000-8000-000000000002', 'https://example.com/b.jpg', 'Sample B');

create schema t;
create table t.results (n serial, name text, ok boolean);
create function t.check(name text, ok boolean) returns void language plpgsql as $$
begin insert into t.results (name, ok) values (name, coalesce(ok, false)); end $$;
create function t.denied(name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; perform t.check(name, false);
  exception when others then perform t.check(name, true);
  end;
end $$;
grant usage on schema t to public;
grant all on t.results to public;
grant all on sequence t.results_n_seq to public;
grant execute on all functions in schema t to public;

-- ---------- author publishes, fan votes (main-app flow still works) ----------
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
insert into public.generations (id, user_id, image_id, user_input, prompt, model, generated_content) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Finals scene', 'p', 'gemini', 'Live caption'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Other scene', 'p', 'gemini', 'Withdrawn caption');
select public.humor_publish_preview('30000000-0000-4000-8000-000000000001') as live_id \gset
select public.humor_publish_preview('30000000-0000-4000-8000-000000000002') as gone_id \gset
select t.check('author: own delete still works after 008', public.humor_delete_caption(:'gone_id'));

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
insert into public.caption_votes (user_id, caption_id, value) values ('10000000-0000-4000-8000-000000000002', :'live_id', 1);
select t.check('fan: voting still works', (select count(*) = 1 from public.caption_votes));

-- ---------- non-admin is locked out ----------
select t.check('fan: is_superadmin() is false', not public.is_superadmin());
select t.check('fan: sees only own profile', (select count(*) = 1 from public.profiles));
select t.check('fan: sees no other generations', (select count(*) = 0 from public.generations));
select t.denied('fan: cannot self-promote', $$update public.profiles set is_superadmin = true where id = auth.uid()$$);
select t.denied('fan: cannot insert admin profile', $$insert into public.profiles (id, is_superadmin) values (gen_random_uuid(), true)$$);
select t.denied('fan: admin_list_users denied', $$select * from public.admin_list_users()$$);
select t.denied('fan: admin_create_caption denied', $$select public.admin_create_caption('20000000-0000-4000-8000-000000000001', 'x', 'x', 'x', 'x')$$);
select t.denied('fan: admin_update_caption denied', format($$select public.admin_update_caption(%L, 'hacked', '20000000-0000-4000-8000-000000000001')$$, :'live_id'));
select t.denied('fan: admin_delete_caption denied', format($$select public.admin_delete_caption(%L)$$, :'live_id'));
select t.denied('fan: withdrawn list denied', $$select * from public.admin_list_withdrawn_captions()$$);
select t.denied('fan: direct caption update denied', format($$update public.captions set content = 'x' where id = %L$$, :'live_id'));
update public.profiles set first_name = 'Fan' where id = auth.uid();
select t.check('fan: own profile update (name) still works', (select first_name = 'Fan' from public.profiles where id = auth.uid()));

reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select t.denied('anon: is_superadmin() not executable', $$select public.is_superadmin()$$);
select t.denied('anon: admin_list_users denied', $$select * from public.admin_list_users()$$);
select t.denied('anon: admin_delete_caption denied', format($$select public.admin_delete_caption(%L)$$, :'live_id'));

-- ---------- bootstrap first superadmin out-of-band (SQL Editor = postgres role) ----------
reset role;
update public.profiles p set is_superadmin = true from auth.users u
  where u.id = p.id and lower(u.email) = lower('boss@example.com');

-- ---------- superadmin ----------
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000a', false);
select t.check('admin: is_superadmin() is true', public.is_superadmin());
select t.check('admin: lists all 3 users with emails',
  (select count(*) = 3 and bool_and(email is not null) from public.admin_list_users()));
select t.check('admin: reads all profiles', (select count(*) = 3 from public.profiles));
select t.check('admin: reads all votes', (select count(*) = 1 from public.caption_votes));
select t.check('admin: reads all generations', (select count(*) = 2 from public.generations));
select t.check('admin: Explore still hides withdrawn captions', (select count(*) = 1 from public.captions));
select t.check('admin: withdrawn list shows author-withdrawn caption',
  (select count(*) = 1 from public.admin_list_withdrawn_captions() where id = :'gone_id'));

select public.admin_create_caption('20000000-0000-4000-8000-000000000002', '  Admin caption  ', 'Scene', 'Full prompt', 'gemini-test') as new_id \gset
select t.check('admin: create publishes trimmed caption', (select content = 'Admin caption' from public.captions where id = :'new_id'));
select t.check('admin: create records provenance', (select g.user_id = auth.uid() and g.model = 'gemini-test' and g.image_id = '20000000-0000-4000-8000-000000000002'
  from public.captions c join public.generations g on g.id = c.generation_id where c.id = :'new_id'));
select t.denied('admin: create rejects empty content', $$select public.admin_create_caption('20000000-0000-4000-8000-000000000001', '   ', 'x', 'x', 'x')$$);
select t.denied('admin: create rejects unknown image', $$select public.admin_create_caption(gen_random_uuid(), 'x', 'x', 'x', 'x')$$);

select t.check('admin: update content + image', public.admin_update_caption(:'live_id', 'Edited', '20000000-0000-4000-8000-000000000002'));
select t.check('admin: update persisted with edit stamp', (select content = 'Edited' and image_id = '20000000-0000-4000-8000-000000000002' and admin_edited_at is not null from public.captions where id = :'live_id'));
select t.check('admin: update of missing caption returns false', not public.admin_update_caption(gen_random_uuid(), 'x', '20000000-0000-4000-8000-000000000001'));
select t.denied('admin: update rejects 501 chars', format($$select public.admin_update_caption(%L, repeat('x', 501), '20000000-0000-4000-8000-000000000001')$$, :'live_id'));
select t.denied('admin: still cannot UPDATE captions directly', format($$update public.captions set content = 'x' where id = %L$$, :'live_id'));

select t.check('admin: delete returns true', public.admin_delete_caption(:'live_id'));
select t.check('admin: delete is idempotent (false on retry)', not public.admin_delete_caption(:'live_id'));
select t.check('admin: caption and its votes removed', (select count(*) = 0 from public.caption_votes) and (select count(*) = 0 from public.captions where id = :'live_id'));
select t.check('admin: source generation marked withdrawn', (select withdrawn_at is not null from public.generations where id = '30000000-0000-4000-8000-000000000001'));
select t.check('admin: can permanently delete author-withdrawn caption', public.admin_delete_caption(:'gone_id'));
select t.check('admin: images untouched', (select count(*) = 2 from public.images));

-- author cannot resurrect an admin-deleted caption with a stale Publish retry
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.denied('author: stale publish of admin-deleted caption denied', $$select public.humor_publish_preview('30000000-0000-4000-8000-000000000001')$$);

reset role;
select t.check('vote-owner trigger is re-enabled after admin delete',
  (select tgenabled = 'O' from pg_trigger where tgname = 'humor_vote_owner'));
\o
\pset tuples_only off
\set QUIET 0
select n, case when ok then 'PASS' else 'FAIL' end as result, name from t.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
do $$ begin if exists (select 1 from t.results where not ok) then raise exception 'admin DB checks failed'; end if; end $$;
