import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { loadRoundDetail, type RoundDetailBundle } from "@/lib/db";
import ScorecardView, { buildScorecardPlayers } from "@/components/round-detail/ScorecardView";
import GridView from "@/components/round-detail/GridView";
import { normaliseHoleScores, sum } from "@/components/round-detail/scoreDecor";
import { gameModeLabel, formatCardDate } from "@/components/profile/roundMath";
import {
  resolveHandicapPercent,
  shouldShowHandicapPercentLine,
} from "@/lib/handicap";
import { getStrokesOnHole } from "@/lib/gameEngines";

// ============================================================
// RoundDetailPage — /round/:id/summary
//
// Route-level component reachable from every profile's
// round-card "View details →" link. Per spec:
//   - Back button (top-left, navigate(-1))
//   - Header: date, course, mode, viewer's total + P&L
//   - Segmented toggle: Scorecard / Grid
//   - Hole-by-hole breakdown for all players
//   - Settlement + "View all events" expandable
// ============================================================

const BRAND_GREEN = "#2D5016";
const BRAND_RED = "#DC2626";
const BRAND_BROWN = "#8B7355";
const BRAND_SAND = "#F5EFE0";
const BRAND_SAND_2 = "#FAF5EC";
const BRAND_BORDER = "#DDD0BB";
const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";
const PACIFICO = "'Pacifico', cursive";

type ViewMode = "scorecard" | "grid";

