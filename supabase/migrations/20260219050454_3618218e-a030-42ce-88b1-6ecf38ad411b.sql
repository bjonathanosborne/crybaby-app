DROP POLICY IF EXISTS "View rounds" ON public.rounds;

CREATE POLICY "View rounds" ON public.rounds
FOR SELECT
USING (
  (created_by = auth.uid())
  OR is_round_participant(auth.uid(), id)
  OR (EXISTS (
    SELECT 1 FROM round_followers rf
    WHERE rf.round_id = rounds.id AND rf.user_id = auth.uid()
  ))
  OR (
    is_broadcast = true
    AND EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id_a = auth.uid() AND f.user_id_b = rounds.created_by)
          OR (f.user_id_a = rounds.created_by AND f.user_id_b = auth.uid())
        )
    )
  )
);