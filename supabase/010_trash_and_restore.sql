-- Trash & restore for captions withdrawn in My humor. Run once in the Supabase
-- SQL Editor after 007 and 008. Idempotent; no existing rows are changed.
--
-- A My humor "delete" is already a soft delete (007): captions.deleted_at and
-- generations.withdrawn_at are set, nothing is erased. Restoring clears both, so
-- the caption returns to Explore with its original votes and in everyone's
-- liked collections. Captions an admin deleted permanently are gone and cannot
-- be restored.
--
-- Same file in both repositories (the-humor-project and columbia-chuckles-admin).
begin;

-- Owner's Trash. DEFINER because the restrictive "Hide withdrawn captions"
-- policy hides these rows from every SELECT; ownership is checked here instead.
create or replace function public.humor_list_trash(p_limit int default 12, p_offset int default 0)
returns table (
  id uuid, content text, created_at timestamptz, deleted_at timestamptz,
  image_url text, image_alt text, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view your trash' using errcode = '42501';
  end if;
  return query
    select c.id, c.content, c.created_at, c.deleted_at, i.url, i.alt_text,
      count(*) over ()
    from public.captions c
    join public.generations g on g.id = c.generation_id
    left join public.images i on i.id = c.image_id
    where g.user_id = (select auth.uid()) and c.deleted_at is not null
    order by c.deleted_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 12), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Shared restore step. Not callable by clients; the two wrappers below decide who may use it.
create or replace function public.humor_restore_caption_internal(p_caption_id uuid, p_owner uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  source_id uuid;
begin
  select c.generation_id into source_id from public.captions c
    join public.generations g on g.id = c.generation_id
    where c.id = p_caption_id and c.deleted_at is not null
      and (p_owner is null or g.user_id = p_owner);
  if source_id is null then
    -- Already live (a retry after a lost response) counts as success.
    if exists (select 1 from public.captions c join public.generations g on g.id = c.generation_id
               where c.id = p_caption_id and c.deleted_at is null
                 and (p_owner is null or g.user_id = p_owner)) then
      return true;
    end if;
    return false;
  end if;
  -- Same lock as publish/delete, so restore and delete can't interleave.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(source_id::text, 0));
  update public.generations set withdrawn_at = null where id = source_id;
  update public.captions set deleted_at = null where generation_id = source_id;
  return true;
end;
$$;
revoke all on function public.humor_restore_caption_internal(uuid, uuid) from public, anon, authenticated;

-- Author restores their own caption from Trash.
create or replace function public.humor_restore_caption(p_caption_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to restore' using errcode = '42501';
  end if;
  if not public.humor_restore_caption_internal(p_caption_id, (select auth.uid())) then
    raise exception 'Caption unavailable or not yours' using errcode = '42501';
  end if;
  return true;
end;
$$;

-- Superadmin restores any author-withdrawn caption (Backstage → Withdrawn).
create or replace function public.admin_restore_caption(p_caption_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_superadmin() then
    raise exception 'Superadmin only' using errcode = '42501';
  end if;
  return public.humor_restore_caption_internal(p_caption_id, null);
end;
$$;

revoke all on function public.humor_list_trash(int, int) from public, anon;
revoke all on function public.humor_restore_caption(uuid) from public, anon;
revoke all on function public.admin_restore_caption(uuid) from public, anon;
grant execute on function public.humor_list_trash(int, int) to authenticated;
grant execute on function public.humor_restore_caption(uuid) to authenticated;
grant execute on function public.admin_restore_caption(uuid) to authenticated;

commit;

-- Expected: 4 rows, all DEFINER.
select routine_name, security_type from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('humor_list_trash', 'humor_restore_caption_internal',
    'humor_restore_caption', 'admin_restore_caption')
order by routine_name;
