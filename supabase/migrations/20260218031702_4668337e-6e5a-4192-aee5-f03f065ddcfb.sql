
-- ============================================================
-- FIX 1: Drop the overly permissive "Lookup group by invite code" policy
-- and create a secure SECURITY DEFINER function for invite code lookups
-- ============================================================
DROP POLICY IF EXISTS "Lookup group by invite code" ON public.groups;

CREATE OR REPLACE FUNCTION public.lookup_group_by_invite(_code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  privacy_level TEXT,
  avatar_url TEXT,
  invite_code TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.name, g.description, g.privacy_level, g.avatar_url,
         g.invite_code, g.created_by, g.created_at, g.updated_at
  FROM public.groups g
  WHERE g.invite_code = UPPER(TRIM(_code));
$$;

-- ============================================================
-- FIX 2: Replace overly permissive SELECT policies on posts,
-- comments, reactions, and ai_commentary
-- ============================================================

-- Posts: scope to author, group members, round participants, or public posts
DROP POLICY IF EXISTS "View posts" ON public.posts;
CREATE POLICY "View posts" ON public.posts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id))
    OR (round_id IS NOT NULL AND (
      is_round_participant(auth.uid(), round_id)
      OR EXISTS (SELECT 1 FROM rounds WHERE rounds.id = posts.round_id AND rounds.created_by = auth.uid())
    ))
    OR (group_id IS NULL AND round_id IS NULL)
  );

-- Comments: can view comments on posts you can see
DROP POLICY IF EXISTS "View comments" ON public.comments;
CREATE POLICY "View comments" ON public.comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = comments.post_id
      AND (
        p.user_id = auth.uid()
        OR (p.group_id IS NOT NULL AND is_group_member(auth.uid(), p.group_id))
        OR (p.round_id IS NOT NULL AND (
          is_round_participant(auth.uid(), p.round_id)
          OR EXISTS (SELECT 1 FROM rounds WHERE rounds.id = p.round_id AND rounds.created_by = auth.uid())
        ))
        OR (p.group_id IS NULL AND p.round_id IS NULL)
      )
    )
  );

-- Reactions: same pattern as comments
DROP POLICY IF EXISTS "View reactions" ON public.reactions;
CREATE POLICY "View reactions" ON public.reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = reactions.post_id
      AND (
        p.user_id = auth.uid()
        OR (p.group_id IS NOT NULL AND is_group_member(auth.uid(), p.group_id))
        OR (p.round_id IS NOT NULL AND (
          is_round_participant(auth.uid(), p.round_id)
          OR EXISTS (SELECT 1 FROM rounds WHERE rounds.id = p.round_id AND rounds.created_by = auth.uid())
        ))
        OR (p.group_id IS NULL AND p.round_id IS NULL)
      )
    )
  );

-- AI Commentary: scope to own, round participant, or visible post
DROP POLICY IF EXISTS "View AI commentary" ON public.ai_commentary;
CREATE POLICY "View AI commentary" ON public.ai_commentary
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (round_id IS NOT NULL AND is_round_participant(auth.uid(), round_id))
    OR (post_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = ai_commentary.post_id
      AND (
        p.user_id = auth.uid()
        OR (p.group_id IS NOT NULL AND is_group_member(auth.uid(), p.group_id))
        OR (p.round_id IS NOT NULL AND is_round_participant(auth.uid(), p.round_id))
      )
    ))
  );
