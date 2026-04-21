-- ============================================================
-- Handicap UI polish: format constraint on profiles.ghin
--
-- The column has existed since the bootstrap migration
-- (20260217062941_..., profiles.ghin TEXT) and is already
-- populated via AuthPage signup + ProfilePage edit. No new
-- column here — we reuse the existing one per recon finding
-- 2026-04-20 Option C.
--
-- Invariant: GHIN numbers are 6-8 digits (no spaces, no
-- hyphens, no letters). Anything else is either malformed
-- stray data or a placeholder left over from early seed. The
-- CHECK constraint below enforces this going forward while
-- allowing NULL (the "not yet set" state).
--
-- Safety: step 1 nulls out any existing non-conforming values
-- so the subsequent ALTER cannot fail on live data. This is
-- belt-and-suspenders — the only writers today are the two
-- code paths above, and both already strip non-digits on
-- input — but the migration stays robust against any legacy
-- row that slipped through before that filtering landed.
-- ============================================================

-- 1. Scrub any existing malformed values → NULL (idempotent:
--    once scrubbed, re-running finds nothing to update).
UPDATE public.profiles
SET ghin = NULL
WHERE ghin IS NOT NULL
  AND ghin !~ '^\d{6,8}$';

-- 2. Drop any pre-existing constraint with this name so the
--    migration is re-runnable without error.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ghin_format_check;

-- 3. Add the format CHECK. NULL is allowed (not-yet-set).
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ghin_format_check
  CHECK (ghin IS NULL OR ghin ~ '^\d{6,8}$');

COMMENT ON CONSTRAINT profiles_ghin_format_check ON public.profiles IS
  'GHIN numbers are 6-8 digits. NULL allowed for not-yet-set. Added 2026-04-20 during handicap UI polish.';
