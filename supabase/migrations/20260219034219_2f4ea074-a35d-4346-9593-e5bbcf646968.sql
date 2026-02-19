
-- Update round_events SELECT policy to include followers
DROP POLICY "View round events" ON public.round_events;

CREATE POLICY "View round events"
ON public.round_events
FOR SELECT
USING (
  is_round_participant(auth.uid(), round_id)
  OR EXISTS (SELECT 1 FROM rounds r WHERE r.id = round_events.round_id AND r.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM rounds r JOIN group_members gm ON gm.group_id = r.group_id WHERE r.id = round_events.round_id AND gm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM round_followers rf WHERE rf.round_id = round_events.round_id AND rf.user_id = auth.uid() AND rf.status = 'following')
);

-- Also update rounds SELECT policy so followers can view the round
DROP POLICY "View rounds" ON public.rounds;

CREATE POLICY "View rounds"
ON public.rounds
FOR SELECT
USING (
  created_by = auth.uid()
  OR is_round_participant(auth.uid(), id)
  OR EXISTS (SELECT 1 FROM round_followers rf WHERE rf.round_id = id AND rf.user_id = auth.uid())
  OR (is_broadcast = true AND EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
    AND ((f.user_id_a = auth.uid() AND f.user_id_b = rounds.created_by) OR (f.user_id_a = rounds.created_by AND f.user_id_b = auth.uid()))
  ))
);

-- Update round_players SELECT so followers can see player names
DROP POLICY "View round players" ON public.round_players;

CREATE POLICY "View round players"
ON public.round_players
FOR SELECT
USING (
  is_round_participant(auth.uid(), round_id)
  OR EXISTS (SELECT 1 FROM rounds WHERE rounds.id = round_players.round_id AND rounds.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM round_followers rf WHERE rf.round_id = round_players.round_id AND rf.user_id = auth.uid() AND rf.status = 'following')
  OR EXISTS (
    SELECT 1 FROM rounds r
    WHERE r.id = round_players.round_id AND r.is_broadcast = true
    AND EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
      AND ((f.user_id_a = auth.uid() AND f.user_id_b = r.created_by) OR (f.user_id_a = r.created_by AND f.user_id_b = auth.uid()))
    )
  )
);
