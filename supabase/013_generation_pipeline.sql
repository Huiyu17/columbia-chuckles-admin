-- Run after 012 in the shared caption/admin Supabase project.
-- Connects real caption generation to the Week 7 admin readers.
-- No historical requests/responses are fabricated or backfilled.
begin;

alter table public.generation_requests
  add column if not exists image_id uuid references public.images(id);
alter table public.llm_responses
  add column if not exists prompt_chain_step_id uuid references public.prompt_chain_steps(id),
  add column if not exists prompt text;
create index if not exists generation_requests_user_created_idx
  on public.generation_requests(user_id, created_at desc);
create index if not exists llm_responses_request_idx
  on public.llm_responses(generation_request_id);

-- A real, single-step pipeline used by the caption app. Re-running the migration
-- preserves admin changes to its mix/model/prompt rather than resetting them.
insert into public.llm_providers(name) values ('Google') on conflict(name) do nothing;
insert into public.llm_models(provider_id,name)
  select id,'gemini-3.5-flash-lite' from public.llm_providers where name='Google'
  on conflict(provider_id,name) do nothing;
insert into public.prompt_chains(id,name,description)
  values ('70000000-0000-4000-8000-000000000001','Grounded campus caption',
    'Single model call. Shared visual/style rules plus the step instruction; the exact rendered prompt is recorded per request.')
  on conflict(id) do nothing;
insert into public.prompt_chain_steps(id,prompt_chain_id,step_order,llm_model_id,prompt)
  values ('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',0,
    null, 'Write the finished caption using the photo, scene and selected humor style. Give it one specific comic turn and return only the caption.')
  on conflict(prompt_chain_id,step_order) do nothing;
-- A null step model means the app's GEMINI_MODEL, which must already be
-- registered by an admin. Members cannot create model configuration via RPC.
insert into public.prompt_chain_mix(prompt_chain_id,weight,enabled)
  values ('70000000-0000-4000-8000-000000000001',1,true)
  on conflict(prompt_chain_id) do nothing;

