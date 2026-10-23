# Columbia Chuckles · Backstage (Week 6 admin panel)

Superadmin-only admin area for the [Columbia Chuckles](../the-humor-project) caption app.
Separate repository and separate Vercel project, same Supabase database.

| Requirement | Where |
| --- | --- |
| Interesting statistics | `/` **Laugh report** — laugh rate, 30-day comedy calendar, weekday × hour heatmap, humor-style showdown, Wilson-ranked hall of fame, most divisive captions, sample vs uploaded photos, caption-length sweet spot, draft→publish funnel, top creators, most captioned photo |
| READ users/profiles | `/users` (search, filter admins, sort) and `/users/[id]` (profile, captions, votes cast, drafts) |
| CREATE AI media | `/media/new` — pick a photo, **Draft with Gemini**, edit, publish (prompt + model recorded) |
| READ AI media | `/media` (live + withdrawn tabs, search, filters, sort) and `/media/[id]` (provenance, full prompt, voters) |
| UPDATE AI media | `/media/[id]` — edit caption text and/or reassign its photo |
| DELETE AI media | Two steps: **Remove** on live captions (reversible, votes kept), then **Delete permanently** from the Removed / Author's Trash tabs (`supabase/011_admin_soft_remove.sql`) |
| Restore (feedback) | **↺ Restore** on the Removed and Author's Trash tabs and the detail page (`supabase/010_trash_and_restore.sql`, `011`). Authors can restore their own Trash, but never an admin removal. |
| READ votes/ratings | `/votes` (every vote, filters, most active voters, toughest crowd) plus per-caption and per-user vote lists |

## Security: three layers

1. **`proxy.ts`** runs on every route (pages, Server Action POSTs, route handlers). No session → `/login`.
   Session but `is_superadmin()` ≠ true → `/denied`. Only `/login` and `/auth/callback` are public.
2. **Every page and Server Action** calls `requireAdmin()` / `adminForAction()` again (the proxy alone is
   not enough — see the Next.js Proxy docs).
3. **Postgres** (`supabase/008_admin_panel.sql`): admin reads go through RLS policies that call
   `public.is_superadmin()`; every admin write is a `SECURITY DEFINER` function that re-checks
   `is_superadmin()` itself. A bug in this app still cannot let a normal user read or change anything.

Users cannot make themselves admin: the `authenticated` role only has column-level UPDATE on
`first_name, last_name, avatar_url, updated_at`, and no INSERT on `profiles`.

## "Won't I lock myself out?" — the bootstrap answer

Yes, if the only way to become an admin were through the admin app. So the first superadmin is granted
**out-of-band, with the database-owner access we already have**: the Supabase **SQL Editor** runs as the
`postgres` role, which is not subject to RLS or to the app's login wall. Sign in once with Google (so a
`profiles` row exists), then run `supabase/009_bootstrap_superadmin.sql` with your email. Promotion is
deliberately not available inside the app, so there is no in-app privilege-escalation path.

## Setup

1. **Database** — in the Supabase SQL Editor run `supabase/008_admin_panel.sql` (idempotent; expect
   6 DEFINER functions in the final result), then `supabase/009_bootstrap_superadmin.sql` with your email,
   then `supabase/010_trash_and_restore.sql` (expect 4 DEFINER functions),
   then `supabase/011_admin_soft_remove.sql` (expect 6 DEFINER functions). Run them in order;
   re-running 008 or 010 after 011 fails and rolls back harmlessly.
2. **Env** — copy `.env.example` to `.env.local` and use the same Supabase URL / anon key as the main
   app. `GEMINI_API_KEY` is optional (without it, captions can still be written manually).
3. **Run** — `npm install`, `npm run dev` (port 3001), then `npm run lint`, `npm run typecheck`, `npm run build`.
4. **Supabase → Authentication → URL Configuration → Redirect URLs**, add:
   - `http://localhost:3001/**`
   - `https://columbia-chuckles-admin*.vercel.app/**` (covers production and commit-specific URLs;
     adjust the prefix to your Vercel project name)
   If a redirect URL is missing, Supabase silently falls back to the **main app's** Site URL and sign-in fails.
5. **Vercel** — new project from this repo; set the env vars; Settings → Deployment Protection →
   disable Vercel Authentication so the login wall is the app's own (test in Incognito).

## Tests

- `scripts/admin-db-test.sql` — 41 checks on a throwaway local PostgreSQL 16 database rebuilt from
  the main project's migrations 001–007 plus 008 (applied twice): non-admins and anon are denied every
  admin function, cannot self-promote, still see only their own rows; admins read everything, create /
  update / delete captions; deletion removes votes despite the Week 3 vote-owner trigger, re-enables
  that trigger, marks the source generation withdrawn and blocks a stale re-publish; Explore still hides
  withdrawn captions for admins. Run (from the parent folder containing both repos):
  `createdb humor_admin_test && psql -v ON_ERROR_STOP=1 -d humor_admin_test -f scripts/admin-db-test.sql`
  from this repo's root. (Now also applies 010 and 011.)
- `scripts/trash-db-test.sql` — 28 checks for the author Trash / Restore flow (010, with 011 applied).
- `scripts/removal-db-test.sql` — 42 checks for admin Remove → Restore / permanent Delete (011),
  including that an author can't restore, re-publish or relabel a moderator removal.

## Notes

- **Remove** is a soft delete: the caption and its votes are kept and can be restored by an admin.
  **Delete permanently** (only for hidden captions) erases the caption and its votes; the source
  photo and generation record stay (the generation is marked withdrawn so the author's Publish
  retry can't resurrect it).
- Captions authors withdrew in *My humor* stay hidden from everyone, admins included, except through
  `admin_list_withdrawn_captions()` on the **Withdrawn** tab.
- Times shown in New York time. Charts use an orange/blue pair validated for colour-vision deficiency,
  always with labels and tooltips.
