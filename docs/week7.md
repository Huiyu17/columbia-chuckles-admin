# Week 7 delivery and deployment

The existing Week 6 users, captions (AI media), votes and dashboard remain available.
The sidebar adds `/manage/` pages for all Week 7 resources. Each page searches
the database table and shows 25 records per page. Standard resource cards display
their complete business content directly, without IDs or an additional details
disclosure. Edit sits in the top-right corner and opens an inline form.
Editable resources have schema-derived forms, database validation, pending feedback,
and a two-step delete confirmation. Image upload validates signatures and a 3 MB limit,
with a 4 MB Server Action request limit for multipart overhead. Full records include
links to related users, images, prompt chains, models, requests and responses.
Related links carry identifiers internally through record/request/chain parameters,
not through the visible search box. Legacy UUID search URLs still resolve to a
selected-entry view without displaying UUIDs as search text. Search prompts use
names, descriptions, scenes and response content; relationship editors use named choices.
Deleting image metadata keeps the storage object; an explicit database check prevents
image deletion from cascading into captions and votes in the Week 6 schema.

Prompt chains is one flow page. Each expandable workflow displays input, ordered
AI instructions and output on the left, with live availability and weight editing
alongside it. Workflow IDs are fixed in this contextual editor. Technical records
remain expandable, and Try this workflow opens Test run. Old step/mix URLs resolve
to the same integrated workspace.
Known relationship fields use searchable name-based dropdowns rather than UUID
text inputs. Options are read through existing admin-authorized APIs; full IDs
remain in mutation payloads and technical details. Choices support pagination,
current-value preservation, nullable selections and image previews.

Test run can preview the assembled production prompt without an AI call, or call
the configured Google model and show its response, latency and token usage.
Configure server-only `GEMINI_API_KEY` in the admin deployment to enable real runs;
keep `GEMINI_MODEL` aligned with the caption app when using the default model.
Tests never publish captions or save requests/responses to user history. They use
the selected image and the current admin's recent caption context. Specific tests
can inspect disabled workflows without changing live selection. Configuration is
rechecked before execution. Ordered multi-step configurations are visible, but
execution rejects them because the production caption engine supports one Google
step per attempt. No database migration is needed for this workspace refinement.

## Database setup

To add the second real chain, run `supabase/014_second_prompt_chain.sql` after
013 in the same shared Supabase project. It adds Inner monologue caption with one
Google/default-model step and an enabled weight of 1. Existing chain settings are
preserved, including disabled or zero weights. With both chains enabled at weight
1, each has a 50% selection chance. No main-app code change is required. Re-running
014 preserves subsequent administrator changes and does not fabricate run history.

1. Verify `.env.local` and both Vercel projects use the same intended Supabase project.
2. On the Week 6 database, apply `supabase/012_week7_observability.sql` after 008–011,
   then `supabase/013_generation_pipeline.sql`,
   using the Supabase SQL Editor. This migration is **not applied automatically**.
3. The migration creates missing Week 7 tables without inserting invented production
   records. Existing tables are preserved; schema-derived forms support their actual
   columns and require a single-column primary key. Verify real table names match
   `lib/resources.ts` before using this on an independently provisioned course database.
4. New resources use admin-checked SECURITY DEFINER RPCs; direct anon/authenticated
   access is revoked, RLS is enabled, and SQL identifiers are allowlisted and quoted.
   No service-role key is sent to the browser. Existing image upload uses the existing
   `caption-images` bucket and its owner-folder policy.

The caption app now calls the authenticated begin/finish RPCs in migration 013.
It records a running request before calling Gemini, executes the selected single-step
chain, and atomically saves the model response, usage, latency and draft. Errors and
rejected output are recorded as failed attempts. Completion retries are idempotent.
The migration seeds one real active pipeline and its Google provider/model; mix weights
and enabled flags affect new generation attempts. A null step model uses `GEMINI_MODEL`
or the app default; that model must already be registered by an admin. Explicit step models must use Google.
Existing historical `generations` stay visible in user/media detail pages; old attempts
are not fabricated or backfilled. See [generation-pipeline.md](generation-pipeline.md)
for rollout and end-to-end acceptance. Additional chains must have exactly one step
because the caption app currently makes one model call per attempt.
Domain/email records are administrative configuration; authentication enforcement in
the caption app is separate and is not changed by this migration.

