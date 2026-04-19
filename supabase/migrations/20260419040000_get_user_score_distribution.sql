-- ============================================================
-- get_user_score_distribution(p_user_id uuid)
--
-- Aggregates every hole the user has ever scored across all
-- rounds they participated in, bucketed into seven categories:
--
--   ace         score = 1 AND par >= 3 (hole-in-one)
--   eagle       score <= par - 2 (excluding ace)
--   birdie      score = par - 1
--   par         score = par
--   bogey       score = par + 1
--   double      score = par + 2
--   triple_plus score >= par + 3
--
-- Only counts holes that were actually scored (score > 0).
-- Uses array_length(pars, 1) so 9-hole rounds are handled —
-- we only bucket holes for which a par was recorded in
-- course_details.pars.
--
-- Used by the Stats page (Part 3 of the profile polish) to
-- render a scoring-distribution pie chart + optional
-- hole-in-one badge.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_score_distribution(p_user_id uuid)
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
  WITH holes AS (
    SELECT
      -- unnest hole_scores alongside pars at matching ordinalities.
      (elem.value)::int AS score,
      (pars_arr.value)::int AS par
    FROM public.round_players rp
    JOIN public.rounds r ON r.id = rp.round_id
    CROSS JOIN LATERAL (
      -- hole_scores may be stored as a JSON object {"1":4,...} or array [4,5,...].
      -- Normalise both shapes into (ord, value) pairs where ord is 1-indexed.
      SELECT
        (kv.key)::int AS ord,
        (kv.value)::text::int AS value
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(rp.hole_scores) = 'array' THEN
            -- array form: map index → 1-based string keys so jsonb_each works uniformly.
            (SELECT jsonb_object_agg((i)::text, elem)
             FROM jsonb_array_elements(rp.hole_scores) WITH ORDINALITY AS t(elem, i))
          ELSE rp.hole_scores
        END
      ) AS kv(key, value)
    ) AS elem
    JOIN LATERAL (
      SELECT
        (p.ord)::int AS ord,
        (p.value)::int AS value
      FROM jsonb_array_elements_text(r.course_details->'pars') WITH ORDINALITY AS p(value, ord)
    ) AS pars_arr ON pars_arr.ord = elem.ord
    WHERE rp.user_id = p_user_id
      AND rp.hole_scores IS NOT NULL
      AND jsonb_typeof(r.course_details->'pars') = 'array'
      AND (elem.value)::int > 0
      AND (pars_arr.value)::int > 0
  )
  SELECT
    COUNT(*) FILTER (WHERE score = 1 AND par >= 3)::bigint AS ace,
    COUNT(*) FILTER (WHERE (score - par) <= -2 AND NOT (score = 1 AND par >= 3))::bigint AS eagle,
    COUNT(*) FILTER (WHERE (score - par) = -1)::bigint AS birdie,
    COUNT(*) FILTER (WHERE (score - par) = 0)::bigint AS pars,
    COUNT(*) FILTER (WHERE (score - par) = 1)::bigint AS bogey,
    COUNT(*) FILTER (WHERE (score - par) = 2)::bigint AS double_bogey,
    COUNT(*) FILTER (WHERE (score - par) >= 3)::bigint AS triple_plus,
    COUNT(*)::bigint AS total_holes
  FROM holes;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_score_distribution(uuid) TO authenticated;
