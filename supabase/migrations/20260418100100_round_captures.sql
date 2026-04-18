-- ============================================================
-- round_captures — append-only audit log of photo captures
--
-- Phase 2 photo-capture feature. Every capture tap writes one row here
-- with raw and confirmed extraction JSONB, per-cell confidence, and
-- application/feed-publish timestamps. Rows are never mutated in place
-- once applied (superseded_by links to the newer row). Photo files
-- live in the scorecards bucket; photo_path is the storage key.
--
-- Assumes is_round_scorekeeper and is_round_viewer helpers from the
-- scorecards bucket migration.
-- ============================================================

CREATE TABLE public.round_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  captured_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger TEXT NOT NULL CHECK (trigger IN ('game_driven', 'ad_hoc', 'post_round_correction')),

  -- Storage
  photo_path TEXT,              -- null until the client finishes uploading to scorecards bucket
  photo_deleted_at TIMESTAMPTZ, -- set by the 30-day purge job; metadata is retained

  -- Extraction
  raw_extraction JSONB NOT NULL DEFAULT '{}'::jsonb,        -- direct model output
  confirmed_extraction JSONB,                                -- user-edited final; null until applied
  cell_confidence JSONB DEFAULT '{}'::jsonb,                 -- { player_id: { hole: 0..1 } }

  -- Scope (which holes did this capture cover)
  hole_range_start SMALLINT,
  hole_range_end SMALLINT,

  -- Lifecycle
  applied_at TIMESTAMPTZ,              -- null = captured but not yet applied to round state
  superseded_by UUID REFERENCES public.round_captures(id),

  -- Feed
  feed_published_at TIMESTAMPTZ,       -- null = not on the feed (debounced, private, or opt-out)
  share_to_feed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_round_captures_round_captured
  ON public.round_captures(round_id, captured_at DESC);

CREATE INDEX idx_round_captures_round_applied
  ON public.round_captures(round_id, applied_at DESC)
  WHERE applied_at IS NOT NULL;

-- Realtime: the feed subscribes to INSERT/UPDATE on round_captures so the
-- live-round view can render "capture in progress" indicators.
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_captures;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.round_captures ENABLE ROW LEVEL SECURITY;

-- INSERT: only the round's scorekeeper. This is the core authorization
-- rule for the capture flow.
CREATE POLICY "Scorekeepers can create captures"
ON public.round_captures FOR INSERT TO authenticated
WITH CHECK (
  captured_by = auth.uid()
  AND public.is_round_scorekeeper(auth.uid(), round_id)
);

-- SELECT: any viewer of the round (participant, creator, follower,
-- broadcast friend). Matches the scope of round_events.
CREATE POLICY "Round viewers can read captures"
ON public.round_captures FOR SELECT TO authenticated
USING (
  public.is_round_viewer(auth.uid(), round_id)
);

-- UPDATE: the user who created the capture can edit until applied
-- (the confirm step writes confirmed_extraction). The apply-capture
-- edge function uses the service role and bypasses this.
CREATE POLICY "Capturer can update own captures"
ON public.round_captures FOR UPDATE TO authenticated
USING (captured_by = auth.uid())
WITH CHECK (captured_by = auth.uid());

-- DELETE: the capturer, or an admin. Used for manual cleanup; the
-- 30-day photo purge job runs as service role and isn't RLS-gated.
CREATE POLICY "Capturer or admin can delete captures"
ON public.round_captures FOR DELETE TO authenticated
USING (
  captured_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);
