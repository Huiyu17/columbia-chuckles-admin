-- Isolated PostgreSQL regression test for supabase/011_admin_soft_remove.sql (admin Remove → Restore / permanent Delete).
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
-- an author-trashed caption from before 011 must be backfilled as 'author'
insert into public.images (id, url, alt_text) values ('20000000-0000-4000-8000-0000000000ff', 'https://example.com/old.jpg', 'Old');
insert into public.captions (id, image_id, content, deleted_at) values ('40000000-0000-4000-8000-0000000000ff', '20000000-0000-4000-8000-0000000000ff', 'Old hidden seed', now());
\i supabase/011_admin_soft_remove.sql
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



select t.check('migration: pre-011 hidden caption backfilled as author',
  (select deleted_by = 'author' from public.captions where id = '40000000-0000-4000-8000-0000000000ff'));
select t.denied('migration: constraint rejects hidden caption without deleted_by',
  $$update public.captions set deleted_by = null where id = '40000000-0000-4000-8000-0000000000ff'$$);
delete from public.captions where id = '40000000-0000-4000-8000-0000000000ff';

-- ---------- setup: author publishes A, B, C; fan likes A; one seed caption S ----------
insert into public.captions (id, image_id, content) values ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'Seed S');
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
insert into public.generations (id, user_id, image_id, user_input, prompt, model, generated_content) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Scene A', 'p', 'gemini', 'Caption A'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Scene B', 'p', 'gemini', 'Caption B'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Scene C', 'p', 'gemini', 'Caption C');
select public.humor_publish_preview('30000000-0000-4000-8000-000000000001') as a_id \gset
select public.humor_publish_preview('30000000-0000-4000-8000-000000000002') as b_id \gset
select public.humor_publish_preview('30000000-0000-4000-8000-000000000003') as c_id \gset
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
insert into public.caption_votes (user_id, caption_id, value) values ('10000000-0000-4000-8000-000000000002', :'a_id', 1);

-- ---------- non-admins cannot remove ----------
select t.denied('fan: admin_remove_caption denied', format($$select public.admin_remove_caption(%L)$$, :'a_id'));
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.denied('author: admin_remove_caption denied', format($$select public.admin_remove_caption(%L)$$, :'a_id'));
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select t.denied('anon: admin_remove_caption denied', format($$select public.admin_remove_caption(%L)$$, :'a_id'));
reset role;
update public.profiles set is_superadmin = true where id = '10000000-0000-4000-8000-00000000000a';

-- ---------- admin removes A (soft) ----------
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000a', false);
select t.check('admin: remove returns true', public.admin_remove_caption(:'a_id'));
select t.check('admin: remove retry is idempotent', public.admin_remove_caption(:'a_id'));
select t.check('admin: unknown id returns false', not public.admin_remove_caption(gen_random_uuid()));
select t.check('admin: removed caption hidden from Explore reads', (select count(*) = 0 from public.captions where id = :'a_id'));
select t.check('admin: hidden list marks it deleted_by admin',
  (select count(*) = 1 from public.admin_list_withdrawn_captions() where id = :'a_id' and deleted_by = 'admin'));
reset role;
select t.check('db: votes are kept (not deleted)', (select count(*) = 1 from public.caption_votes where caption_id = :'a_id'));
select t.check('db: source generation marked withdrawn', (select withdrawn_at is not null from public.generations where id = '30000000-0000-4000-8000-000000000001'));

-- ---------- the author cannot undo a moderator removal ----------
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: Trash shows it, flagged removed_by_admin',
  (select count(*) = 1 from public.humor_list_trash() where id = :'a_id' and removed_by_admin));
select t.denied('author: restore of admin removal denied', format($$select public.humor_restore_caption(%L)$$, :'a_id'));
select set_config('t.a_id', :'a_id', false);
do $$ begin
  begin perform public.humor_restore_caption((select current_setting('t.a_id'))::uuid);
  exception when others then
    if sqlerrm like '%moderator%' then insert into t.results (name, ok) values ('author: error message mentions moderator', true);
    else insert into t.results (name, ok) values ('author: error message mentions moderator', false); end if;
    return;
  end;
  insert into t.results (name, ok) values ('author: error message mentions moderator', false);
