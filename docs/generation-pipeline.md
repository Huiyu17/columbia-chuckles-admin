# Caption generation → admin observability

## Rollout

1. Confirm both apps use the same Supabase project.
2. In that project's SQL Editor, run `supabase/013_generation_pipeline.sql` after
   migration 012. It is also copied into the main app's `supabase/` directory;
   run either copy once. It adds two owner-checked RPCs and seeds one active,
   single-step caption pipeline. Re-running it preserves edited mix values.
3. Deploy the updated main app (`app/actions/generate.ts` and
   `lib/generation-pipeline.ts`) and admin app. Apply the migration **before**
   switching the main app; an older main app remains compatible with the migration.
   The new main app returns an explicit setup error instead of spending an AI call
   with missing tracking functions.

The migration has been tested locally. Applying it to hosted Supabase and deploying
Vercel require the corresponding connected account; changing local source files
does not change those remote services.

## Actual flow

1. Existing login, image ownership, photo validation and recent-caption checks run.
2. `humor_begin_generation` selects an enabled positive-weight chain, resolves its
   Google model, appends the step's instruction to the base caption prompt and saves
   a `running` request. Exact prompt/model snapshots remain with that request.
3. The server action calls Gemini with the returned prompt/model. It measures model
   latency and reads actual input/output usage from the SDK when available.
4. `humor_finish_generation` saves the LLM response and creates the private preview
   in `generations` in the same transaction, linking the request to that generation.
   The request becomes `completed`. Provider or caption-validation failures become
   `failed` with a sanitized error and no draft. Provider output is retained up to
   20,000 characters for diagnostics; image bytes and API keys are never logged.
5. The existing Publish action publishes that saved draft. Generation logging occurs
   even if the user never clicks Publish. API disconnects/process termination can
   leave requests `running`; these remain visible rather than being marked successful.

An explicit model on the selected step overrides the environment default. A null
model uses `GEMINI_MODEL` (or the existing default); register that model under Google
in the admin LLM models page if it differs from the seeded default. Normal users
cannot register models through generation. Only Google models and a single
step per chain are supported; invalid configurations stop before the provider call.
Requests/responses cannot be read directly by normal users. Completion is bound to
the request owner, locks the request, and is safe to retry without duplicate drafts.
Like the existing generations table, records submitted through owner RPCs are
application telemetry, not cryptographic proof of a provider response.

## Website acceptance

1. In admin, open Prompt chains: `Grounded campus caption` should exist. Follow
   View chain steps and View chain mix. Its mix should be enabled with weight 1.
2. In the main app, generate a preview with a distinctive scene such as
   `week7 trace check: waiting outside the library`. Publishing is optional here.
3. Refresh admin Generation requests and search `week7 trace check`. Open the
   full record: check the user, image, selected chain, rendered prompt, model and
   `completed` status. The linked `generation_id` identifies the saved preview.
4. Click View LLM responses: check the actual response, prompt, model, step,
   latency, and usage. Missing provider token counts display null, not invented 0.
5. Publish in the main app. Find the caption under AI media; its detail page now
   has a Generation trace link back to this request/response.
6. If a real provider failure occurs, the request should become `failed`, with
   a linked sanitized error and no published caption. Automated tests simulate
   failures without deliberately consuming API quota or breaking live credentials.
7. To test routing, record the original mix values, disable the only active chain
   and attempt generation: no AI call should occur and a configuration error should
   appear. Re-enable it immediately. Weight 0 also excludes a chain. With multiple
   enabled chains, positive weights control selection proportions.

Do not expect old captions to create new trace rows. Terms, examples, signup domains
and whitelisted emails are independent CRUD resources and still need separate checks.
