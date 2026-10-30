-- Run after 013 in the shared caption/admin Supabase project.
-- Adds a real alternative, compatible with the existing single-call engine.
begin;

insert into public.prompt_chains(id, name, description)
values ('70000000-0000-4000-8000-000000000004', 'Inner monologue caption',
  'Write the caption as a short imagined inner thought grounded in the photo and user scene.')
on conflict(id) do nothing;

insert into public.prompt_chain_steps(id, prompt_chain_id, step_order, llm_model_id, prompt)
values ('70000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000004', 0, null,
  'Write one short imagined inner thought the pictured character could plausibly convey in this scene. Connect a visible detail or reaction to the user scene, follow the selected humor style, and end with one unexpected comic turn. This is fictional meme dialogue, not a claim about a real person''s thoughts. Avoid narrating the photo or merely restating the scene. Return only the finished caption, without quotation marks.')
on conflict(prompt_chain_id, step_order) do nothing;

insert into public.prompt_chain_mix(prompt_chain_id, weight, enabled)
values ('70000000-0000-4000-8000-000000000004', 1, true)
on conflict(prompt_chain_id) do nothing;

commit;
