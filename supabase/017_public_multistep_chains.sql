-- Shared project, after 015 and 016. Deploy the updated public app with this migration.
begin;

-- New and existing chains start disabled until explicitly enabled in Admin.
create or replace function public.tool_configure_chain_mix() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.prompt_chain_mix(prompt_chain_id,enabled,weight) values(new.id,false,1)
    on conflict(prompt_chain_id) do nothing;
  return new;
end $$;
drop trigger if exists tool_configure_chain_mix on public.prompt_chains;
create trigger tool_configure_chain_mix after insert on public.prompt_chains
  for each row execute function public.tool_configure_chain_mix();
insert into public.prompt_chain_mix(prompt_chain_id,enabled,weight)
  select id,false,1 from public.prompt_chains on conflict(prompt_chain_id) do nothing;

create or replace function public.tool_save_chain(p_id uuid,p_revision integer,p_name text,p_description text,p_steps jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare chain uuid:=p_id; current_revision integer; item jsonb; ordinal integer:=0; step_id uuid;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_description,''))>2000
    or p_steps is null or jsonb_typeof(p_steps)<>'array' then raise exception 'Invalid chain'; end if;
  if jsonb_array_length(p_steps) not between 1 and 6 then raise exception 'Use one to six steps'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_steps))<>jsonb_array_length(p_steps) then raise exception 'Duplicate step'; end if;
  if chain is null then
    insert into public.prompt_chains(name,description) values(trim(p_name),p_description) returning id into chain;
  else
    select revision into current_revision from public.prompt_chains where id=chain for update;
    if current_revision is null then raise exception 'Chain no longer exists'; end if;
    if p_revision is distinct from current_revision then raise exception 'This chain changed. Reload before saving.'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_steps) loop
    step_id:=(item->>'id')::uuid;
    if step_id is null or length(trim(coalesce(item->>'prompt',''))) not between 1 and 10000 then raise exception 'Each step needs an instruction'; end if;
    if exists(select 1 from public.prompt_chain_steps where id=step_id and prompt_chain_id<>chain) then raise exception 'Step belongs to another chain'; end if;
    if nullif(item->>'llm_model_id','') is not null and not exists(
      select 1 from public.llm_models m join public.llm_providers p on p.id=m.provider_id
      where m.id=(item->>'llm_model_id')::uuid and p.name='Google') then raise exception 'Choose a registered Google model'; end if;
  end loop;
  update public.prompt_chain_steps set step_order=step_order+100000 where prompt_chain_id=chain;
  update public.llm_responses set prompt_chain_step_id=null where prompt_chain_step_id in (
    select s.id from public.prompt_chain_steps s where s.prompt_chain_id=chain
      and not exists(select 1 from jsonb_array_elements(p_steps) j where (j->>'id')::uuid=s.id));
  delete from public.prompt_chain_steps s where s.prompt_chain_id=chain
    and not exists(select 1 from jsonb_array_elements(p_steps) j where (j->>'id')::uuid=s.id);
  for item in select value from jsonb_array_elements(p_steps) loop
    insert into public.prompt_chain_steps(id,prompt_chain_id,step_order,llm_model_id,prompt)
      values((item->>'id')::uuid,chain,ordinal,nullif(item->>'llm_model_id','')::uuid,trim(item->>'prompt'))
      on conflict(id) do update set step_order=excluded.step_order,llm_model_id=excluded.llm_model_id,prompt=excluded.prompt;
    ordinal:=ordinal+1;
  end loop;
  update public.prompt_chains set name=trim(p_name),description=p_description,revision=revision+1 where id=chain;
  return chain;
end $$;

-- Preserve the last configured output, including lists of captions, without truncation.
alter table public.generations drop constraint if exists generations_generated_content_check;
alter table public.generations add constraint generations_generated_content_check
  check(generated_content is null or length(trim(generated_content)) between 1 and 20000);
alter table public.captions drop constraint if exists captions_content_check;
alter table public.captions add constraint captions_content_check
  check(length(trim(content)) between 1 and 20000);
alter table public.llm_responses add column if not exists chain_step_order integer;
create unique index if not exists llm_response_chain_step on public.llm_responses(generation_request_id,chain_step_order)
  where chain_step_order is not null;

create or replace function public.humor_begin_chain_generation(
  p_image_id uuid,p_context text,p_style text,p_base_prompt text,p_default_model text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); chain uuid; request_id uuid; steps jsonb; step_count integer;
