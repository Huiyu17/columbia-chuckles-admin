-- Isolated PostgreSQL regression test for supabase/010_trash_and_restore.sql (Trash + Restore).
-- Never connects to the hosted database. Run against a throwaway local Postgres:
--   createdb humor_admin_test
--   psql -v ON_ERROR_STOP=1 -d humor_admin_test -f scripts/trash-db-test.sql
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
\i supabase/010_trash_and_restore.sql
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


-- ---------- setup: author publishes two captions, fan likes one ----------
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
insert into public.generations (id, user_id, image_id, user_input, prompt, model, generated_content) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Scene A', 'p', 'gemini', 'Caption A'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Scene B', 'p', 'gemini', 'Caption B');
select public.humor_publish_preview('30000000-0000-4000-8000-000000000001') as a_id \gset
select public.humor_publish_preview('30000000-0000-4000-8000-000000000002') as b_id \gset
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
insert into public.caption_votes (user_id, caption_id, value) values ('10000000-0000-4000-8000-000000000002', :'a_id', 1);

-- ---------- author moves A to Trash ----------
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: delete (move to Trash) works', public.humor_delete_caption(:'a_id'));
select t.check('author: Trash lists exactly the deleted caption',
  (select count(*) = 1 and bool_and(id = :'a_id' and image_url is not null and total_count = 1) from public.humor_list_trash()));
select t.check('author: Trash paging works', (select count(*) = 0 from public.humor_list_trash(12, 12)));
select t.check('author: deleted caption hidden from normal reads', (select count(*) = 1 from public.captions));

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select t.check('fan: like hidden while in Trash', (select count(*) = 0 from public.caption_votes));
select t.check('fan: cannot see author''s Trash', (select count(*) = 0 from public.humor_list_trash()));
select t.denied('fan: cannot restore author''s caption', format($$select public.humor_restore_caption(%L)$$, :'a_id'));
select t.denied('fan: admin_restore_caption denied', format($$select public.admin_restore_caption(%L)$$, :'a_id'));

reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select t.denied('anon: Trash list denied', $$select * from public.humor_list_trash()$$);
select t.denied('anon: restore denied', format($$select public.humor_restore_caption(%L)$$, :'a_id'));
reset role; set role authenticated;
select t.denied('authenticated: internal restore helper not callable', format($$select public.humor_restore_caption_internal(%L, null)$$, :'a_id'));

-- ---------- author restores A ----------
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: restore works', public.humor_restore_caption(:'a_id'));
select t.check('author: restore retry is idempotent', public.humor_restore_caption(:'a_id'));
select t.check('author: Trash empty after restore', (select count(*) = 0 from public.humor_list_trash()));
select t.check('author: caption live again', (select count(*) = 2 from public.captions));
select t.check('author: generation no longer withdrawn', (select withdrawn_at is null from public.generations where id = '30000000-0000-4000-8000-000000000001'));
select t.denied('author: restoring a live caption of another id fails', $$select public.humor_restore_caption(gen_random_uuid())$$);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select t.check('fan: like is back after restore', (select count(*) = 1 from public.caption_votes where value = 1));

-- delete -> restore -> delete again still works
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: can delete again after restore', public.humor_delete_caption(:'a_id'));
select t.denied('author: stale publish blocked while in Trash', $$select public.humor_publish_preview('30000000-0000-4000-8000-000000000001')$$);

-- ---------- superadmin restore ----------
reset role;
update public.profiles set is_superadmin = true where id = '10000000-0000-4000-8000-00000000000a';
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000a', false);
select t.check('admin: Withdrawn list shows it', (select count(*) = 1 from public.admin_list_withdrawn_captions()));
select t.check('admin: restore works', public.admin_restore_caption(:'a_id'));
select t.check('admin: Withdrawn list empty', (select count(*) = 0 from public.admin_list_withdrawn_captions()));
select t.check('admin: caption live in Explore', (select count(*) = 2 from public.captions));
select t.check('admin: restore of unknown id returns false', not public.admin_restore_caption(gen_random_uuid()));

-- permanently deleted captions are not restorable
select t.check('admin: permanent delete', public.admin_delete_caption(:'b_id'));
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: permanently deleted caption not in Trash', (select count(*) = 0 from public.humor_list_trash()));
select t.denied('author: cannot restore permanently deleted caption', format($$select public.humor_restore_caption(%L)$$, :'b_id'));

reset role;
\o
\pset tuples_only off
\set QUIET 0
select n, case when ok then 'PASS' else 'FAIL' end as result, name from t.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
do $$ begin if exists (select 1 from t.results where not ok) then raise exception 'trash DB checks failed'; end if; end $$;
