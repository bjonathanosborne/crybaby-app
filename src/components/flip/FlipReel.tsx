import { useEffect, useRef, useState } from "react";
import { generateFlipTeams, type Player, type TeamInfo } from "@/lib/gameEngines";

// ============================================================
// FlipReel — shared flip-animation modal
//
// Extracted from the single-purpose FlipTeamModal that lived
// inline in CrybabyActiveRound. Now serves both:
//
//   mode="initial"   — round-start flip (hole 1). Shows "Lock
//                      Teams 🪙" confirm button. User is expected
//                      to accept whatever the reel settled on.
//
//   mode="per-hole"  — in-round per-hole flip (holes 2-15). Shows
//                      "Flip for hole N" copy. Caller uses this
//                      each time the scorekeeper taps the per-
//                      hole Flip button.
//
// The reel itself is the same 6-frame animated shuffle either
// way (120ms × 6 frames ≈ 720ms of visual feedback). Both modes
// support a re-flip tap that restarts the animation — the
// scorekeeper can keep hitting it until the final frame looks
// appealing, then confirm.
//
// This component is PURELY presentational. It renders random
// teams from `generateFlipTeams(players)` and returns the chosen
// teams through `onConfirm`. Persistence + engine state live in
// the caller (CrybabyActiveRound); this component never touches
// the DB or navigates.
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export interface FlipReelProps {
  players: Player[];
  /** Confirm handler — caller decides what to do with the settled teams. */
  onConfirm: (teams: TeamInfo) => void;
  /** Optional cancel. Ignored by initial mode (round can't start without teams). */
  onCancel?: () => void;
  /** Visual + copy variant. Defaults to "initial" to match the legacy behaviour. */
  mode?: "initial" | "per-hole";
  /** For per-hole mode: the hole number to flip teams for. Drives the modal copy. */
  holeNumber?: number;
  /** Disable Confirm button until parent unblocks it (e.g., mid-network save). */
  confirmDisabled?: boolean;
  /** data-testid prefix for test addressability. */
  testIdPrefix?: string;
}

export default function FlipReel({
  players,
  onConfirm,
  onCancel,
  mode = "initial",
  holeNumber,
  confirmDisabled,
  testIdPrefix = "flip-reel",
}: FlipReelProps): JSX.Element {
  const [teams, setTeams] = useState<TeamInfo>(() => generateFlipTeams(players));
  const [animating, setAnimating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const reshuffle = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setAnimating(true);
    let count = 0;
    intervalRef.current = setInterval(() => {
      setTeams(generateFlipTeams(players));
      count++;
      if (count >= 6) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setAnimating(false);
      }
    }, 120);
  };

  const headingCopy = mode === "per-hole" && holeNumber
    ? `Flip for hole ${holeNumber}`
    : "Flip Teams";
  const subcopy = mode === "per-hole"
    ? "Random 3v2. Teams lock for this hole only."
    : "Randomly paired — tap to re-flip";
  const confirmCopy = mode === "per-hole" && holeNumber
    ? `Lock hole ${holeNumber} teams`
    : "Lock Teams 🪙";

  return (
    <div
      data-testid={`${testIdPrefix}-root`}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      }}
    >
      <div
        style={{
          background: "#FAF5EC", borderRadius: 24, padding: "28px 24px",
          maxWidth: 380, width: "100%", textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 8 }}>🪙</div>
        <div
          data-testid={`${testIdPrefix}-heading`}
          style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1E130A", marginBottom: 4 }}
        >
          {headingCopy}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginBottom: 20 }}>
          {subcopy}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <TeamCard team={teams.teamA} animating={animating} testId={`${testIdPrefix}-team-a`} />
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#A8957B" }}>VS</span>
          </div>
          <TeamCard team={teams.teamB} animating={animating} testId={`${testIdPrefix}-team-b`} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={reshuffle}
            disabled={animating}
            data-testid={`${testIdPrefix}-reshuffle`}
            style={{
              flex: 1, padding: "14px", borderRadius: 14, border: "none",
              cursor: animating ? "not-allowed" : "pointer",
              fontFamily: FONT, fontSize: 14, fontWeight: 700,
              background: "#EDE7D9", color: "#8B7355",
            }}
          >
            🔄 Re-flip
          </button>
          {mode === "per-hole" && onCancel && (
            <button
              onClick={onCancel}
              data-testid={`${testIdPrefix}-cancel`}
              style={{
                flex: 1, padding: "14px", borderRadius: 14, border: "1px solid #DDD0BB",
                background: "#FAF5EC", color: "#8B7355",
                fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => onConfirm(teams)}
            disabled={confirmDisabled || animating}
            data-testid={`${testIdPrefix}-confirm`}
            style={{
              flex: 1, padding: "14px", borderRadius: 14, border: "none",
              cursor: confirmDisabled || animating ? "not-allowed" : "pointer",
              fontFamily: FONT, fontSize: 14, fontWeight: 700,
              background: confirmDisabled || animating ? "#DDD0BB" : "#EC4899",
              color: confirmDisabled || animating ? "#A8957B" : "#fff",
            }}
          >
            {confirmCopy}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamCard({
  team, animating, testId,
}: {
  team: TeamInfo["teamA"];
  animating: boolean;
  testId: string;
}): JSX.Element {
  return (
    <div
      data-testid={testId}
      style={{
        flex: 1, padding: "16px 12px", borderRadius: 16,
        background: team.color + "10",
        border: `2px solid ${team.color}30`,
        transition: "all 0.2s ease",
        opacity: animating ? 0.5 : 1,
      }}
    >
      <div
        style={{
          fontSize: 11, fontWeight: 700, color: team.color,
          textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
        }}
      >
        {team.name}
      </div>
      {team.players.map(p => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 14, background: p.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: FONT,
            }}
          >
            {p.name[0]}
          </div>
          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1E130A" }}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}
