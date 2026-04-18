-- ============================================================
-- Manual RLS verification for round_captures
--
-- Run against a local Supabase instance after `supabase db reset`.
-- This SCRIPT is NOT auto-run by any test harness yet (see TODOS.md,
-- "Phase 2 deferrals -- automated RLS tests"). It proves by direct SQL
-- that a non-scorekeeper participant cannot INSERT into round_captures.
--
-- Usage (local):
--   supabase db reset
--   psql $(supabase status --output json | jq -r '.DB_URL') -f supabase/tests/round_captures_rls.sql
--
-- Expected outcome: the "SHOULD FAIL" INSERT errors with
-- "new row violates row-level security policy"; the "SHOULD SUCCEED"
-- INSERT returns one row.
-- ============================================================

BEGIN;

-- Two test users
INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'scorekeeper@test'),
  ('22222222-2222-2222-2222-222222222222', 'participant@test')
ON CONFLICT (id) DO NOTHING;

-- Profiles (handle_new_user trigger would normally create these)
INSERT INTO public.profiles (user_id, display_name, first_name, last_name, state, profile_completed)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Scorekeeper', 'Score', 'Keeper', 'TX', true),
  ('22222222-2222-2222-2222-222222222222', 'Player', 'Plain', 'Player', 'TX', true)
ON CONFLICT (user_id) DO NOTHING;

-- A round owned by the scorekeeper
INSERT INTO public.rounds (id, created_by, course, status)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Test Course', 'active');

-- Two round_players: user 1 is the scorekeeper, user 2 is just a participant
INSERT INTO public.round_players (id, round_id, user_id, is_scorekeeper)
VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', true),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', false);

-- --- Case 1: non-scorekeeper participant tries to INSERT --> SHOULD FAIL ---
SET LOCAL "request.jwt.claims" TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.round_captures (round_id, captured_by, trigger)
    VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'ad_hoc');
    RAISE EXCEPTION 'FAIL: non-scorekeeper INSERT was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'PASS: non-scorekeeper INSERT rejected by RLS';
  END;
END $$;

-- --- Case 2: scorekeeper INSERTs --> SHOULD SUCCEED ---
SET LOCAL "request.jwt.claims" TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SET LOCAL ROLE authenticated;

INSERT INTO public.round_captures (round_id, captured_by, trigger)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'ad_hoc')
RETURNING id;

-- --- Case 3: non-participant cannot SELECT --> SHOULD return 0 rows ---
SET LOCAL "request.jwt.claims" TO '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT count(*) AS should_be_zero FROM public.round_captures
WHERE round_id = '33333333-3333-3333-3333-333333333333';

ROLLBACK;
