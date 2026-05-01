-- Live-feed comments. Adds a sibling table to round_event_reactions
-- so users (players + creator + spectators following a broadcast
-- round) can leave free-text comments on any feed event.
--
-- Visibility model matches the public.round_events SELECT policy
-- (see migration 20260219054203_...sql) — participants + creator +
-- followers can read. Inserts gated to authenticated users with the
-- same audience. Deletes restricted to the comment author so we
-- don't need a moderation flow yet.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.

CREATE TABLE IF NOT EXISTS public.round_event_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.round_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_event_comments_event
  ON public.round_event_comments(event_id, created_at);

ALTER TABLE public.round_event_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View event comments" ON public.round_event_comments;
DROP POLICY IF EXISTS "Add event comments" ON public.round_event_comments;
DROP POLICY IF EXISTS "Delete own event comments" ON public.round_event_comments;

CREATE POLICY "View event comments" ON public.round_event_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.round_events re
    WHERE re.id = round_event_comments.event_id
      AND (
        public.is_round_participant(auth.uid(), re.round_id)
        OR public.is_round_creator(auth.uid(), re.round_id)
        OR public.is_round_follower(auth.uid(), re.round_id)
      )
  ));

CREATE POLICY "Add event comments" ON public.round_event_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.round_events re
      WHERE re.id = round_event_comments.event_id
        AND (
          public.is_round_participant(auth.uid(), re.round_id)
          OR public.is_round_creator(auth.uid(), re.round_id)
          OR public.is_round_follower(auth.uid(), re.round_id)
        )
    )
  );

CREATE POLICY "Delete own event comments" ON public.round_event_comments FOR DELETE
  USING (user_id = auth.uid());

-- Realtime so the live feed sees comments arrive as they're posted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'round_event_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_event_comments;
  END IF;
END
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260501000000', 'round_event_comments', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;