end $$;
select t.check('author: deleting an admin-removed caption is a harmless no-op', public.humor_delete_caption(:'a_id'));
reset role;
select t.check('db: still deleted_by admin after author delete', (select deleted_by = 'admin' from public.captions where id = :'a_id'));
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.denied('author: stale publish of removed caption blocked', $$select public.humor_publish_preview('30000000-0000-4000-8000-000000000001')$$);
select t.denied('author: direct re-insert blocked', format($$insert into public.captions (image_id, content, generation_id) values ('20000000-0000-4000-8000-000000000001', 'x', '30000000-0000-4000-8000-000000000001')$$));
select t.denied('author: direct update of deleted_by blocked', format($$update public.captions set deleted_by = 'author' where id = %L$$, :'a_id'));
reset role;
select t.check('db: direct update changed nothing', (select deleted_by = 'admin' from public.captions where id = :'a_id'));
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select t.check('fan: like hidden while removed', (select count(*) = 0 from public.caption_votes));

-- ---------- author's own Trash still works alongside ----------
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: own delete of B works', public.humor_delete_caption(:'b_id'));
select t.check('author: Trash lists B as author-deleted',
  (select count(*) = 1 from public.humor_list_trash() where id = :'b_id' and not removed_by_admin));
select t.check('author: Trash total counts both', (select bool_and(total_count = 2) from public.humor_list_trash()));
select t.check('author: can restore own B', public.humor_restore_caption(:'b_id'));
select t.check('author: B live again', (select count(*) = 1 from public.captions where id = :'b_id'));
reset role;
select t.check('db: restored B has deleted_by cleared', (select deleted_at is null and deleted_by is null from public.captions where id = :'b_id'));

-- ---------- admin restores A ----------
set role authenticated; select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000a', false);
select t.check('admin: restore removed caption', public.admin_restore_caption(:'a_id'));
select t.check('admin: restore retry is idempotent', public.admin_restore_caption(:'a_id'));
select t.check('admin: A live again', (select count(*) = 1 from public.captions where id = :'a_id'));
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select t.check('fan: like is back after admin restore', (select count(*) = 1 from public.caption_votes where caption_id = :'a_id'));
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: A back in My captions, Trash empty',
  (select count(*) = 1 from public.captions where id = :'a_id') and (select count(*) = 0 from public.humor_list_trash()));

-- ---------- seed caption (no generation) ----------
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-00000000000a', false);
select t.check('admin: remove seed caption', public.admin_remove_caption('40000000-0000-4000-8000-000000000005'));
select t.check('admin: restore seed caption', public.admin_restore_caption('40000000-0000-4000-8000-000000000005'));
select t.check('admin: seed live again', (select count(*) = 1 from public.captions where id = '40000000-0000-4000-8000-000000000005'));

-- ---------- second step: permanent delete of a removed caption ----------
select t.check('admin: remove C', public.admin_remove_caption(:'c_id'));
select t.check('admin: permanent delete of removed C', public.admin_delete_caption(:'c_id'));
select t.check('admin: C gone from hidden list', (select count(*) = 0 from public.admin_list_withdrawn_captions() where id = :'c_id'));
select t.check('admin: C cannot be restored', not public.admin_restore_caption(:'c_id'));
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select t.check('author: C not in Trash after permanent delete', (select count(*) = 0 from public.humor_list_trash() where id = :'c_id'));

reset role;
select t.check('vote-owner trigger is still enabled', (select tgenabled = 'O' from pg_trigger where tgname = 'humor_vote_owner'));
\o
\pset tuples_only off
\set QUIET 0
select n, case when ok then 'PASS' else 'FAIL' end as result, name from t.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
do $$ begin if exists (select 1 from t.results where not ok) then raise exception 'removal DB checks failed'; end if; end $$;
