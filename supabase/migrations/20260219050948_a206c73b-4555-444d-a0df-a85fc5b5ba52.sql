-- Create security definer functions to break RLS recursion

CREATE OR REPLACE FUNCTION public.is_round_creator(_user_id uuid, _round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rounds
    WHERE id = _round_id AND created_by = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_round_broadcast_friend(_user_id uuid, _round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rounds r
    JOIN public.friendships f ON f.status = 'accepted'
      AND (
        (f.user_id_a = _user_id AND f.user_id_b = r.created_by)
        OR (f.user_id_a = r.created_by AND f.user_id_b = _user_id)
      )
    WHERE r.id = _round_id AND r.is_broadcast = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_round_follower(_user_id uuid, _round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_followers
    WHERE round_id = _round_id AND user_id = _user_id
  );
$$;

-- Fix rounds View policy using security definer functions
DROP POLICY IF EXISTS "View rounds" ON public.rounds;
CREATE POLICY "View rounds" ON public.rounds
FOR SELECT USING (
  created_by = auth.uid()
  OR is_round_participant(auth.uid(), id)
  OR is_round_follower(auth.uid(), id)
  OR is_round_broadcast_friend(auth.uid(), id)
);

-- Fix round_players policies to use security definer functions instead of subqueries on rounds
DROP POLICY IF EXISTS "Add players" ON public.round_players;
CREATE POLICY "Add players" ON public.round_players
FOR INSERT WITH CHECK (
  is_round_creator(auth.uid(), round_id) OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Remove players" ON public.round_players;
CREATE POLICY "Remove players" ON public.round_players
FOR DELETE USING (
  is_round_creator(auth.uid(), round_id)
);

DROP POLICY IF EXISTS "Update scores" ON public.round_players;
CREATE POLICY "Update scores" ON public.round_players
FOR UPDATE USING (
  user_id = auth.uid() OR is_round_creator(auth.uid(), round_id)
);

DROP POLICY IF EXISTS "View round players" ON public.round_players;
CREATE POLICY "View round players" ON public.round_players
FOR SELECT USING (
  is_round_participant(auth.uid(), round_id)
  OR is_round_creator(auth.uid(), round_id)
  OR is_round_follower(auth.uid(), round_id)
  OR is_round_broadcast_friend(auth.uid(), round_id)
);

-- Fix round_settlements policies
DROP POLICY IF EXISTS "Create settlements" ON public.round_settlements;
CREATE POLICY "Create settlements" ON public.round_settlements
FOR INSERT WITH CHECK (
  is_round_creator(auth.uid(), round_id) OR (is_manual_adjustment = true AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "View own settlements" ON public.round_settlements;
CREATE POLICY "View own settlements" ON public.round_settlements
FOR SELECT USING (
  user_id = auth.uid()
  OR is_round_participant(auth.uid(), round_id)
  OR is_round_creator(auth.uid(), round_id)
);

-- Fix round_events policies
DROP POLICY IF EXISTS "Create round events" ON public.round_events;
CREATE POLICY "Create round events" ON public.round_events
FOR INSERT WITH CHECK (
  is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id)
);

DROP POLICY IF EXISTS "View round events" ON public.round_events;
CREATE POLICY "View round events" ON public.round_events
FOR SELECT USING (
  is_round_participant(auth.uid(), round_id)
  OR is_round_creator(auth.uid(), round_id)
  OR is_round_follower(auth.uid(), round_id)
);

-- Fix round_event_reactions
DROP POLICY IF EXISTS "View event reactions" ON public.round_event_reactions;
CREATE POLICY "View event reactions" ON public.round_event_reactions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM round_events re
    WHERE re.id = round_event_reactions.event_id
      AND (is_round_participant(auth.uid(), re.round_id) OR is_round_creator(auth.uid(), re.round_id))
  )
);

-- Fix round_followers View policy
DROP POLICY IF EXISTS "View round followers" ON public.round_followers;
CREATE POLICY "View round followers" ON public.round_followers
FOR SELECT USING (
  user_id = auth.uid()
  OR is_round_participant(auth.uid(), round_id)
  OR is_round_creator(auth.uid(), round_id)
);

-- Fix posts View policy to not query rounds directly
DROP POLICY IF EXISTS "View posts" ON public.posts;
CREATE POLICY "View posts" ON public.posts
FOR SELECT USING (
  user_id = auth.uid()
  OR (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id))
  OR (round_id IS NOT NULL AND (is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id)))
  OR (group_id IS NULL AND round_id IS NULL)
);

-- Fix comments View policy
DROP POLICY IF EXISTS "View comments" ON public.comments;
CREATE POLICY "View comments" ON public.comments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM posts p
    WHERE p.id = comments.post_id
      AND (
        p.user_id = auth.uid()
        OR (p.group_id IS NOT NULL AND is_group_member(auth.uid(), p.group_id))
        OR (p.round_id IS NOT NULL AND (is_round_participant(auth.uid(), p.round_id) OR is_round_creator(auth.uid(), p.round_id)))
        OR (p.group_id IS NULL AND p.round_id IS NULL)
      )
  )
);

-- Fix reactions View policy
DROP POLICY IF EXISTS "View reactions" ON public.reactions;
CREATE POLICY "View reactions" ON public.reactions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM posts p
    WHERE p.id = reactions.post_id
      AND (
        p.user_id = auth.uid()
        OR (p.group_id IS NOT NULL AND is_group_member(auth.uid(), p.group_id))
        OR (p.round_id IS NOT NULL AND (is_round_participant(auth.uid(), p.round_id) OR is_round_creator(auth.uid(), p.round_id)))
        OR (p.group_id IS NULL AND p.round_id IS NULL)
      )
  )
);