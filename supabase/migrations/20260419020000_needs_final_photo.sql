-- ============================================================
-- Pre-completion final-capture gate.
--
-- Bug 2 of the round-completion flow fixes. Before
-- completeRound() runs on hole 18 we show a gate asking the
-- scorekeeper for a full-scorecard photo (holeRange [1, 18],
-- trigger = 'ad_hoc'). If they skip, we still complete the
-- round but flag it so the completed-round view can prompt
-- for the photo later (Bug 3).
--
-- Default: false. Only flips true when the user presses "Skip
-- photo" on the gate. A subsequent successful post-round
-- capture (or the Take-photo path on the gate itself) clears
-- the flag.
-- ============================================================

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS needs_final_photo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rounds.needs_final_photo IS
  'Set to true when the scorekeeper skipped the pre-completion photo gate. The completed-round view shows a "Fix scores / add photo" CTA while this is true. Cleared when a post_round_correction capture is applied.';
