import type { TeamInfo } from "@/lib/gameEngines";

// ============================================================
// FlipTeamsBadge
//
// Persistent "Hole N teams" strip shown at the top of the
// scoring view during the Flip base game (holes 1-15). Because
// Flip teams change EVERY decided hole, the scorekeeper + players
// need to see the current assignment at a glance at all times,
// not just right after the flip modal dismisses.
//
// Pure presentational. If teams for the current hole haven't
// been locked in yet (scorekeeper hasn't tapped the Flip button
// on a decided-hole follow-up), the component returns `null` —
// the caller's flow is responsible for prompting the tap.
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export interface FlipTeamsBadgeProps {
  holeNumber: number;
  teams: TeamInfo | null | undefined;
  /**
   * PR #55 commit 3: per-player stake for this hole. Used to show
   * the 3v2 asymmetric stakes inline ("$4 3-man / $6 2-man") so the
   * user sees who owes what without consulting the spec. Optional —
   * if omitted, stakes line is hidden (legacy behavior).
   */
  baseBet?: number;
  /** data-testid prefix for addressable tests. */
  testIdPrefix?: string;
}

export default function FlipTeamsBadge({
  holeNumber,
  teams,
  baseBet,
  testIdPrefix = "flip-teams-badge",
}: FlipTeamsBadgeProps): JSX.Element | null {
  if (!teams) return null;

  const teamAStr = teams.teamA.players.map(p => p.name).join(", ");
  const teamBStr = teams.teamB.players.map(p => p.name).join(", ");
  // The 3-man side risks $B per player; 2-man side risks $1.5B
  // (canonical Flip 3v2 ratio). Identify which side is which by
  // player count rather than name so resolveCartPosition / future
  // labelling changes don't break the display.
  const threeManSide = teams.teamA.players.length === 3 ? teams.teamA
    : teams.teamB.players.length === 3 ? teams.teamB
    : null;
  const twoManSide = teams.teamA.players.length === 2 ? teams.teamA
    : teams.teamB.players.length === 2 ? teams.teamB
    : null;
  const showStakes = typeof baseBet === "number" && threeManSide && twoManSide;

  return (
    <div
      role="status"
      aria-label={`Flip teams for hole ${holeNumber}: ${teams.teamA.name} — ${teamAStr}. ${teams.teamB.name} — ${teamBStr}.`}
      data-testid={`${testIdPrefix}-root`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        margin: "8px 16px 0",
        background: "#FAF5EC",
        border: "1px solid #DDD0BB",
        borderRadius: 12,
        fontFamily: FONT,
        fontSize: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: 18 }}
      >
        🪙
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10, fontWeight: 700, color: "#8B7355",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}
        >
          Hole {holeNumber} teams
        </div>
        <div
          data-testid={`${testIdPrefix}-teams`}
          style={{ fontSize: 13, color: "#1E130A", lineHeight: 1.3, marginTop: 2 }}
        >
          <span style={{ fontWeight: 700, color: teams.teamA.color }}>
            {teamAStr}
          </span>
          <span style={{ color: "#A8957B", margin: "0 8px" }}>vs</span>
          <span style={{ fontWeight: 700, color: teams.teamB.color }}>
            {teamBStr}
          </span>
        </div>
        {showStakes && (
          <div
            data-testid={`${testIdPrefix}-stakes`}
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
              color: "#8B7355",
              marginTop: 4,
              letterSpacing: "0.02em",
            }}
          >
            ${baseBet} 3-man <span style={{ color: "#CEC0AA" }}>·</span> ${(baseBet * 3) / 2} 2-man
          </div>
        )}
      </div>
    </div>
  );
}
