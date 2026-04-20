-- ============================================================
-- Fix: get_user_score_distribution returns empty on Solo rounds.
--
-- The original migration 20260419040000 used a nested
-- CROSS JOIN LATERAL (jsonb_each) + JOIN LATERAL ON ordinality
-- pattern to pair scores with pars. That pattern evidently
-- has a planner or cast quirk against real data — at least
-- for Solo rounds — and yields zero rows.
--
-- This rewrite replaces the clever lateral joins with a
-- straightforward generate_series over the pars array, and
-- looks up each hole's score via the ->> text-extraction
-- operator (which handles both object {"1":4,...} and array
-- [4,5,...] hole_scores shapes by branching on jsonb_typeof).
--
-- Semantics are unchanged — same 7 buckets, same
-- hole-in-one-only-on-par-3+ rule, same 9-hole correctness
-- via jsonb_array_length of pars.
--
-- Idempotent. Safe to re-apply.
--
-- NOTE: we DROP before CREATE (rather than using CREATE OR REPLACE) because
-- the original 20260419040000 function had a row-type signature subtly
-- incompatible with this one — Postgres errors 42P13 "cannot change return
-- type of existing function" on a bare CREATE OR REPLACE. DROP IF EXISTS
-- keeps the migration safe to run against a fresh DB (no-op drop) AND
-- against any DB still carrying the old function.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_user_score_distribution(uuid);

CREATE FUNCTION public.get_user_score_distribution(p_user_id uuid)
RETURNS TABLE (
  ace          bigint,
  eagle        bigint,
  birdie       bigint,
  pars         bigint,
  bogey        bigint,
  double_bogey bigint,
  triple_plus  bigint,
  total_holes  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_hole AS (
    SELECT
      -- Score lookup branches on hole_scores shape:
      --   object form {"1":4,"2":5,...}  → key is 1-indexed text
      --   array  form [4,5,...]           → index is 0-indexed
      -- In both cases we use ->> to extract as text then cast to int.
      -- NULLIF guards against empty-string results from malformed data.
      CASE
        WHEN jsonb_typeof(rp.hole_scores) = 'object'
          THEN NULLIF(rp.hole_scores ->> hole_num::text, '')::int
        WHEN jsonb_typeof(rp.hole_scores) = 'array'
             AND (hole_num - 1) < jsonb_array_length(rp.hole_scores)
          THEN NULLIF(rp.hole_scores ->> (hole_num - 1), '')::int
        ELSE NULL
      END AS score,
      -- Par lookup: pars is always an array; -> (0-index) -> text -> int.
      NULLIF(r.course_details -> 'pars' ->> (hole_num - 1), '')::int AS par
    FROM public.round_players rp
    JOIN public.rounds r ON r.id = rp.round_id
    CROSS JOIN LATERAL generate_series(
      1,
      -- Guard: if pars isn't a valid array, generate_series(1, 0) yields
      -- zero rows for this round rather than throwing. Keeps the function
      -- defensive against any malformed course_details row.
      CASE
        WHEN jsonb_typeof(r.course_details -> 'pars') = 'array'
          THEN jsonb_array_length(r.course_details -> 'pars')
        ELSE 0
      END
    ) AS hole_num
    WHERE rp.user_id = p_user_id
      AND rp.hole_scores IS NOT NULL
  ),
  valid_holes AS (
    SELECT score, par
    FROM per_hole
    WHERE score IS NOT NULL
      AND par   IS NOT NULL
      AND score >  0
      AND par   >  0
  )
  SELECT
    COUNT(*) FILTER (WHERE score = 1 AND par >= 3)::bigint AS ace,
    COUNT(*) FILTER (WHERE (score - par) <= -2 AND NOT (score = 1 AND par >= 3))::bigint AS eagle,
    COUNT(*) FILTER (WHERE (score - par) = -1)::bigint AS birdie,
    COUNT(*) FILTER (WHERE (score - par) =  0)::bigint AS pars,
    COUNT(*) FILTER (WHERE (score - par) =  1)::bigint AS bogey,
    COUNT(*) FILTER (WHERE (score - par) =  2)::bigint AS double_bogey,
    COUNT(*) FILTER (WHERE (score - par) >= 3)::bigint AS triple_plus,
    COUNT(*)::bigint AS total_holes
  FROM valid_holes;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_score_distribution(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_score_distribution(uuid) IS
  'Aggregates career scoring distribution across all rounds the user participated in. Returns 8 counts bucketed by score-to-par: ace / eagle / birdie / par / bogey / double / triple+ / total_holes. Handles both object and array hole_scores shapes and arbitrary course lengths via generate_series.';
