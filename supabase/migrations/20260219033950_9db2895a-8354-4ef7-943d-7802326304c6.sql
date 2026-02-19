
-- Add broadcast flag to rounds
ALTER TABLE public.rounds ADD COLUMN is_broadcast boolean NOT NULL DEFAULT false;

-- Create round_followers table
CREATE TABLE public.round_followers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'following',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(round_id, user_id)
);

-- Enable RLS
ALTER TABLE public.round_followers ENABLE ROW LEVEL SECURITY;

-- Followers can see who's following rounds they're connected to
CREATE POLICY "View round followers"
ON public.round_followers
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_round_participant(auth.uid(), round_id)
  OR EXISTS (
    SELECT 1 FROM rounds r WHERE r.id = round_id AND r.created_by = auth.uid()
  )
);

-- Users can follow/decline rounds
CREATE POLICY "Follow rounds"
ON public.round_followers
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their follow status
CREATE POLICY "Update follow status"
ON public.round_followers
FOR UPDATE
USING (user_id = auth.uid());

-- Users can unfollow
CREATE POLICY "Unfollow rounds"
ON public.round_followers
FOR DELETE
USING (user_id = auth.uid());

-- Enable realtime for round_followers
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_followers;
