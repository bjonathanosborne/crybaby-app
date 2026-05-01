-- Follow-up to 20260429010000_d4a_atomic_round_creation.sql.
--
-- Bug: D4-A's `start_round` RPC inserts every round_players row in a
-- single transaction. Postgres assigns NOW() at transaction-snapshot
-- time, so ALL rows get the same created_at value. Subsequent reads
-- via `.order("created_at")` had no tiebreaker, so the rows came back
-- in an arbitrary, non-deterministic order. The legacy client code
-- assumed `dbPlayers[i] ↔ playerConfig[i]` array-index alignment,
-- which broke when the DB shuffled the rows.
--
-- Symptom: Jonathan's 2026-04-30 Westlake DOC round — Michael (handicap 6)
-- showed strokes on hole 1 instead of Jonathan (handicap 11). Wrong
-- handicaps were rendered because the array indices were off by one
-- to two slots.
--
-- Two-pronged fix:
--   1. Client matches by user_id / guest_name now (see
--      src/lib/playerConfigMatch.ts + supabase/functions/_shared/
--      playerConfigMatch.ts), so positional alignment is no longer
--      load-bearing.
--   2. This migration: use clock_timestamp() per INSERT inside
--      start_round so each row gets a slightly different created_at
--      value. Belt-and-suspenders: any future code path that DOES
--      use positional ordering will at least get a stable order
--      (clock_timestamp advances within a transaction).
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.start_round(
  p_game_type TEXT,
  p_course TEXT,
  p_course_details JSONB,
  p_stakes TEXT,
  p_scorekeeper_mode BOOLEAN DEFAULT false,
  p_handicap_percent NUMERIC DEFAULT NULL,
  p_player_configs JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id UUID;
  v_player JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'start_round: unauthenticated';
  END IF;

  INSERT INTO public.rounds (
    created_by, game_type, course, course_details, stakes,
    scorekeeper_mode, handicap_percent, status
  ) VALUES (
    auth.uid(), p_game_type, p_course, p_course_details, p_stakes,
    p_scorekeeper_mode, p_handicap_percent, 'setup'
  ) RETURNING id INTO v_round_id;

  FOR v_player IN SELECT * FROM jsonb_array_elements(p_player_configs)
  LOOP
    INSERT INTO public.round_players (
      round_id, user_id, guest_name, is_scorekeeper,
      hole_scores, total_score, created_at
    ) VALUES (
      v_round_id,
      NULLIF(v_player->>'user_id', '')::UUID,
      v_player->>'guest_name',
      COALESCE((v_player->>'is_scorekeeper')::BOOLEAN, false),
      '{}'::JSONB,
      0,
      -- clock_timestamp() advances within a transaction (unlike
      -- NOW() which is fixed at transaction-snapshot time). This
      -- gives each row a distinct created_at and a deterministic
      -- order under .order("created_at").
      clock_timestamp()
    );
  END LOOP;

  RETURN v_round_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_round(
  TEXT, TEXT, JSONB, TEXT, BOOLEAN, NUMERIC, JSONB
) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260430000000', 'round_player_distinct_timestamps', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;
