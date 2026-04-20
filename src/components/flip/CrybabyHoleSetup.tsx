import { useState, useMemo } from "react";
import type { Player, TeamInfo } from "@/lib/gameEngines";
import { computeOpponentStake } from "@/lib/gameEngines";

// ============================================================
// CrybabyHoleSetup — pre-hole bet + partner picker (holes 16-18).
//
// Renders once per crybaby hole. Scorekeeper picks:
//   1. Bet amount — even dollars, min $2, max CrybabyState.maxBetPerHole.
//   2. Partner — one of the 4 non-crybaby players.
//
// Shows a live stakes preview so the table sees exactly what money
// is at risk before committing. On Confirm, calls onConfirm with the
// resolved { bet, partner, teams } shape — caller persists into
// CrybabyState.byHole[holeNumber] and advances to scoring.
//
// The bet picker is a stepper (±$2) + quick-pick chips. Values
// exceeding maxBetPerHole are disabled in the UI so the even-bet
// + cap invariant is impossible to violate from this component.
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export interface CrybabyHoleSetupProps {
  /** Current hole number (16, 17, or 18). Drives the copy. */
  holeNumber: number;
  /** All 5 round players. */
  players: Player[];
  /** Player id of the crybaby (from CrybabyState). */
  crybabyId: string;
  /** Pre-computed cap from hole 15. Even dollar. Does NOT update mid-crybaby. */
  maxBetPerHole: number;
  /**
   * Called when the scorekeeper taps Confirm. Payload is the
   * finalised hole choice ready for CrybabyState.byHole[holeNumber].
   */
  onConfirm: (choice: { bet: number; partner: string; teams: TeamInfo }) => void;
  /** data-testid prefix for addressable tests. */
  testIdPrefix?: string;
}

