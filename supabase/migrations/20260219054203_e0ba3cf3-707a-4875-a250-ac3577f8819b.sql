
-- ============================================================
-- Fix ALL RLS policies: change from RESTRICTIVE to PERMISSIVE
-- PostgreSQL denies all access when only restrictive policies exist.
-- ============================================================

-- ─── ai_commentary ───
DROP POLICY IF EXISTS "Insert AI commentary" ON public.ai_commentary;
DROP POLICY IF EXISTS "View AI commentary" ON public.ai_commentary;

CREATE POLICY "Insert AI commentary" ON public.ai_commentary FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "View AI commentary" ON public.ai_commentary FOR SELECT
  USING (
    (user_id = auth.uid())
    OR ((round_id IS NOT NULL) AND is_round_participant(auth.uid(), round_id))
    OR ((post_id IS NOT NULL) AND (EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = ai_commentary.post_id
        AND (p.user_id = auth.uid()
          OR ((p.group_id IS NOT NULL) AND is_group_member(auth.uid(), p.group_id))
          OR ((p.round_id IS NOT NULL) AND is_round_participant(auth.uid(), p.round_id)))
    )))
  );

-- ─── comments ───
DROP POLICY IF EXISTS "Create comments" ON public.comments;
DROP POLICY IF EXISTS "Delete comments" ON public.comments;
DROP POLICY IF EXISTS "Update comments" ON public.comments;
DROP POLICY IF EXISTS "View comments" ON public.comments;

CREATE POLICY "Create comments" ON public.comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete comments" ON public.comments FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Update comments" ON public.comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "View comments" ON public.comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM posts p
    WHERE p.id = comments.post_id
      AND (p.user_id = auth.uid()
        OR ((p.group_id IS NOT NULL) AND is_group_member(auth.uid(), p.group_id))
        OR ((p.round_id IS NOT NULL) AND (is_round_participant(auth.uid(), p.round_id) OR is_round_creator(auth.uid(), p.round_id)))
        OR ((p.group_id IS NULL) AND (p.round_id IS NULL)))
  ));

-- ─── friendships ───
DROP POLICY IF EXISTS "Delete friendships" ON public.friendships;
DROP POLICY IF EXISTS "See own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Send friend requests" ON public.friendships;
DROP POLICY IF EXISTS "Update friendships" ON public.friendships;

CREATE POLICY "See own friendships" ON public.friendships FOR SELECT
  USING ((user_id_a = auth.uid()) OR (user_id_b = auth.uid()));

CREATE POLICY "Send friend requests" ON public.friendships FOR INSERT
  WITH CHECK ((user_id_a = auth.uid()) AND (status = 'pending'));

CREATE POLICY "Update friendships" ON public.friendships FOR UPDATE
  USING ((user_id_a = auth.uid()) OR (user_id_b = auth.uid()));

CREATE POLICY "Delete friendships" ON public.friendships FOR DELETE
  USING ((user_id_a = auth.uid()) OR (user_id_b = auth.uid()));

-- ─── group_members ───
DROP POLICY IF EXISTS "Join groups" ON public.group_members;
DROP POLICY IF EXISTS "Leave or remove" ON public.group_members;
DROP POLICY IF EXISTS "Update member roles" ON public.group_members;
DROP POLICY IF EXISTS "View group members" ON public.group_members;

CREATE POLICY "View group members" ON public.group_members FOR SELECT
  USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Join groups" ON public.group_members FOR INSERT
  WITH CHECK ((user_id = auth.uid()) OR is_group_owner_or_admin(auth.uid(), group_id));

CREATE POLICY "Update member roles" ON public.group_members FOR UPDATE
  USING (is_group_owner_or_admin(auth.uid(), group_id));

CREATE POLICY "Leave or remove" ON public.group_members FOR DELETE
  USING ((user_id = auth.uid()) OR is_group_owner_or_admin(auth.uid(), group_id));

