-- ============================================================
-- Require full name + GHIN for new members
-- Adds profile_completed flag, backfills existing data,
-- and updates handle_new_user() to save name/ghin from metadata
-- ============================================================

-- 1. Add profile_completed column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: mark existing profiles that already have name + ghin as completed
UPDATE public.profiles
SET profile_completed = true
WHERE first_name != '' AND last_name != '' AND ghin IS NOT NULL AND ghin != '';

-- 3. Update handle_new_user() to extract first_name, last_name, ghin from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, ghin, profile_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'ghin', ''), ''),
    CASE WHEN
      COALESCE(NEW.raw_user_meta_data->>'first_name', '') != '' AND
      COALESCE(NEW.raw_user_meta_data->>'last_name', '') != '' AND
      COALESCE(NEW.raw_user_meta_data->>'ghin', '') != ''
    THEN true ELSE false END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
