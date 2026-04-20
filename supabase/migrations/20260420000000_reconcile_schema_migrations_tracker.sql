-- ============================================================
-- One-time reconciliation of supabase_migrations.schema_migrations.
--
-- Background:
--   Between 2026-04-09 and 2026-04-19, eleven migrations were
--   authored in this repo and applied to production Supabase,
--   but every apply went through the Supabase SQL editor (or
--   the management API) rather than `supabase db push`. The CLI
--   is the only path that ALSO inserts a row into
--   supabase_migrations.schema_migrations, so the tracker fell
--   eleven migrations behind reality. The symptom: `supabase
--   migration list --linked` showed our last applied migration
--   as 20260220215411 even though features from the gap were
--   fully live.
--
--   On 2026-04-20 we audited every out-of-band migration via
--   the management API (checked for each migration's intended
--   schema object) and discovered two additional migrations
--   had been partially-shipped: the repo + UI + tests existed,
--   but the DDL had never been applied.
--
--     * 20260419020000_needs_final_photo            → rounds.needs_final_photo column missing
--     * 20260419030000_rounds_visible_to_friends    → profiles.rounds_visible_to_friends column missing
--
--   Those two migrations' DDL was applied via management API
--   the same day (see docs/DEPLOYMENT.md live-apply log),
--   bringing prod's DB objects into agreement with the repo.
--
--   This migration closes the loop by INSERT'ing tracker rows
--   for every out-of-band apply from 20260409000000 onward.
--   After this runs, `supabase db push` will correctly treat
--   all repo migrations as applied on this environment.
--
-- Idempotency:
--   ON CONFLICT (version) DO NOTHING. Safe to re-apply, safe on
--   fresh environments (where `db push` has already inserted
--   each row natively), and safe to run multiple times.
--
--   The `statements` column is set to an empty ARRAY[]::text[]
--   because we can no longer reconstruct the exact statements
--   that were executed. The CLI uses this field only for
--   rollback prompts; leaving it empty means a hypothetical
--   rollback would be a no-op on these rows (preferable to an
--   incorrect statement list).
-- ============================================================

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20260409000000', 'add_user_stats_function',          ARRAY[]::text[]),
  ('20260409100000', 'add_canceled_round_status',        ARRAY[]::text[]),
  ('20260415000000', 'require_name_ghin',                ARRAY[]::text[]),
  ('20260418100000', 'scorecards_bucket',                ARRAY[]::text[]),
  ('20260418100100', 'round_captures',                   ARRAY[]::text[]),
  ('20260419000000', 'hammer_capture',                   ARRAY[]::text[]),
  ('20260419010000', 'handicap_visible_to_friends',      ARRAY[]::text[]),
  ('20260419020000', 'needs_final_photo',                ARRAY[]::text[]),
  ('20260419030000', 'rounds_visible_to_friends',        ARRAY[]::text[]),
  ('20260419040000', 'get_user_score_distribution',      ARRAY[]::text[]),
  ('20260419050000', 'fix_get_user_score_distribution',  ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
