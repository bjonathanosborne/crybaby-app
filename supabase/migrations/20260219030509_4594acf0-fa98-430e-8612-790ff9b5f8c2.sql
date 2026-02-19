
-- Create a table for user-submitted courses/clubs
CREATE TABLE public.user_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view courses
CREATE POLICY "Anyone can view courses"
ON public.user_courses
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Anyone authenticated can add courses
CREATE POLICY "Anyone can add courses"
ON public.user_courses
FOR INSERT
WITH CHECK (created_by = auth.uid());
