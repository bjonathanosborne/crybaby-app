-- ─────────────────────────────────────────────────────────────────────────
-- get_user_stats(p_user_id uuid)
--
-- Returns aggregate career stats for a player in a single efficient query.
-- Used by the Stats page and user profiles.
--
-- Returns:
--   rounds_played   — completed rounds where this user was a player
--   avg_score       — average total stroke count (completed rounds)
--   best_score      — lowest total stroke count
--   total_earnings  — cumulative P&L from round_settlements
--   wins            — settlement rows with amount > 0
--   losses          — settlement rows with amount < 0
--   birdies         — career birdie events
--   eagles          — career eagle events
--   pars            — career par events
--   bogeys          — career bogey events
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id uuid)
RETURNS TABLE (
  rounds_played   bigint,
  avg_score       numeric,
  best_score      integer,
  total_earnings  numeric,
  wins            bigint,
  losses          bigint,
  birdies         bigint,
  eagles          bigint,
  pars            bigint,
  bogeys          bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Rounds played (completed only)
    (
      SELECT COUNT(DISTINCT rp.round_id)
      FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.user_id = p_user_id
        AND r.status = 'completed'
    )::bigint AS rounds_played,

    -- Average score (completed rounds, exclude zero/null totals)
    (
      SELECT ROUND(AVG(rp.total_score::numeric), 1)
      FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.user_id = p_user_id
        AND r.status = 'completed'
        AND rp.total_score > 0
    ) AS avg_score,

    -- Best (lowest) score
    (
      SELECT MIN(rp.total_score)
      FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.user_id = p_user_id
        AND r.status = 'completed'
        AND rp.total_score > 0
    ) AS best_score,

    -- Total P&L
    COALESCE(
      (SELECT SUM(amount) FROM round_settlements WHERE user_id = p_user_id),
      0
    ) AS total_earnings,

    -- Wins (rounds where user collected money)
    (
      SELECT COUNT(*)
      FROM round_settlements
      WHERE user_id = p_user_id AND amount > 0
    )::bigint AS wins,

    -- Losses (rounds where user paid out)
    (
      SELECT COUNT(*)
      FROM round_settlements
      WHERE user_id = p_user_id AND amount < 0
    )::bigint AS losses,

    -- Career birdies
    (
      SELECT COUNT(*)
      FROM round_events re
      JOIN round_players rp ON re.round_player_id = rp.id
      WHERE rp.user_id = p_user_id AND re.event_type = 'birdie'
    )::bigint AS birdies,

    -- Career eagles
    (
      SELECT COUNT(*)
      FROM round_events re
      JOIN round_players rp ON re.round_player_id = rp.id
      WHERE rp.user_id = p_user_id AND re.event_type = 'eagle'
    )::bigint AS eagles,

    -- Career pars
    (
      SELECT COUNT(*)
      FROM round_events re
      JOIN round_players rp ON re.round_player_id = rp.id
      WHERE rp.user_id = p_user_id AND re.event_type = 'par'
    )::bigint AS pars,

    -- Career bogeys
    (
      SELECT COUNT(*)
      FROM round_events re
      JOIN round_players rp ON re.round_player_id = rp.id
      WHERE rp.user_id = p_user_id AND re.event_type = 'bogey'
    )::bigint AS bogeys;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_stats(uuid) TO authenticated;