export default function CrybabyHoleSetup({
  holeNumber,
  players,
  crybabyId,
  maxBetPerHole,
  onConfirm,
  testIdPrefix = "crybaby-hole-setup",
}: CrybabyHoleSetupProps): JSX.Element {
  const crybaby = players.find(p => p.id === crybabyId);
  const candidates = useMemo(
    () => players.filter(p => p.id !== crybabyId),
    [players, crybabyId],
  );

  const [bet, setBet] = useState<number>(Math.min(2, maxBetPerHole || 2));
  const [partnerId, setPartnerId] = useState<string | null>(null);

  const opponentStake = computeOpponentStake(bet);
  const twoManPot = bet * 2;
  const threeManPot = opponentStake * 3;
  const totalPot = twoManPot + threeManPot;

  const isBetValid = bet > 0 && bet % 2 === 0 && bet <= maxBetPerHole;
  const partnerValid = partnerId !== null && partnerId !== crybabyId;
  const canConfirm = isBetValid && partnerValid;

  const handleConfirm = () => {
    if (!canConfirm || !partnerId) return;
    const partner = players.find(p => p.id === partnerId);
    if (!partner || !crybaby) return;
    const twoManSet = new Set([crybabyId, partnerId]);
    const threeMan = players.filter(p => !twoManSet.has(p.id));
    const teams: TeamInfo = {
      teamA: {
        name: "Crybaby + Partner",
        players: [crybaby, partner],
        color: "#EC4899",
      },
      teamB: {
        name: "Others",
        players: threeMan,
        color: "#3B82F6",
      },
    };
    onConfirm({ bet, partner: partnerId, teams });
  };

  const incBet = () => { if (bet + 2 <= maxBetPerHole) setBet(bet + 2); };
  const decBet = () => { if (bet - 2 >= 2) setBet(bet - 2); };
  const quickChips = [2, 4, 6, 10, 20].filter(v => v <= maxBetPerHole);

  return (
    <div
      data-testid={`${testIdPrefix}-root`}
      style={{
        maxWidth: 420, margin: "0 auto", minHeight: "100vh",
        background: "#F5EFE0", fontFamily: FONT,
        paddingTop: 32, paddingBottom: 140,
      }}
    >
      <div style={{ padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 6 }}>🍼</div>
        <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 26, color: "#2D5016", lineHeight: 1.1 }}>
          Hole {holeNumber} — Crybaby's Call
        </div>
        <div style={{ fontSize: 13, color: "#8B7355", marginTop: 6 }}>
          {crybaby?.name ?? "Crybaby"} picks the bet + a partner.
        </div>
      </div>

      {/* Bet picker */}
      <div
        data-testid={`${testIdPrefix}-bet-card`}
        style={{
          margin: "18px 16px 0", padding: "16px 18px",
          background: "#FAF5EC", border: "1px solid #DDD0BB",
          borderRadius: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Crybaby's Bet
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <button
            type="button"
            data-testid={`${testIdPrefix}-bet-decrement`}
            onClick={decBet}
            disabled={bet <= 2}
            style={{
              width: 48, height: 48, borderRadius: 24, border: "none",
              background: "#EDE7D9", cursor: bet <= 2 ? "not-allowed" : "pointer",
              fontSize: 22, fontWeight: 700, color: "#8B7355",
              opacity: bet <= 2 ? 0.5 : 1,
            }}
          >−</button>
          <div
            data-testid={`${testIdPrefix}-bet-value`}
            style={{ fontFamily: MONO, fontSize: 44, fontWeight: 800, color: "#1E130A", minWidth: 100, textAlign: "center" }}
          >
            ${bet}
          </div>
          <button
            type="button"
            data-testid={`${testIdPrefix}-bet-increment`}
            onClick={incBet}
            disabled={bet + 2 > maxBetPerHole}
            style={{
              width: 48, height: 48, borderRadius: 24, border: "none",
              background: "#2D5016", cursor: bet + 2 > maxBetPerHole ? "not-allowed" : "pointer",
              fontSize: 22, fontWeight: 700, color: "#fff",
              opacity: bet + 2 > maxBetPerHole ? 0.5 : 1,
            }}
          >+</button>
        </div>
        {quickChips.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {quickChips.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setBet(v)}
                data-testid={`${testIdPrefix}-bet-chip-${v}`}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: MONO, fontSize: 12, fontWeight: 700,
                  background: bet === v ? "#1E130A" : "#EDE7D9",
                  color: bet === v ? "#fff" : "#8B7355",
                }}
              >${v}</button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "#A8957B" }}>
          Cap: ${maxBetPerHole} (50% of loss through hole 15).
        </div>
      </div>

      {/* Partner picker */}
      <div
        data-testid={`${testIdPrefix}-partner-card`}
        style={{
          margin: "12px 16px 0", padding: "16px 18px",
          background: "#FAF5EC", border: "1px solid #DDD0BB",
          borderRadius: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Partner
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {candidates.map(p => {
            const selected = partnerId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPartnerId(p.id)}
                aria-pressed={selected}
                data-testid={`${testIdPrefix}-partner-${p.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10,
                  border: selected ? "2px solid #EC4899" : "1px solid #DDD0BB",
                  background: selected ? "#FEF2F2" : "#fff",
                  cursor: "pointer",
                  fontFamily: FONT, textAlign: "left",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 16, background: p.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                }}>{p.name[0]}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{p.name}</span>
                {selected && <span style={{ marginLeft: "auto", fontSize: 18 }}>🪙</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stakes preview */}
      <div
        data-testid={`${testIdPrefix}-stakes-preview`}
        style={{
          margin: "12px 16px 0", padding: "14px 16px",
          background: "#FEF9E7", border: "1px solid #D4AF37",
          borderRadius: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Stakes Preview
        </div>
        <div style={{ fontSize: 13, color: "#1E130A", lineHeight: 1.6 }}>
          {crybaby?.name ?? "Crybaby"} bets <span style={{ fontFamily: MONO, fontWeight: 800 }}>${bet}</span>.<br />
          Partner bets <span style={{ fontFamily: MONO, fontWeight: 800 }}>${bet}</span>.<br />
          Each of 3 opponents bets <span style={{ fontFamily: MONO, fontWeight: 800 }}>${opponentStake}</span>.<br />
          Total pot: <span style={{ fontFamily: MONO, fontWeight: 800, color: "#2D5016" }}>${totalPot}</span>.
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: "#8B7355", fontStyle: "italic" }}>
          2-man wins → each gets ${(3 * opponentStake) / 2}. 3-man wins → each gets ${(2 * bet / 3).toFixed(bet % 3 === 0 ? 0 : 2)}.
        </div>
      </div>

      {/* Confirm */}
      <div style={{ padding: "24px 16px 0" }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          data-testid={`${testIdPrefix}-confirm`}
          aria-label={`Confirm hole ${holeNumber} setup`}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            fontFamily: "'Pacifico', cursive", fontSize: 18,
            cursor: canConfirm ? "pointer" : "not-allowed",
            background: canConfirm ? "#2D5016" : "#DDD0BB",
            color: canConfirm ? "#fff" : "#A8957B",
            boxShadow: canConfirm ? "0 4px 16px rgba(45,80,22,0.25)" : "none",
          }}
        >
          {canConfirm ? `Lock it in → hole ${holeNumber}` : "Pick a bet + partner"}
        </button>
      </div>
    </div>
  );
}
