import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { loadUserRounds, type UserRoundSummary } from "@/lib/db";
import {
  applyDateFilter,
  cumulativePnl,
  groupRounds,
  type DateFilter,
} from "./roundMath";
import RoundCard from "./RoundCard";

// ============================================================
// ProfileRoundsList
//
// Rounds section for the profile page. Three sub-sections:
//   A. Recent (always expanded, 5 most-recent strict)
//   B. Current-year months (collapsed by default, multi-expand)
//   C. Prior years → months (two-level expand)
//
// P&L computations happen client-side over the filtered round set.
// Data comes from loadUserRounds (1 rounds query + 1 settlements
// query + 1 profiles query, no N+1).
// ============================================================

const BRAND_GREEN = "#2D5016";
const BRAND_RED = "#DC2626";
const BRAND_BROWN = "#8B7355";
const BRAND_SAND = "#FAF5EC";
const BRAND_BORDER = "#DDD0BB";
const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";
const PACIFICO = "'Pacifico', cursive";

export interface ProfileRoundsListProps {
  /** User whose rounds we're listing (own profile OR someone else's). */
  targetUserId: string;
  /** The authenticated viewer. Drives privacy filtering and per-round P&L. */
  viewerUserId: string;
  /**
   * Set when the target user has rounds_visible_to_friends=false AND
   * target !== viewer. Shows the hidden-notice single line and skips the
   * query entirely.
   */
  hideAllRounds?: boolean;
  /** If true (default), cards show the cumulative P&L header + filter. */
  showHeader?: boolean;
}

function formatPnl(amount: number | null): { label: string; color: string } {
  if (amount === null || amount === 0) return { label: "—", color: BRAND_BROWN };
  if (amount > 0) return { label: `+$${amount}`, color: BRAND_GREEN };
  return { label: `−$${Math.abs(amount)}`, color: BRAND_RED };
}

