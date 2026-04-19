-- ============================================================
-- Hammer capture support on round_captures.
--
-- Adds two JSONB columns (raw + confirmed) to carry the rich
-- per-hole hammer-event sequence produced by the 2.5c prompt.
-- Shape:
--   { "byHole": { "<hole>": { "events": [...], "scoredOut": bool } } }
--
-- Also broadens the trigger CHECK constraint to include
-- 'hammer_correction' (retro-fix hammer state without re-capturing
-- scores) and 'birdie_correction' (retro-fix birdie detection).
-- ============================================================

ALTER TABLE public.round_captures
  ADD COLUMN hammer_state JSONB DEFAULT NULL,
  ADD COLUMN confirmed_hammer_state JSONB DEFAULT NULL;

-- Drop the old trigger CHECK and re-add with the two new values.
-- The constraint was added anonymously in the 20260418100100 migration;
-- its name follows Postgres's default pattern.
ALTER TABLE public.round_captures
  DROP CONSTRAINT IF EXISTS round_captures_trigger_check;

ALTER TABLE public.round_captures
  ADD CONSTRAINT round_captures_trigger_check CHECK (
    trigger IN (
      'game_driven',
      'ad_hoc',
      'post_round_correction',
      'hammer_correction',
      'birdie_correction'
    )
  );

COMMENT ON COLUMN public.round_captures.hammer_state IS
  'Raw hammer state submitted with the capture: { byHole: { <hole>: { events, scoredOut } } }. See supabase/functions/_shared/hammerTypes.ts.';

COMMENT ON COLUMN public.round_captures.confirmed_hammer_state IS
  'Post-confirm hammer state written by apply-capture. Same shape as hammer_state.';
