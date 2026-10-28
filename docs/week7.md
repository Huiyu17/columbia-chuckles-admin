# Week 7 delivery and deployment

The existing Week 6 users, captions (AI media), votes and dashboard remain available.
The sidebar adds `/manage/` pages for all Week 7 resources. Each page searches
the whole database table, shows 25 records per page, and expands full record fields.
Editable resources have schema-derived forms, database validation, pending feedback,
and a two-step delete confirmation. Image upload validates signatures and a 3 MB limit,
with a 4 MB Server Action request limit for multipart overhead. Full records include
links to related users, images, prompt chains, models, requests and responses.
Deleting image metadata keeps the storage object; an explicit database check prevents
image deletion from cascading into captions and votes in the Week 6 schema.

## Database setup

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

- Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:db`,
  and `npm run test:pipeline` (with the sibling main app repository present).
  The database suite runs 103 checks against in-memory PostgreSQL (PGlite), using a
  minimal Week 6 fixture and the actual 008/012/013 migrations. It checks repeatability,
  anonymous/member access denial, CRUD, read-only restrictions, mix validation,
  search, pagination, preservation of captions/votes on attempted image deletion,
  generation lifecycle, owner isolation, mix routing and idempotent completion.
  It never connects to hosted Supabase; OAuth and Storage need the manual checks below.
- With `npm start` running, run `npm run test:auth` to check all 16 main/admin routes
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
