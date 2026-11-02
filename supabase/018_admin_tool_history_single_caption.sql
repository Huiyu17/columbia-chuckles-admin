-- After 017. Keeps test outputs unrestricted; validates only public final captions.
begin;
create or replace function public.humor_is_single_caption(p_text text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(length(trim(p_text)) between 1 and 500
    and cardinality(regexp_split_to_array(trim(p_text),'[[:space:]]+'))<=30
    and position(chr(10) in trim(p_text))=0 and position(chr(13) in trim(p_text))=0
    and trim(p_text) !~ '^[[:space:]]*([-*•]|[0-9]+[.)])[[:space:]]',false)
$$;
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
  if p_order+1=jsonb_array_length(req.request->'steps') and nullif(trim(p_error),'') is null
    and not public.humor_is_single_caption(p_response) then
    p_error:='The final step must return one caption: a single line, at most 30 words and 500 characters. Review the last step instruction.';
  end if;
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


create or replace function public.admin_tool_run_history(p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.is_superadmin(),false) then raise exception 'Superadmin required' using errcode='42501'; end if;
  return jsonb_build_object('total',(select count(*) from public.prompt_tool_runs),'rows',coalesce((
    select jsonb_agg(x) from (select * from public.prompt_tool_runs order by created_at desc,id
      limit 25 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*25) x),'[]'::jsonb));
end $$;
create or replace function public.humor_publish_preview(p_generation_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare draft public.generations%rowtype; caption_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to publish' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_generation_id::text,0));
  select * into draft from public.generations where id=p_generation_id and user_id=auth.uid();
  if not found or draft.generated_content is null or draft.withdrawn_at is not null then raise exception 'Preview unavailable' using errcode='42501'; end if;
  select id into caption_id from public.captions where generation_id=draft.id order by created_at limit 1;
  if caption_id is not null then return caption_id; end if;
  if not public.humor_is_single_caption(draft.generated_content) then raise exception 'Only a single short caption can be published' using errcode='22023'; end if;
  if not exists(select 1 from public.images where id=draft.image_id and (user_id is null or user_id=auth.uid())) then raise exception 'Photo unavailable' using errcode='42501'; end if;
  insert into public.captions(image_id,content,generation_id) values(draft.image_id,draft.generated_content,draft.id) returning id into caption_id;
  return caption_id;
end $$;
revoke all on function public.humor_publish_preview(uuid) from public,anon;
grant execute on function public.humor_publish_preview(uuid) to authenticated;
revoke all on function public.admin_tool_run_history(integer) from public,anon;
grant execute on function public.admin_tool_run_history(integer) to authenticated;
revoke all on function public.humor_is_single_caption(text) from public,anon;
grant execute on function public.humor_is_single_caption(text) to authenticated;
commit;
