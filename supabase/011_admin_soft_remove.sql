-- Admin "Remove" becomes a reversible soft delete. Run once in the Supabase SQL
-- Editor after 007, 008 and 010. Idempotent; no caption is deleted or revealed.
--
-- Two kinds of hidden caption now exist, recorded in captions.deleted_by:
--   'author' - the author moved it to Trash in My humor. Author OR admin may restore.
--   'admin'  - a superadmin removed it in Backstage. ONLY an admin may restore;
--              the author sees it in Trash as "Removed by a moderator".
-- Permanent deletion (admin_delete_caption, 008) is unchanged and is now offered
-- in Backstage only for captions that are already hidden.
--
-- Same file in both repositories (the-humor-project and columbia-chuckles-admin).
begin;

alter table public.captions add column if not exists deleted_by text;
-- Everything hidden before this migration was hidden by its author (007/010).
update public.captions set deleted_by = 'author'
  where deleted_at is not null and deleted_by is null;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                 where conname = 'captions_deleted_by_check'
                   and conrelid = 'public.captions'::regclass) then
    -- Written so NULL can't slip through: a CHECK passes on NULL, and
    -- "NULL in (...)" is NULL. Both sides of "=" here are never NULL.
    alter table public.captions add constraint captions_deleted_by_check check (
      (deleted_at is null) = (deleted_by is null)
      and coalesce(deleted_by in ('author', 'admin'), true));
  end if;
end;
$$;

-- Author delete (replaces 007): record who hid it, and never downgrade an admin
-- removal into an author-restorable Trash item.
create or replace function public.humor_delete_caption(p_caption_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  source_id uuid;
begin
  if owner_id is null then
    raise exception 'Sign in to delete' using errcode = '42501';
  end if;
  select c.generation_id into source_id from public.captions c
    join public.generations g on g.id = c.generation_id
    where c.id = p_caption_id and g.user_id = owner_id;
  if source_id is null then
    raise exception 'Caption unavailable or not yours' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_id::text, 0));
  update public.generations set withdrawn_at = coalesce(withdrawn_at, now())
    where id = source_id and user_id = owner_id;
  update public.captions
    set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, 'author')
    where generation_id = source_id;
  return true;
end;
$$;

-- Admin remove: hide from everyone, keep votes, block the author's stale re-publish.
create or replace function public.admin_remove_caption(p_caption_id uuid)
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
  update public.captions
    set deleted_at = coalesce(deleted_at, now()), deleted_by = 'admin'
    where id = p_caption_id;
  return true;
end;
$$;

-- Shared restore step (replaces 010). p_owner = the author, or null for an admin.
-- Authors may not restore an admin removal. Seed captions without a generation
-- can be restored by admins too.
create or replace function public.humor_restore_caption_internal(p_caption_id uuid, p_owner uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  source_id uuid;
  target public.captions%rowtype;
  owner_id uuid;
begin
  select generation_id into source_id from public.captions where id = p_caption_id;
  if not found then return false; end if;
  if source_id is not null then
    -- Same lock as publish/delete/remove, so they can't interleave.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_id::text, 0));
    select user_id into owner_id from public.generations where id = source_id;
  end if;
  select * into target from public.captions where id = p_caption_id for update;
  if not found then return false; end if;
  if p_owner is not null then
    if owner_id is distinct from p_owner then return false; end if;
    if target.deleted_by = 'admin' then return false; end if;
  end if;
  if target.deleted_at is null then return true; end if; -- retry after a lost response
  if source_id is not null then
    update public.generations set withdrawn_at = null where id = source_id;
  end if;
  update public.captions set deleted_at = null, deleted_by = null where id = p_caption_id;
  return true;
end;
$$;
revoke all on function public.humor_restore_caption_internal(uuid, uuid) from public, anon, authenticated;

-- Author restore (replaces 010) with a specific message for moderator removals.
create or replace function public.humor_restore_caption(p_caption_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to restore' using errcode = '42501';
  end if;
  if exists (select 1 from public.captions c join public.generations g on g.id = c.generation_id
             where c.id = p_caption_id and g.user_id = (select auth.uid()) and c.deleted_by = 'admin') then
    raise exception 'Removed by a moderator' using errcode = '42501';
  end if;
  if not public.humor_restore_caption_internal(p_caption_id, (select auth.uid())) then
    raise exception 'Caption unavailable or not yours' using errcode = '42501';
  end if;
  return true;
end;
$$;

-- Author's Trash (replaces 010): now says which items a moderator removed.
drop function if exists public.humor_list_trash(int, int);
create function public.humor_list_trash(p_limit int default 12, p_offset int default 0)
returns table (
  id uuid, content text, created_at timestamptz, deleted_at timestamptz,
  image_url text, image_alt text, removed_by_admin boolean, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view your trash' using errcode = '42501';
  end if;
  return query
    select c.id, c.content, c.created_at, c.deleted_at, i.url, i.alt_text,
      coalesce(c.deleted_by = 'admin', false), count(*) over ()
    from public.captions c
    join public.generations g on g.id = c.generation_id
    left join public.images i on i.id = c.image_id
    where g.user_id = (select auth.uid()) and c.deleted_at is not null
    order by c.deleted_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 12), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Backstage hidden-caption list (replaces 008): now includes who hid it.
drop function if exists public.admin_list_withdrawn_captions();
create function public.admin_list_withdrawn_captions()
returns table (
  id uuid, content text, created_at timestamptz, deleted_at timestamptz,
  image_id uuid, generation_id uuid, deleted_by text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  return query
    select c.id, c.content, c.created_at, c.deleted_at, c.image_id, c.generation_id, c.deleted_by
    from public.captions c where c.deleted_at is not null
    order by c.deleted_at desc;
end;
$$;

revoke all on function public.humor_delete_caption(uuid) from public, anon;
revoke all on function public.admin_remove_caption(uuid) from public, anon;
revoke all on function public.humor_restore_caption(uuid) from public, anon;
revoke all on function public.humor_list_trash(int, int) from public, anon;
revoke all on function public.admin_list_withdrawn_captions() from public, anon;
grant execute on function public.humor_delete_caption(uuid) to authenticated;
grant execute on function public.admin_remove_caption(uuid) to authenticated;
grant execute on function public.humor_restore_caption(uuid) to authenticated;
grant execute on function public.humor_list_trash(int, int) to authenticated;
grant execute on function public.admin_list_withdrawn_captions() to authenticated;

commit;

-- Expected: 6 rows, all DEFINER.
select routine_name, security_type from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('humor_delete_caption', 'admin_remove_caption', 'humor_restore_caption_internal',
    'humor_restore_caption', 'humor_list_trash', 'admin_list_withdrawn_captions')
order by routine_name;
