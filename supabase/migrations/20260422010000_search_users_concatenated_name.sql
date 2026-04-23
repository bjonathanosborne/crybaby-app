-- ============================================================
-- Search-RPC concatenated-name match (PR #23 D1).
--
-- Previous search_users_by_name (migration 20260219024937) matched
-- _query ILIKE substring against first_name OR last_name OR
-- display_name OR ghin OR home_course OR state — each field
-- individually. So a query of "Todd Bailey" on a profile with
-- first_name="Todd", last_name="Bailey" returned ZERO matches:
-- neither field contains the full string "todd bailey".
--
-- This migration adds a concatenated-full-name clause:
--   (first_name || ' ' || last_name) ILIKE '%query%'
-- …which matches "todd bailey" even when the first/last halves
-- are stored separately. Single-word queries like "Todd" still
-- hit via the existing first_name / last_name clauses.
--
-- All other behaviour preserved: still bypasses RLS via SECURITY
-- DEFINER, still excludes the caller's own profile, still LIMITs
-- to 30 rows, same return columns.
-- ============================================================

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
      -- Concatenated full name — added PR #23 D1. Lets "Todd Bailey"
      -- match a profile with first_name="Todd", last_name="Bailey".
      -- COALESCE guards against a half-populated profile.
      (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || _query || '%'
      OR p.first_name ILIKE '%' || _query || '%'
      OR p.last_name ILIKE '%' || _query || '%'
      OR p.display_name ILIKE '%' || _query || '%'
      OR p.ghin ILIKE '%' || _query || '%'
      OR p.home_course ILIKE '%' || _query || '%'
      OR p.state ILIKE '%' || _query || '%'
    )
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.search_users_by_name(text) TO authenticated;

COMMENT ON FUNCTION public.search_users_by_name(text) IS
  'Player search RPC. Matches on first_name, last_name, display_name, ghin, home_course, state individually, PLUS the concatenated `first_name || '' '' || last_name` so multi-word queries like "Todd Bailey" hit profiles stored as (first=Todd, last=Bailey). Added concat clause 2026-04-22 (PR #23 D1).';

-- Tracker row — idempotent.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260422010000', 'search_users_concatenated_name', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
