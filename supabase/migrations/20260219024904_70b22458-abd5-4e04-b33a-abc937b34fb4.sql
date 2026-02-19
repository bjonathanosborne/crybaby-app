
ALTER TABLE public.profiles 
  ADD COLUMN first_name text NOT NULL DEFAULT '',
  ADD COLUMN last_name text NOT NULL DEFAULT '',
  ADD COLUMN state text NOT NULL DEFAULT '';