-- ─── groups ───
DROP POLICY IF EXISTS "Create groups" ON public.groups;
DROP POLICY IF EXISTS "Delete groups" ON public.groups;
DROP POLICY IF EXISTS "Groups viewable" ON public.groups;
DROP POLICY IF EXISTS "Update groups" ON public.groups;

CREATE POLICY "Groups viewable" ON public.groups FOR SELECT
  USING ((privacy_level = 'public') OR is_group_member(auth.uid(), id));

CREATE POLICY "Create groups" ON public.groups FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update groups" ON public.groups FOR UPDATE
  USING (is_group_owner_or_admin(auth.uid(), id));

CREATE POLICY "Delete groups" ON public.groups FOR DELETE
  USING (is_group_owner_or_admin(auth.uid(), id));

-- ─── notifications ───
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- ─── posts ───
DROP POLICY IF EXISTS "Create posts" ON public.posts;
DROP POLICY IF EXISTS "Delete posts" ON public.posts;
DROP POLICY IF EXISTS "Update posts" ON public.posts;
DROP POLICY IF EXISTS "View posts" ON public.posts;

CREATE POLICY "View posts" ON public.posts FOR SELECT
  USING (
    (user_id = auth.uid())
    OR ((group_id IS NOT NULL) AND is_group_member(auth.uid(), group_id))
    OR ((round_id IS NOT NULL) AND (is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id)))
    OR ((group_id IS NULL) AND (round_id IS NULL))
  );

CREATE POLICY "Create posts" ON public.posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Update posts" ON public.posts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Delete posts" ON public.posts FOR DELETE
  USING (user_id = auth.uid());

-- ─── profiles ───
DROP POLICY IF EXISTS "Profiles viewable by connected users" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Profiles viewable by connected users" ON public.profiles FOR SELECT
  USING (can_view_profile(auth.uid(), user_id));

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

-- ─── push_subscriptions ───
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can manage their own subscriptions" ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── reactions ───
DROP POLICY IF EXISTS "Create reactions" ON public.reactions;
DROP POLICY IF EXISTS "Delete reactions" ON public.reactions;
DROP POLICY IF EXISTS "Update reactions" ON public.reactions;
DROP POLICY IF EXISTS "View reactions" ON public.reactions;

CREATE POLICY "View reactions" ON public.reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM posts p
    WHERE p.id = reactions.post_id
      AND (p.user_id = auth.uid()
        OR ((p.group_id IS NOT NULL) AND is_group_member(auth.uid(), p.group_id))
        OR ((p.round_id IS NOT NULL) AND (is_round_participant(auth.uid(), p.round_id) OR is_round_creator(auth.uid(), p.round_id)))
        OR ((p.group_id IS NULL) AND (p.round_id IS NULL)))
  ));

CREATE POLICY "Create reactions" ON public.reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Update reactions" ON public.reactions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Delete reactions" ON public.reactions FOR DELETE
  USING (user_id = auth.uid());

-- ─── round_event_reactions ───
DROP POLICY IF EXISTS "Add event reactions" ON public.round_event_reactions;
DROP POLICY IF EXISTS "Remove event reactions" ON public.round_event_reactions;
DROP POLICY IF EXISTS "View event reactions" ON public.round_event_reactions;

CREATE POLICY "View event reactions" ON public.round_event_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM round_events re
    WHERE re.id = round_event_reactions.event_id
      AND (is_round_participant(auth.uid(), re.round_id) OR is_round_creator(auth.uid(), re.round_id))
  ));

CREATE POLICY "Add event reactions" ON public.round_event_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Remove event reactions" ON public.round_event_reactions FOR DELETE
  USING (user_id = auth.uid());

-- ─── round_events ───
DROP POLICY IF EXISTS "Create round events" ON public.round_events;
DROP POLICY IF EXISTS "View round events" ON public.round_events;

CREATE POLICY "View round events" ON public.round_events FOR SELECT
  USING (is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id) OR is_round_follower(auth.uid(), round_id));

CREATE POLICY "Create round events" ON public.round_events FOR INSERT
  WITH CHECK (is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id));