create or replace function public.humor_begin_generation(
  p_image_id uuid, p_context text, p_style text, p_base_prompt text, p_default_model text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid(); selected_chain uuid; selected_step public.prompt_chain_steps;
  selected_model public.llm_models; provider uuid; request_id uuid; rendered text;
begin
  if viewer is null or not exists(select 1 from public.profiles where id=viewer) then
    raise exception 'Sign in to generate' using errcode='42501';
  end if;
  if p_image_id is null or length(trim(coalesce(p_context,''))) not between 5 and 500
    or p_style is null or p_style not in ('relatable','deadpan','absurd')
    or length(coalesce(p_base_prompt,'')) not between 1 and 20000
    or length(trim(coalesce(p_default_model,''))) not between 1 and 200 then
    raise exception 'Invalid generation input' using errcode='22023';
  end if;
  if not exists(select 1 from public.images where id=p_image_id and (user_id is null or user_id=viewer)) then
    raise exception 'Choose a preset or your own photo' using errcode='42501';
  end if;
  -- An exponential race selects chains proportionally to their positive weights.
  -- The current app executes one model call; multi-step/unsupported-provider
  -- chains are rejected, not silently reduced to a different pipeline.
  select m.prompt_chain_id into selected_chain from public.prompt_chain_mix m
    where m.enabled and m.weight>0
    order by -ln(greatest(random(),0.000000000001))/m.weight limit 1;
  if selected_chain is null then raise exception 'No enabled prompt chain with positive weight' using errcode='22023'; end if;
  if (select count(*) from public.prompt_chain_steps where prompt_chain_id=selected_chain)<>1 then
    raise exception 'Caption generation requires a single-step prompt chain' using errcode='22023';
  end if;
  select * into selected_step from public.prompt_chain_steps where prompt_chain_id=selected_chain;
  if selected_step.llm_model_id is null then
    select id into provider from public.llm_providers where name='Google';
    if provider is null then raise exception 'Google provider is missing' using errcode='22023'; end if;
    select * into selected_model from public.llm_models where provider_id=provider and name=trim(p_default_model);
  else
    select * into selected_model from public.llm_models where id=selected_step.llm_model_id;
  end if;
  if selected_model.id is null or not exists(select 1 from public.llm_providers where id=selected_model.provider_id and name='Google') then
    raise exception 'This caption pipeline supports Google models only' using errcode='22023';
  end if;
  rendered := p_base_prompt || E'\n\nPipeline step instruction:\n' || selected_step.prompt;
  if length(rendered)>30000 then raise exception 'Prompt is too long' using errcode='22023'; end if;
  insert into public.generation_requests(user_id,image_id,prompt_chain_id,status,request)
    values (viewer,p_image_id,selected_chain,'running',jsonb_build_object(
      'context',trim(p_context),'style',p_style,'prompt',rendered,
      'prompt_chain_step_id',selected_step.id,'llm_model_id',selected_model.id,
      'model',selected_model.name,'source','caption-app')) returning id into request_id;
  return jsonb_build_object('request_id',request_id,'prompt',rendered,'model',selected_model.name);
end $$;

create or replace function public.humor_finish_generation(
  p_request_id uuid, p_response text, p_error text, p_latency_ms integer,
  p_input_tokens integer default null, p_output_tokens integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare viewer uuid := auth.uid(); req public.generation_requests; draft_id uuid;
begin
  if viewer is null then raise exception 'Sign in to finish generation' using errcode='42501'; end if;
  -- Serialize retries and concurrent completion calls; save response + draft +
  -- request status atomically, so a response cannot point at a missing draft.
  select * into req from public.generation_requests where id=p_request_id and user_id=viewer for update;
  if req.id is null then raise exception 'Generation request unavailable' using errcode='42501'; end if;
  if req.status in ('completed','failed') then return req.generation_id; end if;
  if req.status<>'running' or req.request->>'source' is distinct from 'caption-app' then
    raise exception 'Invalid request state' using errcode='22023';
  end if;
  if p_latency_ms is null or p_latency_ms<0 or p_input_tokens<0 or p_output_tokens<0
    or length(coalesce(p_response,''))>20000 or length(coalesce(p_error,''))>2000 then
    raise exception 'Invalid response metadata' using errcode='22023';
  end if;
  if nullif(trim(p_error),'') is null and (
    length(trim(coalesce(p_response,''))) not between 1 and 500
    or cardinality(regexp_split_to_array(trim(p_response),E'\\s+'))>30
  ) then raise exception 'Invalid caption' using errcode='22023'; end if;
  insert into public.llm_responses(generation_request_id,llm_model_id,prompt_chain_step_id,
    prompt,response,error,latency_ms,input_tokens,output_tokens)
    values (req.id,(req.request->>'llm_model_id')::uuid,(req.request->>'prompt_chain_step_id')::uuid,
      req.request->>'prompt',p_response,nullif(trim(p_error),''),p_latency_ms,p_input_tokens,p_output_tokens);
  if nullif(trim(p_error),'') is null then
    insert into public.generations(user_id,image_id,user_input,prompt,model,generated_content)
      values (viewer,req.image_id,req.request->>'context',req.request->>'prompt',req.request->>'model',trim(p_response))
      returning id into draft_id;
  end if;
  update public.generation_requests set generation_id=draft_id,
    status=case when draft_id is null then 'failed' else 'completed' end where id=req.id;
  return draft_id;
end $$;

revoke all on function public.humor_begin_generation(uuid,text,text,text,text) from public,anon;
revoke all on function public.humor_finish_generation(uuid,text,text,integer,integer,integer) from public,anon;
grant execute on function public.humor_begin_generation(uuid,text,text,text,text),
  public.humor_finish_generation(uuid,text,text,integer,integer,integer) to authenticated;
commit;
