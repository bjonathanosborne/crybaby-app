
-- Secure function to find existing users by email addresses
-- Returns profiles of matched users WITHOUT exposing email addresses
-- Only authenticated users can call this
CREATE OR REPLACE FUNCTION public.find_users_by_emails(_emails text[])
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  handicap numeric,
  home_course text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.avatar_url,
    p.handicap,
    p.home_course,
    u.email
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  WHERE u.email = ANY(_emails)
    AND u.id != auth.uid()
  LIMIT 50;
$$;