begin
  if viewer is null or not exists(select 1 from public.profiles where id=viewer) then
    raise exception 'Sign in to generate' using errcode='42501'; end if;
  if length(trim(coalesce(p_context,''))) not between 5 and 500 or p_style is null or p_style not in ('relatable','deadpan','absurd')
    or length(coalesce(p_base_prompt,'')) not between 1 and 8000 or length(trim(coalesce(p_default_model,''))) not between 1 and 200 then
    raise exception 'Invalid generation input' using errcode='22023'; end if;
  if not exists(select 1 from public.images where id=p_image_id and (user_id is null or user_id=viewer)) then
    raise exception 'Choose a preset or your own photo' using errcode='42501'; end if;
  select m.prompt_chain_id into chain from public.prompt_chain_mix m where m.enabled and m.weight>0
    order by -ln(greatest(random(),0.000000000001))/m.weight limit 1;
  if chain is null then raise exception 'No enabled prompt chain with positive weight' using errcode='22023'; end if;
  -- Serialize snapshot creation against tool_save_chain; subsequent edits cannot change a run.
  perform 1 from public.prompt_chains where id=chain for share;
  select count(*) into step_count from public.prompt_chain_steps where prompt_chain_id=chain;
  if step_count not between 1 and 6 then raise exception 'A chain needs one to six steps' using errcode='22023'; end if;
  if exists(select 1 from public.prompt_chain_steps s
    left join public.llm_models m on m.id=s.llm_model_id or (s.llm_model_id is null and m.name=p_default_model and m.provider_id in(select id from public.llm_providers where name='Google'))
    left join public.llm_providers p on p.id=m.provider_id
    where s.prompt_chain_id=chain and (m.id is null or p.name is distinct from 'Google' or length(trim(s.prompt)) not between 1 and 10000)) then
    raise exception 'Every step needs an instruction and a registered Google model' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',s.id,'instruction',s.prompt,'model_id',m.id,'model',m.name) order by s.step_order) into steps
    from public.prompt_chain_steps s join public.llm_models m on m.id=s.llm_model_id or (s.llm_model_id is null and m.name=p_default_model and m.provider_id in(select id from public.llm_providers where name='Google'))
    where s.prompt_chain_id=chain;
  perform 1 from public.profiles where id=viewer for update;
  update public.generation_requests set status='failed',request=request || jsonb_build_object('error','Execution was interrupted before completion.')
    where user_id=viewer and status='running' and request->>'engine'='chain-v2' and created_at<now()-interval '5 minutes';
  if exists(select 1 from public.generation_requests where user_id=viewer and status='running' and request->>'engine'='chain-v2') then
    raise exception 'A generation is already running' using errcode='22023'; end if;
  insert into public.generation_requests(user_id,image_id,prompt_chain_id,status,request)
    values(viewer,p_image_id,chain,'running',jsonb_build_object('source','caption-app','engine','chain-v2',
      'context',trim(p_context),'style',p_style,'prompt',p_base_prompt,'steps',steps,
      'chain_name',(select name from public.prompt_chains where id=chain),
      'model',(select string_agg(distinct value->>'model',', ' order by value->>'model') from jsonb_array_elements(steps)))) returning id into request_id;
  return jsonb_build_object('request_id',request_id,'steps',steps,'context',p_base_prompt);
end $$;

