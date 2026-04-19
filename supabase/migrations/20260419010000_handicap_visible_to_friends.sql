-- ============================================================
-- Handicap visibility toggle for passive browsing.
--
-- Controls whether this user's handicap index appears on their
-- public / friend profile page (UserProfilePage.tsx) when someone
-- else views them. Default: true (visible).
--
-- Scope rules:
--   - User's own profile always shows own handicap regardless.
--   - In-round contexts (active round, live feed) always show
--     each player's LOCKED round-start handicap from
--     rounds.course_details.playerConfig[].handicap — those screens
--     ignore this toggle because players in a shared money game
--     have a right to see each other's number.
--   - This flag affects passive browsing only: viewing a friend's
--     profile when you're not currently in a round with them.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handicap_visible_to_friends BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.handicap_visible_to_friends IS
  'When false, the handicap field is hidden from UserProfilePage when viewed by someone else. Always visible on own profile and in active-round contexts.';
