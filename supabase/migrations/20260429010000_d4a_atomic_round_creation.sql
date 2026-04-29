-- PR #30 commit 3 (D4-A): atomic round creation.
-- 'setup' is already valid in rounds_status_check (added in
-- 20260217062941_...sql:130-142, reconciled across 'canceled' in
-- 20260409100000_add_canceled_round_status.sql). What's missing:
-- transactional insert RPC, activation RPC, and a creator-scoped
-- sweeper RPC for status='setup' rounds older than 30 minutes.
--
-- Existing RLS policies on public.rounds key on `created_by =
-- auth.uid()` (no status predicate), so creators can already
-- SELECT their own status='setup' rounds — confirmed pre-apply
-- against migration 20260219054203_e0ba3cf3-...sql.
--
-- This migration is idempotent. Re-applying makes no schema
-- change beyond ensuring the three RPC bodies match what's here
-- (CREATE OR REPLACE) and the tracker row is present (ON CONFLICT
-- DO NOTHING).

-- ============================================================
-- start_round: transactional rounds + round_players insert
-- ============================================================
-- Replaces createRound's two sequential client-side inserts.
-- Both writes run inside a single transaction (the function body)
-- so any failure rolls back the round_players writes AND the
-- rounds write — zero orphan rows possible.
--
-- Lands the row at status='setup'. activate_round flips to
-- 'active' after the client successfully mounts CrybabyActiveRound.
-- An idle status='setup' round is swept by cleanup_stuck_setup_rounds
-- after 30 minutes; the StuckRoundBanner can also offer a manual
-- abandon affordance after 5 minutes.
--
-- Empty p_player_configs (e.g. '[]'::jsonb) is supported by design:
-- jsonb_array_elements returns 0 rows, the FOR loop is a no-op,
-- and the round is created with no players. Useful for tests
-- and for the smoke-test contract.
-- ============================================================

-- DROP first because changing a parameter TYPE doesn't work via
-- CREATE OR REPLACE — Postgres treats it as a different overload
-- and would leave the wrongly-typed version sitting alongside the
-- corrected one. Smoke test caught the type mismatch (column
-- `scorekeeper_mode` is BOOLEAN, my first attempt used TEXT).
DROP FUNCTION IF EXISTS public.start_round(TEXT, TEXT, JSONB, TEXT, TEXT, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS public.start_round(TEXT, TEXT, JSONB, TEXT, BOOLEAN, NUMERIC, JSONB);

CREATE OR REPLACE FUNCTION public.start_round(
  p_game_type TEXT,
  p_course TEXT,
  p_course_details JSONB,
  p_stakes TEXT,
  -- BOOLEAN, not TEXT, to match `public.rounds.scorekeeper_mode`
  -- (defined in 20260217062941_...sql:139 as
  -- `scorekeeper_mode BOOLEAN NOT NULL DEFAULT false`).
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
      round_id, user_id, guest_name, is_scorekeeper, hole_scores, total_score
    ) VALUES (
      v_round_id,
      NULLIF(v_player->>'user_id', '')::UUID,
      v_player->>'guest_name',
      COALESCE((v_player->>'is_scorekeeper')::BOOLEAN, false),
      '{}'::JSONB,
      0
    );
  END LOOP;

  RETURN v_round_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_round(
  TEXT, TEXT, JSONB, TEXT, BOOLEAN, NUMERIC, JSONB
) TO authenticated;

-- ============================================================
-- activate_round: 'setup' → 'active' (idempotent on creator)
-- ============================================================
-- Called from CrybabyActiveRound's mount-success effect once
-- the round is loaded and the first render has settled. Safe to
-- call repeatedly: only the (id, created_by, status='setup')
-- predicate flips a row, so 'active' / 'completed' / 'canceled'
-- rounds are no-ops.

CREATE OR REPLACE FUNCTION public.activate_round(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rounds
  SET status = 'active'
  WHERE id = p_round_id
    AND created_by = auth.uid()
    AND status = 'setup';
  -- No exception when no row updates. Idempotent by design.
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_round(UUID) TO authenticated;

-- ============================================================
-- cleanup_stuck_setup_rounds: client-driven sweeper
-- ============================================================
-- Cancels up to 50 of the calling user's status='setup' rounds
-- older than 30 minutes. Returns the count cancelled. Called
-- from CrybabyFeed mount, fire-and-forget, once per visit.
--
-- The 50-row LIMIT prevents a runaway from thrashing the DB
-- if a user has accumulated many stuck rounds (shouldn't happen
-- in practice, but cheap insurance). The 30-minute INTERVAL
-- gives a real user plenty of headroom mid-setup; in-window
-- recovery is handled by the StuckRoundBanner's 5-minute
-- predicate.

CREATE OR REPLACE FUNCTION public.cleanup_stuck_setup_rounds()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  WITH swept AS (
    UPDATE public.rounds
    SET status = 'canceled', canceled_at = NOW()
    WHERE id IN (
      SELECT id FROM public.rounds
      WHERE created_by = auth.uid()
        AND status = 'setup'
        AND created_at < NOW() - INTERVAL '30 minutes'
      ORDER BY created_at ASC
      LIMIT 50
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM swept;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stuck_setup_rounds() TO authenticated;

-- ============================================================
-- Tracker
-- ============================================================
-- Schema-migrations row so the reconciliation pattern stays
-- intact (see 20260420000000_reconcile_schema_migrations_tracker.sql
-- for the pattern). Empty `statements` array because the
-- function bodies are recoverable from this file via
-- CREATE OR REPLACE; the tracker is just for "this version
-- exists" bookkeeping.

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260429010000', 'd4a_atomic_round_creation', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;
