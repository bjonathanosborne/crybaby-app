-- ============================================================
-- Flip mode: two-component settlement storage.
--
-- Flip rounds produce a final per-player settlement composed of
-- two pieces: the base game (holes 1-15) and the crybaby sub-game
-- (holes 16-18). The existing `round_settlements.amount` column
-- holds the COMBINED total (so all display surfaces that read
-- `amount` keep working without changes), but for Flip rounds the
-- two components are also stored separately here so audit /
-- history features can answer "how much did this player win in
-- crybaby vs. in the base game".
--
-- Both columns are nullable:
--   - Legacy DOC/Nassau/Solo/Skins rounds never populate them.
--   - Flip rounds before this migration (there are none in prod
--     as of 2026-04-20 — Flip has been hidden since PR #7) also
--     won't backfill.
--   - Per-hole individual-game modes (Skins/Nassau) could adopt
--     the same split for presses + carryovers in the future; the
--     column names are generic enough (base_amount / crybaby_amount)
--     that they're specific to Flip right now but not actively
--     hostile to future use.
--
-- Invariant: for Flip rounds, `amount = base_amount + crybaby_amount`.
-- ============================================================

ALTER TABLE public.round_settlements
  ADD COLUMN IF NOT EXISTS base_amount    NUMERIC,
  ADD COLUMN IF NOT EXISTS crybaby_amount NUMERIC;

COMMENT ON COLUMN public.round_settlements.base_amount IS
  'Flip mode: per-player net from holes 1-15 (base game). NULL for non-Flip rounds.';

COMMENT ON COLUMN public.round_settlements.crybaby_amount IS
  'Flip mode: per-player net from holes 16-18 (crybaby sub-game). NULL for non-Flip rounds.';
