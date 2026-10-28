-- Week 7. Apply to the SAME project as Week 6, after 008-011.
-- Existing tables are preserved. Review compatibility before using on another project.
begin;
create table if not exists public.llm_providers (
  id uuid primary key default gen_random_uuid(), name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.llm_models (
  id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.llm_providers(id),
  name text not null check (length(trim(name)) > 0), created_at timestamptz not null default now(), unique(provider_id,name)
);
create table if not exists public.prompt_chains (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  created_at timestamptz not null default now()
);
create table if not exists public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(), prompt_chain_id uuid not null references public.prompt_chains(id),
  step_order integer not null check(step_order >= 0), llm_model_id uuid references public.llm_models(id),
  prompt text not null, created_at timestamptz not null default now(), unique(prompt_chain_id,step_order)
);
create table if not exists public.prompt_chain_mix (
  id uuid primary key default gen_random_uuid(), prompt_chain_id uuid not null unique references public.prompt_chains(id),
  weight numeric not null default 1 check(weight >= 0), enabled boolean not null default true
);
create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(), term text not null unique check(length(trim(term)) > 0),
  definition text not null check(length(trim(definition)) > 0), created_at timestamptz not null default now()
);
create table if not exists public.ai_generation_examples (
  id uuid primary key default gen_random_uuid(), prompt text not null check(length(trim(prompt)) > 0),
  response text not null check(length(trim(response)) > 0), image_id uuid references public.images(id),
  created_at timestamptz not null default now()
);
create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(), generation_id uuid references public.generations(id),
  user_id uuid references public.profiles(id), prompt_chain_id uuid references public.prompt_chains(id),
  status text not null default 'pending' check(status in ('pending','running','completed','failed')),
  request jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.llm_responses (
  id uuid primary key default gen_random_uuid(), generation_request_id uuid references public.generation_requests(id),
  llm_model_id uuid references public.llm_models(id), response text, error text,
  latency_ms integer check(latency_ms >= 0), input_tokens integer check(input_tokens >= 0),
  output_tokens integer check(output_tokens >= 0), created_at timestamptz not null default now()
);
create table if not exists public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(), domain text not null unique
  check(domain = lower(trim(domain)) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.whitelisted_email_addresses (
  id uuid primary key default gen_random_uuid(), email text not null unique
  check(email = lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now()
);

-- No client gets direct access to the new tables. RPCs below enforce admin access.
do $$ declare t text; begin
  foreach t in array array['llm_providers','llm_models','prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','ai_generation_examples','generation_requests','llm_responses','allowed_signup_domains','whitelisted_email_addresses'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
  end loop;
end $$;

create or replace function public.admin_resource_read(resource text, page_number integer default 1, search_text text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cols jsonb; rows jsonb; total bigint; pk text; relation regclass;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if resource <> all(array['prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','generation_requests','ai_generation_examples','llm_models','llm_providers','llm_responses','allowed_signup_domains','whitelisted_email_addresses','images']) then
    raise exception 'Unknown resource' using errcode='22023';
  end if;
  relation := format('public.%I',resource)::regclass;
  select a.attname into pk from pg_catalog.pg_index i join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indrelid=relation and i.indisprimary and i.indnatts=1;
  if pk is null then raise exception 'Resource needs a single-column primary key'; end if;
  select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
    'required',a.attnotnull,'generated',a.attgenerated <> '' or a.attidentity <> '', 'primary',a.attname=pk,
    'default_value',pg_catalog.pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    into cols from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=relation and a.attnum>0 and not a.attisdropped;
  execute format('select count(*) from public.%I t where position(lower($1) in lower(to_jsonb(t)::text)) > 0',resource) into total using left(coalesce(search_text,''),200);
  execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from (select * from public.%I t where position(lower($1) in lower(to_jsonb(t)::text)) > 0 order by %I limit 25 offset $2) x',resource,pk)
    into rows using left(coalesce(search_text,''),200),(greatest(1,least(coalesce(page_number,1),100000))-1)*25;
  return jsonb_build_object('columns',cols,'rows',rows,'total',total);
end $$;

create or replace function public.admin_resource_write(resource text, operation text, row_id jsonb, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare relation regclass; pk text; names text; values_sql text; assignments text; affected integer;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if resource <> all(array['terms','ai_generation_examples','llm_models','llm_providers','allowed_signup_domains','whitelisted_email_addresses','images','prompt_chain_mix'])
    or operation <> all(array['create','update','delete']) or (resource='prompt_chain_mix' and operation <> 'update') then
    raise exception 'Operation not allowed' using errcode='42501';
  end if;
  if resource is null or operation is null then raise exception 'Operation not allowed' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text)>100000 then raise exception 'Invalid payload'; end if;
  relation := format('public.%I',resource)::regclass;
  select a.attname into pk from pg_catalog.pg_index i join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indrelid=relation and i.indisprimary and i.indnatts=1;
  if pk is null then raise exception 'Resource needs a single-column primary key'; end if;
  if exists(select 1 from jsonb_object_keys(payload) k where not exists (
    select 1 from pg_catalog.pg_attribute a where a.attrelid=relation and a.attname=k and a.attnum>0 and not a.attisdropped
      and a.attgenerated='' and a.attidentity='' and a.attname<>pk and a.attname not in ('created_at','updated_at'))) then
    raise exception 'Unknown or protected field' using errcode='22023';
  end if;
  select string_agg(format('%I',k),','),string_agg(format('r.%I',k),','),string_agg(format('%I = r.%I',k,k),',')
    into names,values_sql,assignments from jsonb_object_keys(payload) k;
  if operation='create' then
    if names is null then execute format('insert into public.%I default values',resource);
    else execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',resource,names,values_sql,resource) using payload; end if;
  elsif operation='update' then
    if names is null then raise exception 'No fields to update'; end if;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t.%I)=$2',resource,assignments,resource,pk) using payload,row_id;
    get diagnostics affected = row_count;
    if affected<>1 then raise exception 'Record no longer exists'; end if;
  else
    -- Week 3 captions.image_id uses ON DELETE CASCADE. Explicitly guard images
    -- so deleting a photo cannot silently erase captions and their votes.
    if resource='images' and (
      exists(select 1 from public.captions where to_jsonb(image_id)=row_id)
      or exists(select 1 from public.generations where to_jsonb(image_id)=row_id)
      or exists(select 1 from public.ai_generation_examples e where to_jsonb(e)->'image_id'=row_id)
    ) then raise exception 'Image is referenced by captions, generations or examples' using errcode='23503'; end if;
    -- Other references are protected by their foreign keys.
    execute format('delete from public.%I t where to_jsonb(t.%I)=$1',resource,pk) using row_id;
    get diagnostics affected = row_count;
    if affected<>1 then raise exception 'Record no longer exists'; end if;
  end if;
end $$;
revoke all on function public.admin_resource_read(text,integer,text) from public,anon;
revoke all on function public.admin_resource_write(text,text,jsonb,jsonb) from public,anon;
grant execute on function public.admin_resource_read(text,integer,text),public.admin_resource_write(text,text,jsonb,jsonb) to authenticated;
commit;
