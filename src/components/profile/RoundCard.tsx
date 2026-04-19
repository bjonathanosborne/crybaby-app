import { Link } from "react-router-dom";
import type { UserRoundSummary } from "@/lib/db";
import {
  gameModeLabel,
  playerPnl,
  playerScore,
  partnerNames,
  formatCardDate,
} from "./roundMath";

// ============================================================
// RoundCard
//
// A single round's summary in the profile rounds list. Per spec
// (card IS NOT tappable outside the View details link):
//
//   Apr 15 • Austin Country Club
//   DOC • 82 (+10)                             +$40
//   With: Said, Grant, Tom
//   [View details →]
//
// ============================================================

const BRAND_GREEN = "#2D5016";
const BRAND_RED = "#DC2626";
const BRAND_BROWN = "#8B7355";
const BRAND_SAND = "#FAF5EC";
const BRAND_BORDER = "#DDD0BB";
const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export interface RoundCardProps {
  round: UserRoundSummary;
  /** The user whose profile we're on. Drives P&L + score row + partner filtering. */
  viewerUserId: string;
  /**
   * The "context year" that the card lives under (recent = current year,
   * inside expanded months = that month's year). Only used to decide
   * whether to suppress the year in the date label.
   */
  contextYear?: number;
  /** data-testid prefix, for addressable tests. */
  testIdPrefix?: string;
}

export default function RoundCard({
  round, viewerUserId, contextYear, testIdPrefix = "round-card",
}: RoundCardProps): JSX.Element {
  const score = playerScore(round, viewerUserId);
  const pnl = playerPnl(round, viewerUserId);
  const partners = partnerNames(round, viewerUserId);

  const diffStr = score
    ? score.diff === 0 ? "E" : score.diff > 0 ? `+${score.diff}` : `${score.diff}`
    : null;
  const isMoneyRound = pnl !== null;
  const pnlColor = pnl === null ? BRAND_BROWN
    : pnl > 0 ? BRAND_GREEN
    : pnl < 0 ? BRAND_RED
    : BRAND_BROWN;
  const pnlLabel = pnl === null ? ""
    : pnl > 0 ? `+$${pnl}`
    : pnl < 0 ? `−$${Math.abs(pnl)}`
    : "$0";

  return (
    <div
      data-testid={`${testIdPrefix}-${round.id}`}
      style={{
        background: "#fff",
        borderRadius: 14,
        border: `1px solid ${BRAND_BORDER}`,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: FONT,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Line 1: date • course */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E130A", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: BRAND_BROWN }}>{formatCardDate(round.created_at, contextYear)}</span>
          <span style={{ color: BRAND_BROWN, opacity: 0.5, margin: "0 6px" }}>•</span>
          <span>{round.course}</span>
        </div>
      </div>

      {/* Line 2: mode + score       +/- money */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: "#1E130A" }}>
          <span style={{ fontWeight: 700 }}>{gameModeLabel(round.game_type)}</span>
          {score && (
            <>
              <span style={{ color: BRAND_BROWN, margin: "0 6px" }}>•</span>
              <span>{score.total}</span>
              {diffStr !== null && (
                <span style={{ color: BRAND_BROWN, marginLeft: 6 }}>({diffStr})</span>
              )}
            </>
          )}
        </div>
        {isMoneyRound && (
          <span
            data-testid={`${testIdPrefix}-${round.id}-pnl`}
            style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: pnlColor }}
          >
            {pnlLabel}
          </span>
        )}
      </div>

      {/* Line 3: partners */}
      {partners.names.length > 0 && (
        <div style={{ fontSize: 12, color: BRAND_BROWN }}>
          <span style={{ fontWeight: 600 }}>With:</span>{" "}
          {partners.names.join(", ")}
          {partners.overflow > 0 && <span>… and {partners.overflow} more</span>}
        </div>
      )}

      {/* Line 4: View details link */}
      <Link
        to={`/round/${round.id}/summary`}
        data-testid={`${testIdPrefix}-${round.id}-details`}
        style={{
          marginTop: 2,
          alignSelf: "flex-start",
          fontSize: 12,
          fontWeight: 700,
          color: BRAND_GREEN,
          textDecoration: "none",
        }}
      >
        View details →
      </Link>
      {/* Tiny helper to make the link stand out on tap on mobile (no hover CSS). */}
      <style>{`
        [data-testid="${testIdPrefix}-${round.id}-details"]:active {
          opacity: 0.6;
        }
      `}</style>
      {/* Spacer */}
      <div style={{ height: 0 }} />
      {/* Card background variant when not focused — keeps visual density low */}
      <div style={{ background: BRAND_SAND, height: 0 }} />
    </div>
  );
}
