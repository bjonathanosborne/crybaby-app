-- ============================================================
-- Rounds visibility toggle for passive browsing.
--
-- Controls whether this user's rounds list appears on their
-- public / friend profile page (UserProfilePage.tsx) when
-- someone else views them.
--
-- Scope rules (mirrors handicap_visible_to_friends from
-- migration 20260419010000):
--   - Own profile always shows own rounds regardless.
--   - Rounds the VIEWER participated in are always visible on
--     the viewed user's profile, regardless of this flag — a
--     shared round's data cannot be hidden from its own
--     participants (that money is theirs too).
--   - This flag only affects rounds the viewed user played
--     WITHOUT the viewer — purely passive browsing of stranger
--     or friend rounds.
--   - Default: true (visible).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rounds_visible_to_friends BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.rounds_visible_to_friends IS
  'When false, rounds the user played WITHOUT the viewer are hidden from UserProfilePage. Shared rounds (rounds both people played) are always visible to both. Always visible on own profile.';
