
-- Create a helper function to check if two users share a group or are friends
CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    _viewer_id = _target_user_id  -- can always see own profile
    OR EXISTS (
      -- they share a group
      SELECT 1 FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = _viewer_id AND gm2.user_id = _target_user_id
    )
    OR EXISTS (
      -- they are friends (accepted)
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND (
          (user_id_a = _viewer_id AND user_id_b = _target_user_id)
          OR (user_id_a = _target_user_id AND user_id_b = _viewer_id)
        )
    )
    OR EXISTS (
      -- they share a round
      SELECT 1 FROM public.round_players rp1
      JOIN public.round_players rp2 ON rp1.round_id = rp2.round_id
      WHERE rp1.user_id = _viewer_id AND rp2.user_id = _target_user_id
    )
    OR EXISTS (
      -- pending friendship (so you can see who sent you a request)
      SELECT 1 FROM public.friendships
      WHERE status = 'pending'
        AND (
          (user_id_a = _viewer_id AND user_id_b = _target_user_id)
          OR (user_id_a = _target_user_id AND user_id_b = _viewer_id)
        )
    );
$$;

-- Drop the old overly permissive SELECT policy
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;

-- Create a restricted SELECT policy
CREATE POLICY "Profiles viewable by connected users"
ON public.profiles
FOR SELECT
USING (
  public.can_view_profile(auth.uid(), user_id)
);
