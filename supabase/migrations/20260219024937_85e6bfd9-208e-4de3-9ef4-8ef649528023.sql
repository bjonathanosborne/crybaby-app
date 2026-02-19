
DROP FUNCTION IF EXISTS public.search_users_by_name(text);

CREATE FUNCTION public.search_users_by_name(_query text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, handicap numeric, home_course text, first_name text, last_name text, ghin text, state text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.avatar_url,
    p.handicap,
    p.home_course,
    p.first_name,
    p.last_name,
    p.ghin,
    p.state
  FROM public.profiles p
  WHERE p.user_id != auth.uid()
    AND (
      p.first_name ILIKE '%' || _query || '%'
      OR p.last_name ILIKE '%' || _query || '%'
      OR p.display_name ILIKE '%' || _query || '%'
      OR p.ghin ILIKE '%' || _query || '%'
      OR p.home_course ILIKE '%' || _query || '%'
      OR p.state ILIKE '%' || _query || '%'
    )
  LIMIT 30;
$$;