create or replace function public.humor_record_chain_step(
  p_request_id uuid,p_order integer,p_prompt text,p_response text,p_error text,p_latency_ms integer,
  p_input_tokens integer default null,p_output_tokens integer default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare req public.generation_requests; saved public.llm_responses; step jsonb; n integer; draft uuid; step_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to record generation' using errcode='42501'; end if;
  select * into req from public.generation_requests where id=p_request_id and user_id=auth.uid() for update;
  if req.id is null or req.request->>'engine' is distinct from 'chain-v2' then raise exception 'Generation unavailable' using errcode='42501'; end if;
  select * into saved from public.llm_responses where generation_request_id=req.id and chain_step_order=p_order;
  if saved.id is not null then
    if saved.prompt is distinct from p_prompt or saved.response is distinct from nullif(trim(p_response),'')
      or saved.error is distinct from nullif(trim(p_error),'') then raise exception 'Step was already recorded with a different result'; end if;
    return req.generation_id;
  end if;
  if req.status<>'running' then raise exception 'Generation is no longer running'; end if;
  select count(*) into n from public.llm_responses where generation_request_id=req.id and chain_step_order is not null;
  if p_order is distinct from n or n>=jsonb_array_length(req.request->'steps') then raise exception 'Invalid step order'; end if;
  if p_latency_ms is null or p_latency_ms<0 or p_input_tokens<0 or p_output_tokens<0
    or length(coalesce(p_prompt,'')) not between 1 and 40000 or length(coalesce(p_response,''))>20000
    or length(coalesce(p_error,''))>2000 then raise exception 'Invalid step result'; end if;
  if nullif(trim(p_error),'') is null and length(trim(coalesce(p_response,''))) not between 1 and 20000 then raise exception 'Empty step output'; end if;
  step:=req.request->'steps'->p_order;
  select id into step_id from public.prompt_chain_steps where id=(step->>'id')::uuid;
  insert into public.llm_responses(generation_request_id,chain_step_order,llm_model_id,prompt_chain_step_id,prompt,response,error,latency_ms,input_tokens,output_tokens)
    values(req.id,p_order,(step->>'model_id')::uuid,step_id,p_prompt,nullif(trim(p_response),''),nullif(trim(p_error),''),p_latency_ms,p_input_tokens,p_output_tokens);
  if nullif(trim(p_error),'') is not null then
    update public.generation_requests set status='failed',request=request || jsonb_build_object('error',p_error) where id=req.id;
  elsif p_order+1=jsonb_array_length(req.request->'steps') then
    insert into public.generations(user_id,image_id,user_input,prompt,model,generated_content)
      values(req.user_id,req.image_id,req.request->>'context',p_prompt,step->>'model',trim(p_response)) returning id into draft;
    update public.generation_requests set status='completed',generation_id=draft where id=req.id;
  end if;
  return draft;
end $$;

create or replace function public.admin_save_chain_mix(p_settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare setting jsonb; chain uuid; enabled boolean; weight numeric;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  if p_settings is null or jsonb_typeof(p_settings)<>'array' or jsonb_array_length(p_settings)>1000 then raise exception 'Invalid mix settings'; end if;
  -- One transaction applies the whole mix, preventing partial updates on failure.
  for setting in select value from jsonb_array_elements(p_settings) order by value->>'chain' loop
    chain:=(setting->>'chain')::uuid; enabled:=(setting->>'enabled')::boolean; weight:=(setting->>'weight')::numeric;
    if chain is null or enabled is null or weight is null or weight<0 or weight::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid mix settings'; end if;
    perform 1 from public.prompt_chains where id=chain for update;
    if not found then raise exception 'Chain is unavailable'; end if;
    if enabled and weight>0 then
      if (select count(*) from public.prompt_chain_steps where prompt_chain_id=chain) not between 1 and 6 then raise exception 'Enabled chains need one to six steps'; end if;
      if exists(select 1 from public.prompt_chain_steps s left join public.llm_models m on m.id=s.llm_model_id left join public.llm_providers p on p.id=m.provider_id
        where s.prompt_chain_id=chain and (length(trim(s.prompt)) not between 1 and 10000 or (s.llm_model_id is not null and p.name is distinct from 'Google'))) then
        raise exception 'Enabled chains need instructions and Google models'; end if;
    end if;
    insert into public.prompt_chain_mix(prompt_chain_id,enabled,weight) values(chain,enabled,weight)
      on conflict(prompt_chain_id) do update set enabled=excluded.enabled,weight=excluded.weight;
  end loop;
end $$;
-- Render each response using its snapshotted model name, not the chain summary.
create or replace function public.tool_media(p_chain uuid default null,p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  with media as (
    select id,chain_id,chain_name,status,scene,image_url,output,error,created_at,outputs,'prompt-tool'::text source
      from public.prompt_tool_runs where p_chain is null or chain_id=p_chain
    union all
    select r.id,r.prompt_chain_id,coalesce(c.name,r.request->>'deleted_chain_name',r.request->>'chain_name','Deleted prompt chain'),r.status,
      coalesce(r.request->>'context',''),i.url,g.generated_content,
      coalesce((select l.error from public.llm_responses l where l.generation_request_id=r.id and l.error is not null order by l.created_at desc,l.id desc limit 1),r.request->>'error'),
      r.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'order',x.ordinal,'model',x.model,'prompt',x.prompt,'output',x.response,'error',x.error,
        'latencyMs',x.latency_ms,'inputTokens',x.input_tokens,'outputTokens',x.output_tokens
      ) order by x.ordinal) from (
        select row_number() over(order by l.chain_step_order nulls last,l.created_at,l.id)-1 ordinal,
          coalesce(r.request->'steps'->l.chain_step_order->>'model',m.name,r.request->>'model') model,
          coalesce(l.prompt,r.request->>'prompt') prompt,l.response,l.error,l.latency_ms,l.input_tokens,l.output_tokens
        from public.llm_responses l left join public.llm_models m on m.id=l.llm_model_id where l.generation_request_id=r.id
      ) x),'[]'::jsonb),'caption-app'
      from public.generation_requests r left join public.prompt_chains c on c.id=r.prompt_chain_id
      left join public.images i on i.id=r.image_id left join public.generations g on g.id=r.generation_id
      where p_chain is null or r.prompt_chain_id=p_chain
  ) select jsonb_build_object('total',(select count(*) from media),'rows',coalesce((select jsonb_agg(x) from (
      select * from media order by created_at desc,id limit 12 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*12) x),'[]')) into result;
  return result;
end $$;
revoke all on function public.admin_save_chain_mix(jsonb) from public,anon;
grant execute on function public.admin_save_chain_mix(jsonb) to authenticated;
revoke all on function public.tool_configure_chain_mix() from public,anon,authenticated;
revoke all on function public.humor_begin_chain_generation(uuid,text,text,text,text),public.humor_record_chain_step(uuid,integer,text,text,text,integer,integer,integer) from public,anon;
grant execute on function public.humor_begin_chain_generation(uuid,text,text,text,text),public.humor_record_chain_step(uuid,integer,text,text,text,integer,integer,integer) to authenticated;
commit;
