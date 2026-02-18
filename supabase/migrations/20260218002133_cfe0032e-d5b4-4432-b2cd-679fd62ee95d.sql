
-- Add invite_code column to groups
ALTER TABLE public.groups ADD COLUMN invite_code text UNIQUE;

-- Generate invite codes for existing groups
UPDATE public.groups SET invite_code = UPPER(SUBSTR(MD5(RANDOM()::text), 1, 6)) WHERE invite_code IS NULL;

-- Make invite_code NOT NULL with a default going forward
ALTER TABLE public.groups ALTER COLUMN invite_code SET DEFAULT UPPER(SUBSTR(MD5(RANDOM()::text), 1, 6));
ALTER TABLE public.groups ALTER COLUMN invite_code SET NOT NULL;

-- Create index for fast lookup
CREATE INDEX idx_groups_invite_code ON public.groups(invite_code);

-- Allow anyone authenticated to look up a group by invite code (needed for joining)
CREATE POLICY "Lookup group by invite code"
  ON public.groups FOR SELECT
  USING (true);
