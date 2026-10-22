-- Bootstrap the first superadmin (answers "won't I be locked out?").
--
-- The admin app only lets in profiles with is_superadmin = true, and no app user
-- can set that column (no client UPDATE/INSERT privilege on it). So the first
-- admin is granted out-of-band, with the database-owner access we already have:
-- the Supabase SQL Editor runs as the `postgres` role and is not subject to RLS
-- or the app's login wall.
--
-- 1. Sign in to the main Columbia Chuckles app (or the admin app) once with
--    Google so auth.users and profiles have a row for you.
-- 2. Replace the email below and run this file in the SQL Editor.
-- 3. Reload the admin app.
update public.profiles p
set is_superadmin = true
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('YOUR_GOOGLE_EMAIL@example.com');

-- Expect exactly one row for you. Zero rows: sign in once first, then re-run.
select u.email, p.is_superadmin
from public.profiles p join auth.users u on u.id = p.id
where p.is_superadmin;

-- To revoke later:
-- update public.profiles set is_superadmin = false where id = '<user uuid>';
