-- ============================================================
-- Scorecards Storage bucket + RLS helpers
--
-- Phase 2 photo-capture feature: scorekeepers upload scorecard photos
-- for vision AI extraction. Bucket is PRIVATE. Access is gated to the
-- round's scorekeeper (write) and round viewers (participants + followers,
-- read). Size capped at 10MB; MIME allowlist matches the client input
-- accept attribute.
-- ============================================================

-- Bucket (private; no public = false row in this schema means private by default)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scorecards',
  'scorecards',
  false,
  10 * 1024 * 1024,   -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------
-- SECURITY DEFINER helpers (follow pattern from 20260219050948_)
-- ------------------------------------------------------------

-- True when _user_id is the scorekeeper for _round_id (round_players.is_scorekeeper = true).
CREATE OR REPLACE FUNCTION public.is_round_scorekeeper(_user_id uuid, _round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.round_players
    WHERE round_id = _round_id
      AND user_id = _user_id
      AND is_scorekeeper = true
  );
$$;

-- True when _user_id can VIEW round-scoped resources (participant OR follower OR creator).
-- Mirrors the existing participant/follower/creator unions used on round_events etc.
CREATE OR REPLACE FUNCTION public.is_round_viewer(_user_id uuid, _round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_round_participant(_user_id, _round_id)
    OR public.is_round_creator(_user_id, _round_id)
    OR public.is_round_follower(_user_id, _round_id)
    OR public.is_round_broadcast_friend(_user_id, _round_id);
$$;

-- ------------------------------------------------------------
-- Storage policies on the scorecards bucket
--
-- Path convention: rounds/{round_id}/{capture_id}.{ext}
--   storage.foldername(name)[1] = 'rounds'
--   storage.foldername(name)[2] = {round_id}
-- ------------------------------------------------------------

CREATE POLICY "Scorekeepers can upload scorecards"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'scorecards'
  AND (storage.foldername(name))[1] = 'rounds'
  AND public.is_round_scorekeeper(
    auth.uid(),
    ((storage.foldername(name))[2])::uuid
  )
);

CREATE POLICY "Round viewers can read scorecards"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'scorecards'
  AND (storage.foldername(name))[1] = 'rounds'
  AND public.is_round_viewer(
    auth.uid(),
    ((storage.foldername(name))[2])::uuid
  )
);

CREATE POLICY "Scorekeepers can update own scorecards"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'scorecards'
  AND owner = auth.uid()
);

CREATE POLICY "Uploader or admin can delete scorecards"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'scorecards'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
);
