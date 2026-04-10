-- Allow rounds to be explicitly canceled by the creator
-- Rounds already survive disconnects (they're written to DB on creation).
-- This adds the explicit "canceled" terminal state, distinct from "completed".

ALTER TABLE public.rounds
  DROP CONSTRAINT rounds_status_check;

ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_status_check
  CHECK (status IN ('setup', 'active', 'completed', 'canceled'));

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
