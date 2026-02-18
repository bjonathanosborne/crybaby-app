
-- Round events: hole-by-hole play-by-play entries
CREATE TABLE public.round_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  round_player_id UUID REFERENCES public.round_players(id) ON DELETE SET NULL,
  hole_number INTEGER NOT NULL,
  gross_score INTEGER,
  par INTEGER,
  event_type TEXT NOT NULL DEFAULT 'score', -- score, birdie, eagle, bogey, double_bogey, triple_plus, hammer, push, team_win
  event_data JSONB DEFAULT '{}'::jsonb, -- extra context (team names, amounts, quips, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Reactions on round events (emoji reactions from spectators/players)
CREATE TABLE public.round_event_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.round_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT '🔥',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id) -- one reaction per user per event
);

-- Indexes
CREATE INDEX idx_round_events_round ON public.round_events(round_id, hole_number);
CREATE INDEX idx_round_event_reactions_event ON public.round_event_reactions(event_id);

-- RLS on round_events
ALTER TABLE public.round_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View round events" ON public.round_events FOR SELECT
  USING (
    is_round_participant(auth.uid(), round_id)
    OR EXISTS (
      SELECT 1 FROM rounds r 
      WHERE r.id = round_events.round_id AND r.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM rounds r
      JOIN group_members gm ON gm.group_id = r.group_id
      WHERE r.id = round_events.round_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Create round events" ON public.round_events FOR INSERT
  WITH CHECK (
    is_round_participant(auth.uid(), round_id)
    OR EXISTS (
      SELECT 1 FROM rounds r WHERE r.id = round_events.round_id AND r.created_by = auth.uid()
    )
  );

-- RLS on round_event_reactions
ALTER TABLE public.round_event_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View event reactions" ON public.round_event_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM round_events re WHERE re.id = round_event_reactions.event_id
      AND (
        is_round_participant(auth.uid(), re.round_id)
        OR EXISTS (SELECT 1 FROM rounds r WHERE r.id = re.round_id AND r.created_by = auth.uid())
        OR EXISTS (
          SELECT 1 FROM rounds r JOIN group_members gm ON gm.group_id = r.group_id
          WHERE r.id = re.round_id AND gm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Add event reactions" ON public.round_event_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Remove event reactions" ON public.round_event_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Enable realtime for live feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_event_reactions;