## Verification

Images uses a thumbnail gallery with description/user-name search and uploader
selection. Each image links to `/media?image=...` for its captions. Editing exposes
description and owner; URL and storage path are omitted from form fields and update
payloads, preserving system-managed file locations. New images use the upload form.

LLM models and providers share `/manage/llm-models`, with both tables visible on
one page. Providers list their registered model counts; models show provider and
actual prompt-chain assignments, resolving null step models against the app default.
Old provider links redirect while preserving selected records and searches.
Each resource retains its CRUD permissions. Recent runs inside each prompt chain
show actual request scenes and profile names with direct request links.

Generation requests now uses a paginated table with chain, model, style,
generation-status and caption-status filters across the fully loaded history.
Rows show image thumbnails, actual profile names/avatars, chain/model and time.
Request details show scene, status, recorded instructions and links to model
responses and the caption in AI media when available. LLM responses sits immediately
below Generation requests in the sidebar. Its focused six-column table shows response,
model, result, usage, time and details, with model/result/search filters. User, photo,
style and publishing context remain on the linked request page. Links preserve exact request IDs; deleted/unpublished captions do not
receive invented media links. Raw database JSON is not exposed. Loading is bounded at 5,000
records per resource and fails explicitly rather than filtering an incomplete set.
Prompt-chain cards split space equally between the flow and recent runs.

- Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:db`,
  and `npm run test:pipeline` (with the sibling main app repository present).
  The database suite runs 104 checks against in-memory PostgreSQL (PGlite), using a
  minimal Week 6 fixture and the actual 008/012/013 migrations. It checks repeatability,
  anonymous/member access denial, CRUD, read-only restrictions, mix validation,
  search, pagination, preservation of captions/votes on attempted image deletion,
  generation lifecycle, owner isolation, mix routing and idempotent completion.
  It never connects to hosted Supabase; OAuth and Storage need the manual checks below.
- Run `npm run test:chains`, `node scripts/resource-summary-test.mjs` and
  `node scripts/resource-editor-test.mjs` for workflow logic and browser regressions.
  AI calls are mocked in automated tests; no hosted data or paid model is used.
- With `npm start` running, run `npm run test:auth` to check all 19 main/admin routes
  redirect anonymous requests to `/login` and the Google login page renders. To check
  a deployed app, run `npm run test:auth -- https://YOUR-DEPLOYMENT.vercel.app`.
- As a superadmin, verify all resource pages, search and next/previous pagination.
- Create/update/delete a temporary term, provider, model, example, domain, and email.
- Verify provider/model/image foreign key errors appear without losing records.
- Change a mix weight; verify a negative weight is rejected.
- Upload a JPEG/PNG/WebP up to 3 MB; verify preview, edit and deletion on an unreferenced image.
- As anon and a normal user, call both RPCs directly and verify permission errors.
- Confirm existing users, media and votes still work.

## Vercel submission

For **each** app, open Vercel → Project → Settings → Deployment Protection and
disable Vercel Authentication for the deployments being submitted. Keep the app's
own login and superadmin checks enabled. Set the production Supabase environment
variables, deploy the latest Git commit, and allow both deployment hosts in Supabase
Authentication → URL Configuration → Redirect URLs.

Test both immutable deployment URLs in Incognito, including Google login and admin
authorization. Submit the two deployment URLs from the deployments associated with
the submitted commits, rather than mutable project aliases. No deployment URLs can
be supplied until those deployments exist. This workspace has no connected Vercel or
Supabase management integration, so remote changes require the account owner.