-- ─── round_followers ───
DROP POLICY IF EXISTS "Follow rounds" ON public.round_followers;
DROP POLICY IF EXISTS "Unfollow rounds" ON public.round_followers;
DROP POLICY IF EXISTS "Update follow status" ON public.round_followers;
DROP POLICY IF EXISTS "View round followers" ON public.round_followers;

CREATE POLICY "View round followers" ON public.round_followers FOR SELECT
  USING ((user_id = auth.uid()) OR is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id));

CREATE POLICY "Follow rounds" ON public.round_followers FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Update follow status" ON public.round_followers FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Unfollow rounds" ON public.round_followers FOR DELETE
  USING (user_id = auth.uid());

-- ─── round_players ───
DROP POLICY IF EXISTS "Add players" ON public.round_players;
DROP POLICY IF EXISTS "Remove players" ON public.round_players;
DROP POLICY IF EXISTS "Update scores" ON public.round_players;
DROP POLICY IF EXISTS "View round players" ON public.round_players;

CREATE POLICY "View round players" ON public.round_players FOR SELECT
  USING (is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id) OR is_round_follower(auth.uid(), round_id) OR is_round_broadcast_friend(auth.uid(), round_id));

CREATE POLICY "Add players" ON public.round_players FOR INSERT
  WITH CHECK (is_round_creator(auth.uid(), round_id) OR (user_id = auth.uid()));

CREATE POLICY "Update scores" ON public.round_players FOR UPDATE
  USING ((user_id = auth.uid()) OR is_round_creator(auth.uid(), round_id));

CREATE POLICY "Remove players" ON public.round_players FOR DELETE
  USING (is_round_creator(auth.uid(), round_id));

-- ─── round_settlements ───
DROP POLICY IF EXISTS "Create settlements" ON public.round_settlements;
DROP POLICY IF EXISTS "Delete own manual adjustments" ON public.round_settlements;
DROP POLICY IF EXISTS "Update own manual adjustments" ON public.round_settlements;
DROP POLICY IF EXISTS "View own settlements" ON public.round_settlements;

CREATE POLICY "View own settlements" ON public.round_settlements FOR SELECT
  USING ((user_id = auth.uid()) OR is_round_participant(auth.uid(), round_id) OR is_round_creator(auth.uid(), round_id));

CREATE POLICY "Create settlements" ON public.round_settlements FOR INSERT
  WITH CHECK (is_round_creator(auth.uid(), round_id) OR ((is_manual_adjustment = true) AND (user_id = auth.uid())));

CREATE POLICY "Update own manual adjustments" ON public.round_settlements FOR UPDATE
  USING ((user_id = auth.uid()) AND (is_manual_adjustment = true));

CREATE POLICY "Delete own manual adjustments" ON public.round_settlements FOR DELETE
  USING ((user_id = auth.uid()) AND (is_manual_adjustment = true));

-- ─── rounds ───
DROP POLICY IF EXISTS "Create rounds" ON public.rounds;
DROP POLICY IF EXISTS "Delete rounds" ON public.rounds;
DROP POLICY IF EXISTS "Update rounds" ON public.rounds;
DROP POLICY IF EXISTS "View rounds" ON public.rounds;

CREATE POLICY "View rounds" ON public.rounds FOR SELECT
  USING ((created_by = auth.uid()) OR is_round_participant(auth.uid(), id) OR is_round_follower(auth.uid(), id) OR is_round_broadcast_friend(auth.uid(), id));

CREATE POLICY "Create rounds" ON public.rounds FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update rounds" ON public.rounds FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Delete rounds" ON public.rounds FOR DELETE
  USING (created_by = auth.uid());

-- ─── user_courses ───
DROP POLICY IF EXISTS "Anyone can add courses" ON public.user_courses;
DROP POLICY IF EXISTS "Anyone can view courses" ON public.user_courses;

CREATE POLICY "Anyone can view courses" ON public.user_courses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can add courses" ON public.user_courses FOR INSERT
  WITH CHECK (created_by = auth.uid());