function MonthRow({
  monthLabel, pnl, isOpen, onToggle, children, testIdPrefix,
}: {
  monthLabel: string;
  pnl: number | null;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  testIdPrefix: string;
}): JSX.Element {
  const { label: pnlLabel, color: pnlColor } = formatPnl(pnl);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        data-testid={`${testIdPrefix}-toggle`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${BRAND_BORDER}`,
          background: BRAND_SAND,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isOpen ? <ChevronDown size={14} color={BRAND_BROWN} /> : <ChevronRight size={14} color={BRAND_BROWN} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1E130A" }}>{monthLabel}</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnlColor }}>
          {pnlLabel}
        </span>
      </button>
      {isOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 4px 0" }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function ProfileRoundsList({
  targetUserId, viewerUserId, hideAllRounds, showHeader = true,
}: ProfileRoundsListProps): JSX.Element {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({});

  const query = useQuery({
    queryKey: ["userRounds", targetUserId, viewerUserId],
    queryFn: () => loadUserRounds(targetUserId, viewerUserId),
    enabled: !hideAllRounds && Boolean(targetUserId && viewerUserId),
    staleTime: 60 * 1000,
  });

  const allRounds: UserRoundSummary[] = query.data ?? [];
  const filtered = useMemo(() => applyDateFilter(allRounds, dateFilter), [allRounds, dateFilter]);
  const totalPnl = useMemo(() => cumulativePnl(filtered, viewerUserId), [filtered, viewerUserId]);
  const grouping = useMemo(() => groupRounds(filtered), [filtered]);

  // Hidden-profile view — single line, no query.
  if (hideAllRounds) {
    return (
      <div
        data-testid="rounds-list-hidden"
        style={{
          fontFamily: FONT, fontSize: 13, color: BRAND_BROWN,
          padding: "20px 16px", textAlign: "center",
        }}
      >
        This user has hidden their rounds.
      </div>
    );
  }

  // Loading placeholder — only the first fetch.
  if (query.isLoading && allRounds.length === 0) {
    return (
      <div
        data-testid="rounds-list-loading"
        style={{ padding: "24px 16px", fontSize: 13, color: BRAND_BROWN, fontFamily: FONT, textAlign: "center" }}
      >
        Loading rounds…
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const isEmpty = allRounds.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT }}>
      {showHeader && (
        <div
          data-testid="rounds-list-header"
          style={{
            background: BRAND_SAND,
            borderRadius: 14,
            border: `1px solid ${BRAND_BORDER}`,
            padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Cumulative P&L
            </span>
            <span
              data-testid="rounds-cumulative-pnl"
              style={{
                fontFamily: PACIFICO, fontSize: 26,
                color: totalPnl === 0 ? BRAND_BROWN : totalPnl > 0 ? BRAND_GREEN : BRAND_RED,
                lineHeight: 1,
              }}
            >
              {totalPnl === 0 ? "—" : totalPnl > 0 ? `+ $${totalPnl}` : `− $${Math.abs(totalPnl)}`}
            </span>
            <span style={{ fontSize: 12, color: BRAND_BROWN, marginTop: 2 }}>
              {filtered.length} round{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Filter
            </span>
            <select
              data-testid="rounds-date-filter"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as DateFilter)}
              style={{
                fontFamily: FONT, fontSize: 13, fontWeight: 600,
                padding: "6px 10px", borderRadius: 8,
                border: `1px solid ${BRAND_BORDER}`,
                background: "#fff", color: "#1E130A",
                cursor: "pointer",
              }}
            >
              <option value="all">All-time</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
        </div>
      )}

      {isEmpty && (
        <div
          data-testid="rounds-list-empty"
          style={{
            padding: "24px 16px", textAlign: "center",
            color: BRAND_BROWN, fontSize: 13,
          }}
        >
          No completed rounds yet. Go play some golf ⛳
        </div>
      )}

      {/* Section A: Recent */}
      {grouping.recent.length > 0 && (
        <div data-testid="rounds-section-recent" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em", paddingLeft: 4 }}>
            Recent rounds
          </div>
          {grouping.recent.map(r => (
            <RoundCard
              key={r.id}
              round={r}
              viewerUserId={viewerUserId}
              contextYear={currentYear}
              testIdPrefix="recent"
            />
          ))}
        </div>
      )}

      {/* Section B: Current year months */}
      {grouping.currentYearMonths.length > 0 && (
        <div data-testid="rounds-section-months" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em", paddingLeft: 4 }}>
            Earlier in {currentYear}
          </div>
          {grouping.currentYearMonths.map(m => {
            const isOpen = !!openMonths[m.key];
            const monthPnl = cumulativePnl(m.rounds, viewerUserId);
            return (
              <MonthRow
                key={m.key}
                monthLabel={m.label}
                pnl={monthPnl}
                isOpen={isOpen}
                onToggle={() => setOpenMonths(s => ({ ...s, [m.key]: !s[m.key] }))}
                testIdPrefix={`month-${m.key}`}
              >
                {m.rounds.map(r => (
                  <RoundCard
                    key={r.id}
                    round={r}
                    viewerUserId={viewerUserId}
                    contextYear={currentYear}
                    testIdPrefix={`month-${m.key}-card`}
                  />
                ))}
              </MonthRow>
            );
          })}
        </div>
      )}

      {/* Section C: Prior years */}
      {grouping.priorYears.length > 0 && (
        <div data-testid="rounds-section-years" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_BROWN, textTransform: "uppercase", letterSpacing: "0.06em", paddingLeft: 4 }}>
            Previous years
          </div>
          {grouping.priorYears.map(y => {
            const isYearOpen = !!openYears[y.year];
            const yearPnl = cumulativePnl(y.months.flatMap(m => m.rounds), viewerUserId);
            const { label: pnlLabel, color: pnlColor } = formatPnl(yearPnl);
            return (
              <div key={y.year} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setOpenYears(s => ({ ...s, [y.year]: !s[y.year] }))}
                  aria-expanded={isYearOpen}
                  data-testid={`year-${y.year}-toggle`}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${BRAND_BORDER}`,
                    background: "#fff",
                    cursor: "pointer",
                    fontFamily: FONT,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isYearOpen ? <ChevronDown size={14} color={BRAND_BROWN} /> : <ChevronRight size={14} color={BRAND_BROWN} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1E130A" }}>{y.label}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnlColor }}>
                    {pnlLabel}
                  </span>
                </button>
                {isYearOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 12 }}>
                    {y.months.map(m => {
                      const monthKey = `${y.year}-${m.key}`;
                      const isMonthOpen = !!openMonths[monthKey];
                      const monthPnl = cumulativePnl(m.rounds, viewerUserId);
                      return (
                        <MonthRow
                          key={monthKey}
                          monthLabel={m.label}
                          pnl={monthPnl}
                          isOpen={isMonthOpen}
                          onToggle={() => setOpenMonths(s => ({ ...s, [monthKey]: !s[monthKey] }))}
                          testIdPrefix={`year-${y.year}-month-${m.key}`}
                        >
                          {m.rounds.map(r => (
                            <RoundCard
                              key={r.id}
                              round={r}
                              viewerUserId={viewerUserId}
                              contextYear={y.year}
                              testIdPrefix={`year-${y.year}-month-${m.key}-card`}
                            />
                          ))}
                        </MonthRow>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {query.isError && (
        <div
          data-testid="rounds-list-error"
          style={{ padding: 16, fontSize: 13, color: BRAND_RED, textAlign: "center" }}
        >
          Couldn't load your rounds. Pull to refresh.
        </div>
      )}
    </div>
  );
}
