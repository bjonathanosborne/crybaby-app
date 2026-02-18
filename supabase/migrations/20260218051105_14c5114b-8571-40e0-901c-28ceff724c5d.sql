
CREATE OR REPLACE FUNCTION public.search_users_by_name(_query text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, handicap numeric, home_course text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.avatar_url,
    p.handicap,
    p.home_course
  FROM public.profiles p
  WHERE p.display_name ILIKE '%' || _query || '%'
    AND p.user_id != auth.uid()
  LIMIT 20;
$$;
