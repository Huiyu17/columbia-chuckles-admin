-- Week 6 admin panel. Run once in the Supabase SQL Editor (after 001–007).
-- Safe to re-run: every statement is idempotent. No existing rows are removed.
--
-- Security model
--   * profiles.is_superadmin is the single source of truth for admin access.
--   * App users cannot change it: authenticated only has column-level UPDATE on
--     (first_name, last_name, avatar_url, updated_at) and no INSERT on profiles.
--   * Reads: extra PERMISSIVE policies let superadmins read every profile, vote
--     and generation. Non-admins keep exactly the access they had before.
--   * Writes: narrow SECURITY DEFINER functions that re-check is_superadmin()
--     inside the database, so a bug in the web app cannot bypass the check.
begin;

alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;
alter table public.captions
  add column if not exists admin_edited_at timestamptz;

-- Defence in depth: make sure no client role can grant itself admin.
revoke insert, update (is_superadmin) on public.profiles from anon, authenticated;

-- DEFINER so the check works inside profiles' own RLS policy without recursion.
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.is_superadmin from public.profiles p where p.id = (select auth.uid())),
    false);
$$;
revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

-- ---------- READ access for superadmins (permissive, authenticated only) ----------
drop policy if exists "Superadmins can read all profiles" on public.profiles;
create policy "Superadmins can read all profiles" on public.profiles
  as permissive for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins can read all votes" on public.caption_votes;
create policy "Superadmins can read all votes" on public.caption_votes
  as permissive for select to authenticated using ((select public.is_superadmin()));

drop policy if exists "Superadmins can read all generations" on public.generations;
create policy "Superadmins can read all generations" on public.generations
  as permissive for select to authenticated using ((select public.is_superadmin()));

-- ---------- Users (READ): profile + sign-in metadata from auth.users ----------
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, first_name text, last_name text, avatar_url text,
  is_superadmin boolean, created_at timestamptz, last_sign_in_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.first_name, p.last_name, p.avatar_url,
      coalesce(p.is_superadmin, false), u.created_at, u.last_sign_in_at
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

-- ---------- AI media (CREATE) ----------
-- Records provenance in generations (owned by the admin), then publishes it.
create or replace function public.admin_create_caption(
  p_image_id uuid, p_content text, p_user_input text, p_prompt text, p_model text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_generation_id uuid;
  new_caption_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  if p_image_id is null
    or length(trim(coalesce(p_content, ''))) not between 1 and 500
    or length(trim(coalesce(p_user_input, ''))) not between 1 and 500
    or length(trim(coalesce(p_prompt, ''))) not between 1 and 20000
    or length(trim(coalesce(p_model, ''))) not between 1 and 200 then
    raise exception 'Invalid caption input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.images where id = p_image_id) then
    raise exception 'Image not found' using errcode = '22023';
  end if;
  insert into public.generations (user_id, image_id, user_input, prompt, model, generated_content)
    values ((select auth.uid()), p_image_id, trim(p_user_input), p_prompt, trim(p_model), trim(p_content))
    returning id into new_generation_id;
  insert into public.captions (image_id, content, generation_id)
    values (p_image_id, trim(p_content), new_generation_id)
    returning id into new_caption_id;
  return new_caption_id;
end;
$$;

-- ---------- AI media (UPDATE) ----------
create or replace function public.admin_update_caption(
  p_caption_id uuid, p_content text, p_image_id uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_content, ''))) not between 1 and 500 or p_image_id is null then
    raise exception 'Invalid caption input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.images where id = p_image_id) then
    raise exception 'Image not found' using errcode = '22023';
  end if;
  update public.captions
    set content = trim(p_content), image_id = p_image_id, admin_edited_at = now()
    where id = p_caption_id;
  return found;
end;
$$;

-- ---------- AI media (DELETE, permanent) ----------
-- Also withdraws the source generation so the author cannot re-publish it with a
-- stale Publish retry (same advisory lock as humor_publish_preview).
create or replace function public.admin_delete_caption(p_caption_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  source_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  select generation_id into source_id from public.captions where id = p_caption_id;
  if not found then return false; end if;
  if source_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_id::text, 0));
    update public.generations set withdrawn_at = coalesce(withdrawn_at, now()) where id = source_id;
  end if;
  -- The Week 3 trigger humor_vote_owner only lets voters delete their own votes.
  -- Skip it for this one statement (transaction-scoped: other sessions wait on
  -- the table lock and never see it disabled) instead of weakening it for everyone.
  if exists (select 1 from pg_catalog.pg_trigger
      where tgrelid = 'public.caption_votes'::regclass
        and tgname = 'humor_vote_owner' and tgenabled <> 'D') then
    alter table public.caption_votes disable trigger humor_vote_owner;
    delete from public.caption_votes where caption_id = p_caption_id;
    alter table public.caption_votes enable trigger humor_vote_owner;
  else
    delete from public.caption_votes where caption_id = p_caption_id;
  end if;
  delete from public.captions where id = p_caption_id;
  return true;
end;
$$;

-- ---------- Withdrawn captions (READ) ----------
-- Captions withdrawn by their authors stay hidden from everyone by the
-- restrictive policy from 007; admins read them only through this function.
create or replace function public.admin_list_withdrawn_captions()
returns table (
  id uuid, content text, created_at timestamptz, deleted_at timestamptz,
  image_id uuid, generation_id uuid
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  return query
    select c.id, c.content, c.created_at, c.deleted_at, c.image_id, c.generation_id
    from public.captions c where c.deleted_at is not null
    order by c.deleted_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_create_caption(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_update_caption(uuid, text, uuid) from public, anon;
revoke all on function public.admin_delete_caption(uuid) from public, anon;
revoke all on function public.admin_list_withdrawn_captions() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_create_caption(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_update_caption(uuid, text, uuid) to authenticated;
grant execute on function public.admin_delete_caption(uuid) to authenticated;
grant execute on function public.admin_list_withdrawn_captions() to authenticated;

commit;

-- Expected: 6 rows, all DEFINER.
select routine_name, security_type from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('is_superadmin', 'admin_list_users', 'admin_create_caption',
    'admin_update_caption', 'admin_delete_caption', 'admin_list_withdrawn_captions')
order by routine_name;
