import { useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/gameEngines";
import { identifyCrybaby, type CrybabyIdentification } from "@/lib/flipCrybaby";

// ============================================================
// CrybabyTransition — the hole 15 → 16 handoff screen.
//
// Renders after the Flip base game settles and before crybaby-phase
// scoring begins. Responsibilities:
//   1. Show final hole-1-to-15 standings (each player + their balance).
//   2. Announce the crybaby (largest negative balance).
//   3. If a tiebreaker was needed, show a short animated reel that
//      lands on the seeded winner. The reel is cosmetic — the winner
//      is already decided deterministically by `identifyCrybaby()`
//      using `round.id` as seed. The reel just surfaces the math.
//   4. "Begin Crybaby" button dismisses the screen and advances the
//      caller's flow (host calls `onBegin(identification)` with the
//      resolved crybaby info so it can stamp CrybabyState + persist).
//
// If no one is in the hole (all balances >= 0), the component still
// renders the standings but the crybaby announcement shows an
// "all-square" message and the button copy becomes "Continue to 16-18".
// The host decides whether to skip the sub-game entirely; this screen
// just surfaces the state cleanly.
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export interface CrybabyTransitionProps {
  players: Player[];
  /** Balances from holes 1-15, keyed by player id. Positive = winnings. */
  balances: Record<string, number>;
  /**
   * Seed source for the deterministic tiebreaker. Pass `round.id`
   * verbatim so audit replay always picks the same crybaby.
   */
  roundId: string;
  /** Called after the scorekeeper taps "Begin Crybaby". */
  onBegin: (identification: CrybabyIdentification) => void;
  /** Test id prefix for addressable tests. */
  testIdPrefix?: string;
}

export default function CrybabyTransition({
  players,
  balances,
  roundId,
  onBegin,
  testIdPrefix = "crybaby-transition",
}: CrybabyTransitionProps): JSX.Element {
  const identification = identifyCrybaby(balances, roundId);
  const { crybaby, losingBalance, maxBetPerHole, tiebreakOutcome } = identification;
  const tiedPlayers = tiebreakOutcome?.tied ?? [];
  const needsTiebreakReel = tiedPlayers.length > 1;

  // Tiebreak reel state — only runs when the crybaby came from a tiebreaker.
  // The reel cycles through tied names for ~2s then locks on the winner.
  // We never re-pick; the winner was already decided by identifyCrybaby().
  const [reelFrame, setReelFrame] = useState<number>(0);
  const [reelDone, setReelDone] = useState<boolean>(!needsTiebreakReel);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!needsTiebreakReel) return;
    let count = 0;
    intervalRef.current = setInterval(() => {
      count++;
      setReelFrame(count);
      if (count >= 12) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setReelDone(true);
      }
    }, 160);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [needsTiebreakReel]);

  const nameFor = (id: string): string => players.find(p => p.id === id)?.name ?? id;
  const sortedPlayers = [...players].sort(
    (a, b) => (balances[a.id] ?? 0) - (balances[b.id] ?? 0),
  );
  const reelDisplayName = needsTiebreakReel && !reelDone
    ? nameFor(tiedPlayers[reelFrame % tiedPlayers.length])
    : crybaby
      ? nameFor(crybaby)
      : null;

  return (
    <div
      data-testid={`${testIdPrefix}-root`}
      style={{
        maxWidth: 420, margin: "0 auto", minHeight: "100vh",
        background: "#F5EFE0", fontFamily: FONT,
        paddingTop: 40, paddingBottom: 140,
      }}
    >
      <div style={{ padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🍼</div>
        <div
          style={{
            fontFamily: "'Pacifico', cursive", fontSize: 26, color: "#2D5016", lineHeight: 1.1,
          }}
        >
          Crybaby Time
        </div>
        <div style={{ fontSize: 13, color: "#8B7355", marginTop: 6 }}>
          Base game wrapped after hole 15. Standings below.
        </div>
      </div>

      {/* Standings */}
      <div
        data-testid={`${testIdPrefix}-standings`}
        style={{
          margin: "20px 16px 0",
          background: "#FAF5EC",
          border: "1px solid #DDD0BB",
          borderRadius: 16,
          padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11, fontWeight: 700, color: "#8B7355",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}
        >
          Holes 1-15 standings
        </div>
        {sortedPlayers.map(p => {
          const bal = balances[p.id] ?? 0;
          const isCrybaby = p.id === crybaby;
          const color = bal > 0 ? "#16A34A" : bal < 0 ? "#DC2626" : "#8B7355";
          return (
            <div
              key={p.id}
              data-testid={`${testIdPrefix}-row-${p.id}`}
              data-crybaby={isCrybaby ? "true" : "false"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", borderRadius: 10,
                background: isCrybaby ? "#FEF2F2" : "#fff",
                border: `1px solid ${isCrybaby ? "#FCA5A5" : "#EDE7D9"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {isCrybaby && (
                  <span aria-hidden="true" style={{ fontSize: 16 }}>🍼</span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1E130A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name}
                </span>
              </div>
              <span
                style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color }}
              >
                {bal > 0 ? `+$${bal}` : bal < 0 ? `−$${Math.abs(bal)}` : "$0"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Crybaby announcement */}
      <div
        data-testid={`${testIdPrefix}-announcement`}
        style={{
          margin: "16px 16px 0",
          background: crybaby ? "#FEF3C7" : "#EEF5E5",
          border: `1px solid ${crybaby ? "#D4AF37" : "#86EFAC"}`,
          borderRadius: 16,
          padding: "16px 18px",
          textAlign: "center",
        }}
      >
        {crybaby ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Crybaby
            </div>
            {needsTiebreakReel && !reelDone ? (
              <div
                data-testid={`${testIdPrefix}-tiebreak-reel`}
                style={{
                  fontFamily: "'Pacifico', cursive", fontSize: 28, color: "#1E130A",
                  marginTop: 4, lineHeight: 1.2,
                }}
              >
                {reelDisplayName}…
              </div>
            ) : (
              <>
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 28, color: "#2D5016", marginTop: 4, lineHeight: 1.2 }}>
                  {nameFor(crybaby)}
                </div>
                <div
                  data-testid={`${testIdPrefix}-cap-math`}
                  style={{ fontSize: 13, color: "#8B7355", marginTop: 6, lineHeight: 1.4 }}
                >
                  Down ${losingBalance} through hole 15.<br />
                  Can bet up to <span style={{ fontWeight: 800, color: "#1E130A" }}>${maxBetPerHole}</span>/hole (50% of the loss, rounded to even).
                </div>
                {tiebreakOutcome && (
                  <div
                    data-testid={`${testIdPrefix}-tiebreak-reveal`}
                    style={{
                      fontSize: 11, color: "#8B7355", marginTop: 8, fontStyle: "italic",
                    }}
                  >
                    {tiebreakOutcome.tied.map(nameFor).join(" and ")} tied. The coin flip picked {nameFor(tiebreakOutcome.winner)}.
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              All Square
            </div>
            <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 22, color: "#2D5016", marginTop: 4, lineHeight: 1.2 }}>
              Nobody's in the hole
            </div>
            <div style={{ fontSize: 12, color: "#8B7355", marginTop: 6, lineHeight: 1.4 }}>
              No crybaby this round. Holes 16-18 continue the base game.
            </div>
          </>
        )}
      </div>

      {/* Begin button */}
      <div style={{ padding: "24px 16px 0" }}>
        <button
          type="button"
          onClick={() => onBegin(identification)}
          disabled={needsTiebreakReel && !reelDone}
          data-testid={`${testIdPrefix}-begin`}
          aria-label={crybaby ? "Begin crybaby phase" : "Continue to holes 16-18"}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            border: "none",
            cursor: (needsTiebreakReel && !reelDone) ? "not-allowed" : "pointer",
            fontFamily: "'Pacifico', cursive",
            fontSize: 18,
            background: (needsTiebreakReel && !reelDone) ? "#DDD0BB" : "#2D5016",
            color: (needsTiebreakReel && !reelDone) ? "#A8957B" : "#fff",
            boxShadow: (needsTiebreakReel && !reelDone) ? "none" : "0 4px 16px rgba(45,80,22,0.25)",
            transition: "all 0.2s ease",
          }}
        >
          {crybaby ? "Begin Crybaby 🍼" : "Continue to 16-18 →"}
        </button>
      </div>
    </div>
  );
}
