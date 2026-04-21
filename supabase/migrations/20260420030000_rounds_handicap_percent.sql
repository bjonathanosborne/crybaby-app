-- ============================================================
-- Per-round handicap percentage (PR #17 commit 2).
--
-- Promotes handicap-scaling from the buried
-- `course_details.mechanicSettings.pops.handicapPercent` location
-- (only visible when the `pops` mechanic was enabled) to a
-- first-class round-level setting visible for every DOC + Flip
-- round regardless of mechanics.
--
-- Legacy rounds predating this column stay readable: the
-- client-side `resolveHandicapPercent` helper reads
--    1. rounds.handicap_percent (new authoritative)
--    2. course_details.mechanicSettings.pops.handicapPercent (legacy)
--    3. 100 (default)
-- so replay equivalence is preserved without a data migration.
--
-- CHECK enforces the UI invariants (50-100 inclusive, 5%% steps)
-- at the DB boundary. NULL is explicitly allowed — distinguishes
-- a legacy round from a new-world round that happens to be at
-- 100% (both read as 100% via resolveHandicapPercent, but the
-- NULL lets us tell them apart in audit tooling).
-- ============================================================

-- 1. Add the column (idempotent).
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS handicap_percent INTEGER;

-- 2. Drop any pre-existing constraint with the same name so the
--    migration re-runs cleanly after a partial apply.
ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS handicap_percent_range;

-- 3. Add the range + step-of-5 CHECK.
ALTER TABLE public.rounds
  ADD CONSTRAINT handicap_percent_range CHECK (
    handicap_percent IS NULL OR (
      handicap_percent >= 50 AND
      handicap_percent <= 100 AND
      handicap_percent % 5 = 0
    )
  );

COMMENT ON COLUMN public.rounds.handicap_percent IS
  'Per-round handicap scale factor. NULL = legacy round (resolve via course_details.mechanicSettings.pops.handicapPercent → 100). 50-100 inclusive in 5%% steps.';

COMMENT ON CONSTRAINT handicap_percent_range ON public.rounds IS
  'Enforces UI-level invariants: range 50-100, 5%% increments. Added 2026-04-20 with PR #17 commit 2 handicap percentage slider.';

-- 4. Tracker row — idempotent via ON CONFLICT. The `statements` array is
--    empty because the reconcile migration pattern (see
--    20260420000000_reconcile_schema_migrations_tracker.sql) documented
--    that field as opaque/optional-for-tracker-purposes — the live DDL
--    is the source of truth.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260420030000', 'rounds_handicap_percent', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
