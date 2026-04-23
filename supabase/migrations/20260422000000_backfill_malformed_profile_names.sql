-- ============================================================
-- Backfill malformed profile names (PR #23 D1).
--
-- The `require_name_ghin` migration (20260415000000) added the
-- `profile_completed` flag gated on non-empty first_name +
-- last_name + ghin. But "non-empty" accepted single-letter names
-- ("T" / "B") that satisfied the flag without producing useful
-- search-matchable profiles.
--
-- Jonathan's 2026-04-22 on-course bug: searching "Todd Bailey"
-- returned zero matches because Todd's profile stored
-- first_name="T", last_name="B", display_name="T B". Invisible to
-- the search RPC's substring match. Scorekeeper fell through to
-- manual entry → null userId → cascade of downstream bugs.
--
-- This migration tightens the server-side gate to match the new
-- client-side validation (src/lib/profileNameValidation.ts):
--
--   - Both first_name and last_name must be >= 2 chars after trim
--   - Trim leading/trailing whitespace while we're here (fixes
--     accidental " T " that counted as length 3 in code but reads
--     as "T" to a human searching).
--
-- Rows that now fail the gate get profile_completed=false so the
-- existing ProfileGate wrapper in App.tsx redirects the user to
-- ProfileCompletionPage on next login. They'll re-enter their
-- name + ghin with the stricter UI in place.
--
-- Idempotent: re-running is a no-op if every profile already
-- complies.
-- ============================================================

-- Step 1: trim whitespace (fixes " T " → "T", " John " → "John").
-- Done BEFORE the length check so that a 1-char trimmed name is
-- correctly flagged on step 2 even if the DB stored padding.
UPDATE public.profiles
SET
  first_name = TRIM(COALESCE(first_name, '')),
  last_name = TRIM(COALESCE(last_name, ''))
WHERE
  first_name IS NOT NULL AND first_name != TRIM(first_name)
  OR last_name IS NOT NULL AND last_name != TRIM(last_name);

-- Step 2: flip profile_completed → false where either name fails
-- the >= 2 char rule. Only touches rows that are currently true
-- but no longer comply — preserves correctly-completed profiles
-- untouched.
UPDATE public.profiles
SET profile_completed = false
WHERE profile_completed = true
  AND (
    COALESCE(char_length(TRIM(first_name)), 0) < 2
    OR COALESCE(char_length(TRIM(last_name)), 0) < 2
  );

COMMENT ON COLUMN public.profiles.profile_completed IS
  'True when the user has filled first_name (>=2 chars), last_name (>=2 chars), and ghin. Single-letter names are rejected as of 2026-04-22 (PR #23 D1) — the ProfileGate wrapper in App.tsx redirects incomplete profiles to /complete-profile on next login.';

-- Step 3: tracker row — idempotent via ON CONFLICT.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260422000000', 'backfill_malformed_profile_names', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
