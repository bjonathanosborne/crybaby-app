
-- Table to store per-player financial outcomes for each completed round
CREATE TABLE public.round_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name text,
  amount numeric NOT NULL DEFAULT 0,
  is_manual_adjustment boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.round_settlements ENABLE ROW LEVEL SECURITY;

-- Users can view settlements for rounds they participated in or created
CREATE POLICY "View own settlements"
  ON public.round_settlements FOR SELECT
  USING (
    user_id = auth.uid() 
    OR is_round_participant(auth.uid(), round_id)
    OR EXISTS (SELECT 1 FROM rounds WHERE id = round_id AND created_by = auth.uid())
  );

-- Round creator can insert settlements
CREATE POLICY "Create settlements"
  ON public.round_settlements FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM rounds WHERE id = round_id AND created_by = auth.uid())
    OR (is_manual_adjustment = true AND user_id = auth.uid())
  );

-- Users can update their own manual adjustments
CREATE POLICY "Update own manual adjustments"
  ON public.round_settlements FOR UPDATE
  USING (user_id = auth.uid() AND is_manual_adjustment = true);

-- Users can delete their own manual adjustments  
CREATE POLICY "Delete own manual adjustments"
  ON public.round_settlements FOR DELETE
  USING (user_id = auth.uid() AND is_manual_adjustment = true);

-- Index for fast lookups
CREATE INDEX idx_round_settlements_user ON public.round_settlements(user_id);
CREATE INDEX idx_round_settlements_round ON public.round_settlements(round_id);
CREATE INDEX idx_round_settlements_created ON public.round_settlements(created_at);