export default function RoundDetailPage(): JSX.Element {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("scorecard");
  const [showEvents, setShowEvents] = useState(false);

  const query = useQuery({
    queryKey: ["roundDetail", roundId],
    queryFn: () => loadRoundDetail(roundId!),
    enabled: Boolean(roundId),
    staleTime: 2 * 60 * 1000,
  });

  const bundle: RoundDetailBundle | undefined = query.data;

  // --- Derived ---
  const pars: number[] = useMemo(
    () => bundle?.round.course_details?.pars ?? Array(18).fill(4),
    [bundle?.round.course_details?.pars],
  );
  const handicaps: number[] | undefined = bundle?.round.course_details?.handicaps;
  const holes = useMemo(() => Math.min(pars.length, 18) || 18, [pars]);

  const scorecardPlayers = useMemo(() => {
    if (!bundle) return [];
    return buildScorecardPlayers(bundle.players, user?.id, bundle.participant_names);
  }, [bundle, user?.id]);

  const viewerPlayer = bundle?.players.find(p => p.user_id === user?.id);
  const viewerTotal = viewerPlayer
    ? sum(normaliseHoleScores(viewerPlayer.hole_scores).slice(0, holes))
    : null;
  const viewerDiff = viewerTotal !== null
    ? viewerTotal - sum(pars.slice(0, holes))
    : null;

  const viewerPnl = bundle?.settlements.find(s => s.user_id === user?.id)?.amount ?? null;
  const isMoneyRound = (bundle?.settlements.length ?? 0) > 0;

  // PR #19 Handicap B — net totals when every player in the round has
  // a locked handicap in their playerConfig entry. Computed from
  // `getStrokesOnHole` over the hole handicap ranks + the course's
  // own handicaps array; the round's `handicap_percent` is already
  // applied at lock time, so scale=100 here (no double-scaling).
  //
  // Falls back to gross-only when ANY player is missing a handicap —
  // the UX read ("Alice played better relative to skill") is only
  // meaningful when every player contributes a handicap.
  const netLeaderboard = useMemo((): Array<{ playerId: string; name: string; gross: number; strokes: number; net: number }> | null => {
    if (!bundle) return null;
    const playerConfigs = bundle.round.course_details?.playerConfig ?? [];
    const handicapRanks = bundle.round.course_details?.handicaps;
    if (!handicapRanks || handicapRanks.length === 0) return null;
    if (playerConfigs.length === 0 || playerConfigs.length !== bundle.players.length) return null;
    // All-or-nothing gate — any null handicap, fall back to gross.
    const allHaveHcp = playerConfigs.every(pc => typeof pc.handicap === "number" && pc.handicap !== null);
    if (!allHaveHcp) return null;

    const hcpValues = playerConfigs.map(pc => pc.handicap as number);
    const lowestHcp = Math.min(...hcpValues);
    const rounded = (h: number) => h; // strokes calc in getStrokesOnHole handles rounding

    // Map by array index (playerConfig[i] aligns with bundle.players[i]
    // at round-creation time per db.ts createRound ordering).
    return bundle.players.map((p, i) => {
      const pc = playerConfigs[i];
      const hcp = rounded(pc.handicap as number);
      const grossScores = normaliseHoleScores(p.hole_scores).slice(0, holes);
      const gross = sum(grossScores);
      let strokes = 0;
      for (let h = 0; h < holes; h++) {
        strokes += getStrokesOnHole(hcp, lowestHcp, handicapRanks[h], 100);
      }
      const net = gross - strokes;
      const name = p.user_id
        ? bundle.participant_names[p.user_id] || p.guest_name || "Player"
        : p.guest_name || "Guest";
      return { playerId: p.id, name, gross, strokes, net };
    }).sort((a, b) => a.net - b.net);
  }, [bundle, holes]);

  const settlementRows = useMemo(() => {
    if (!bundle) return [];
    return bundle.settlements.map(s => ({
      name: s.user_id
        ? bundle.participant_names[s.user_id] || s.guest_name || "Player"
        : s.guest_name || "Guest",
      amount: s.amount,
      baseAmount: s.base_amount,
      crybabyAmount: s.crybaby_amount,
      manual: s.is_manual_adjustment === true,
    }));
  }, [bundle]);

  // C7: Flip rounds get a three-line breakdown per player. A settlement
  // row has the split iff EITHER base_amount or crybaby_amount is non-null
  // — the DB schema allows null for legacy/non-Flip rounds so we defensively
  // check both before switching UI shape.
  const hasFlipSplit = bundle?.round.game_type === "flip"
    && bundle?.settlements.some(
      s => (s.base_amount !== null && s.base_amount !== undefined)
        || (s.crybaby_amount !== null && s.crybaby_amount !== undefined),
    );

  // --- Render ---
  if (query.isLoading) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: BRAND_SAND, padding: 16 }}>
        <HeaderWithBack onBack={() => navigate(-1)} />
        <div style={{ padding: 24, textAlign: "center", color: BRAND_BROWN, fontFamily: FONT }}>Loading round…</div>
      </div>
    );
  }
  if (query.isError || !bundle) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: BRAND_SAND, padding: 16 }}>
        <HeaderWithBack onBack={() => navigate(-1)} />
        <div
          data-testid="round-detail-error"
          style={{ padding: 24, textAlign: "center", color: BRAND_RED, fontFamily: FONT }}
        >
          Round not found.
        </div>
      </div>
    );
  }

  const round = bundle.round;

  return (
    <div
      data-testid="round-detail-page"
      style={{
        maxWidth: 600,
        margin: "0 auto",
        minHeight: "100vh",
        background: BRAND_SAND,
        padding: "12px 16px 80px",
        fontFamily: FONT,
      }}
    >
      <HeaderWithBack onBack={() => navigate(-1)} />

      {/* Round summary header */}
      <div
        data-testid="round-detail-header"
        style={{
          marginTop: 10,
          padding: "16px 18px",
          borderRadius: 14,
          background: "#fff",
          border: `1px solid ${BRAND_BORDER}`,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontFamily: PACIFICO, fontSize: 22, color: BRAND_GREEN, lineHeight: 1.1 }}>
          {round.course}
        </div>
        <div style={{ fontSize: 12, color: BRAND_BROWN }}>
          {formatCardDate(round.created_at)} · {gameModeLabel(round.game_type)}
          {round.course_details?.selectedTee && <> · {round.course_details.selectedTee} tees</>}
        </div>
        {(() => {
          // PR #17 commit 2: surface the per-round handicap scale when it's
          // non-default. Legacy rounds (null `rounds.handicap_percent`) read
          // via the fallback chain to `course_details.mechanicSettings.pops.
          // handicapPercent` → 100. A non-default value earns a summary line
          // + per-player "adjusted (pct% of raw)" rows; 100% stays hidden
          // to avoid clutter on full-handicap rounds.
          const resolved = resolveHandicapPercent(
            { handicap_percent: round.handicap_percent },
            round.course_details,
          );
          if (!shouldShowHandicapPercentLine(resolved)) return null;
          const playerConfigs = round.course_details?.playerConfig ?? [];
          const showPerPlayer = playerConfigs.some(
            pc => typeof pc.rawHandicap === "number" && pc.rawHandicap !== null,
          );
          return (
            <>
              <div
                data-testid="round-detail-handicap-percent"
                style={{ fontSize: 12, color: BRAND_BROWN, fontStyle: "italic" }}
              >
                Playing at {resolved}% handicap
              </div>
              {showPerPlayer && (
                <div
                  data-testid="round-detail-handicap-per-player"
                  style={{
                    marginTop: 6,
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: BRAND_SAND_2,
                    border: `1px solid ${BRAND_BORDER}`,
                    display: "flex", flexDirection: "column", gap: 2,
                  }}
                >
                  {playerConfigs.map((pc, i) => {
                    const raw = typeof pc.rawHandicap === "number" ? pc.rawHandicap : null;
                    const adjusted = typeof pc.handicap === "number" ? pc.handicap : null;
                    return (
                      <div
                        key={i}
                        data-testid={`round-detail-handicap-player-${i}`}
                        style={{
                          display: "flex", justifyContent: "space-between",
                          fontSize: 11, color: "#1E130A",
                        }}
                      >
                        <span>{pc.name ?? `Player ${i + 1}`}</span>
                        <span style={{ fontFamily: MONO, color: BRAND_BROWN }}>
                          {adjusted === null || raw === null
                            ? "—"
                            : resolved === 100
                              ? String(raw)
                              : `${adjusted} (${resolved}% of ${raw})`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
        {viewerTotal !== null && (
          <div
            data-testid="round-detail-viewer-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${BRAND_BORDER}`,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Your round
            </span>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#1E130A" }}>
              {viewerTotal}
            </span>
            {viewerDiff !== null && (
              <span style={{ fontSize: 12, color: viewerDiff === 0 ? BRAND_BROWN : viewerDiff > 0 ? BRAND_RED : BRAND_GREEN }}>
                ({viewerDiff === 0 ? "E" : viewerDiff > 0 ? `+${viewerDiff}` : viewerDiff})
              </span>
            )}
            {isMoneyRound && viewerPnl !== null && (
              <span
                data-testid="round-detail-viewer-pnl"
                style={{
                  marginLeft: "auto",
                  fontFamily: MONO, fontSize: 16, fontWeight: 800,
                  color: viewerPnl > 0 ? BRAND_GREEN : viewerPnl < 0 ? BRAND_RED : BRAND_BROWN,
                }}
              >
                {viewerPnl > 0 ? `+$${viewerPnl}` : viewerPnl < 0 ? `−$${Math.abs(viewerPnl)}` : "$0"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Toggle */}
      <div
        role="group"
        aria-label="Scorecard view toggle"
        data-testid="round-detail-toggle"
        style={{
          display: "inline-flex",
          gap: 0,
          marginTop: 14,
          padding: 4,
          borderRadius: 10,
          background: BRAND_SAND_2,
          border: `1px solid ${BRAND_BORDER}`,
          alignSelf: "flex-start",
        }}
      >
        {(["scorecard", "grid"] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setViewMode(m)}
            aria-pressed={viewMode === m}
            data-testid={`toggle-${m}`}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: viewMode === m ? BRAND_GREEN : "transparent",
              color: viewMode === m ? "#fff" : BRAND_BROWN,
            }}
          >
            {m === "scorecard" ? "Scorecard" : "Grid"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ marginTop: 10 }}>
        {viewMode === "scorecard" ? (
          <ScorecardView
            pars={pars}
            handicaps={handicaps}
            players={scorecardPlayers}
            holes={holes}
          />
        ) : (
          <GridView pars={pars} players={scorecardPlayers} holes={holes} />
        )}
      </div>

      {/* PR #19 Handicap B — Net leaderboard. Shows only when every
          player in the round has a locked handicap in their
          playerConfig entry. Sorted by net ascending (lowest best).
          Gross is shown alongside for context. */}
      {netLeaderboard && netLeaderboard.length > 0 && (
        <div
          data-testid="round-detail-net-leaderboard"
          style={{
            marginTop: 14,
            padding: "14px 16px",
            borderRadius: 14,
            background: "#fff",
            border: `1px solid ${BRAND_BORDER}`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Net Totals
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {netLeaderboard.map((row, i) => (
              <div
                key={row.playerId}
                data-testid={`round-detail-net-row-${i}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span style={{ fontSize: 14, color: "#1E130A" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: BRAND_BROWN, marginRight: 8 }}>
                    {i + 1}
                  </span>
                  {row.name}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 13 }}>
                  <span
                    data-testid={`round-detail-net-${i}`}
                    style={{ fontWeight: 800, color: "#1E130A" }}
                  >
                    {row.net}
                  </span>
                  <span
                    data-testid={`round-detail-net-gross-${i}`}
                    style={{ marginLeft: 6, color: BRAND_BROWN }}
                  >
                    ({row.gross} − {row.strokes})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlement */}
      {isMoneyRound && (
        <div
          data-testid="round-detail-settlement"
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 14,
            background: "#fff",
            border: `1px solid ${BRAND_BORDER}`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Settlement
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: hasFlipSplit ? 12 : 6 }}>
            {settlementRows.map((s, i) => {
              // C7: Flip rounds show a three-line breakdown per player —
              // base (holes 1-15), crybaby (holes 16-18), combined total.
              // Non-Flip rounds use the original single-line layout.
              if (hasFlipSplit) {
                const base = typeof s.baseAmount === "number" ? s.baseAmount : null;
                const crybaby = typeof s.crybabyAmount === "number" ? s.crybabyAmount : null;
                return (
                  <div
                    key={i}
                    data-testid={`round-detail-settlement-row-${i}`}
                    data-split="flip"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: BRAND_SAND_2,
                      border: `1px solid ${BRAND_BORDER}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1E130A" }}>
                        {s.name}
                        {s.manual && <span style={{ marginLeft: 6, fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>ADJUSTED</span>}
                      </span>
                      <span
                        data-testid={`round-detail-settlement-combined-${i}`}
                        style={{
                          fontFamily: MONO, fontSize: 16, fontWeight: 800,
                          color: s.amount > 0 ? BRAND_GREEN : s.amount < 0 ? BRAND_RED : BRAND_BROWN,
                        }}
                      >
                        {s.amount > 0 ? `+$${s.amount}` : s.amount < 0 ? `−$${Math.abs(s.amount)}` : "$0"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <SettlementSplitLine
                        label="Base game (1-15)"
                        amount={base}
                        testId={`round-detail-settlement-base-${i}`}
                      />
                      <SettlementSplitLine
                        label="Crybaby (16-18)"
                        amount={crybaby}
                        testId={`round-detail-settlement-crybaby-${i}`}
                      />
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: "#1E130A" }}>
                    {s.name}
                    {s.manual && <span style={{ marginLeft: 6, fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>ADJUSTED</span>}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 14, fontWeight: 800,
                    color: s.amount > 0 ? BRAND_GREEN : s.amount < 0 ? BRAND_RED : BRAND_BROWN,
                  }}>
                    {s.amount > 0 ? `+$${s.amount}` : s.amount < 0 ? `−$${Math.abs(s.amount)}` : "$0"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events disclosure */}
      {bundle.events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowEvents(o => !o)}
            aria-expanded={showEvents}
            data-testid="round-detail-events-toggle"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${BRAND_BORDER}`,
              background: "#fff",
              fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#1E130A",
              cursor: "pointer",
            }}
          >
            <span>View all events ({bundle.events.length})</span>
            {showEvents ? <ChevronDown size={16} color={BRAND_BROWN} /> : <ChevronRight size={16} color={BRAND_BROWN} />}
          </button>
          {showEvents && (
            <div
              data-testid="round-detail-events-list"
              style={{
                marginTop: 8, padding: "10px 14px", borderRadius: 10,
                background: BRAND_SAND_2, border: `1px solid ${BRAND_BORDER}`,
                display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto",
              }}
            >
              {bundle.events.map(ev => {
                const data = (ev.event_data || {}) as Record<string, unknown>;
                const msg = typeof data["message"] === "string" ? (data["message"] as string) : ev.event_type;
                return (
                  <div key={ev.id} style={{ fontSize: 12, color: "#1E130A" }}>
                    <span style={{ color: BRAND_BROWN, fontFamily: MONO, marginRight: 8 }}>
                      {ev.hole_number ? `H${String(ev.hole_number).padStart(2, "0")}` : "—"}
                    </span>
                    {msg}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeaderWithBack({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        data-testid="round-detail-back"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 2,
          color: BRAND_BROWN,
          fontFamily: FONT, fontSize: 13, fontWeight: 600,
        }}
      >
        <ChevronLeft size={18} /> Back
      </button>
    </div>
  );
}

/**
 * C7: Single line of the Flip settlement split (base 1-15 or crybaby 16-18).
 * Label on the left in muted brown; signed amount on the right in mono,
 * green for positive, red for negative, muted "—" when null (legacy rows
 * that never got the two-component split written).
 */
function SettlementSplitLine({
  label,
  amount,
  testId,
}: {
  label: string;
  amount: number | null;
  testId: string;
}): JSX.Element {
  const color =
    amount === null
      ? BRAND_BROWN
      : amount > 0
        ? BRAND_GREEN
        : amount < 0
          ? BRAND_RED
          : BRAND_BROWN;
  const display =
    amount === null
      ? "—"
      : amount > 0
        ? `+$${amount}`
        : amount < 0
          ? `−$${Math.abs(amount)}`
          : "$0";
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span style={{ fontSize: 12, color: BRAND_BROWN }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color }}>
        {display}
      </span>
    </div>
  );
}
