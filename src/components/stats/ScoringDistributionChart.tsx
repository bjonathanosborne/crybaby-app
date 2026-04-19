import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { UserScoreDistribution } from "@/lib/db";

// ============================================================
// ScoringDistributionChart
//
// Pie chart + legend table of career scoring distribution.
// Takes the aggregated UserScoreDistribution (from
// get_user_score_distribution RPC) and renders:
//
//   🎉 Career holes-in-one: N    (only if ace > 0)
//
//   [ pie ]   Eagle     3    0.5%
//             Birdie   48    7.4%
//             Par     289   44.6%
//             ...
//             Total   648 holes
//
// Pie + legend stack on narrow screens (viewport-driven CSS).
// Every slice has aria-label with "category: count (percent%)"
// for screen-reader access.
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";
const BRAND_BROWN = "#8B7355";
const BRAND_BORDER = "#DDD0BB";
const BRAND_SAND = "#FAF5EC";

// Category order + colors. Kept deliberately distinguishable:
//   eagle: green (best)
//   birdie: light green
//   par: muted gold
//   bogey: orange
//   double: dark red
//   triple+: deep red
// Ace is separate (badge only, not a slice) because 1-2 points of
// data at this scale would just be noise in the pie.
interface Slice {
  key: "eagle" | "birdie" | "par" | "bogey" | "double" | "triple";
  label: string;
  color: string;
  count: number;
}

export interface ScoringDistributionChartProps {
  distribution: UserScoreDistribution;
  /** For stable test output. */
  testIdPrefix?: string;
}

export function buildSlices(d: UserScoreDistribution): Slice[] {
  return [
    { key: "eagle",  label: "Eagle",        color: "#1A5C2A", count: d.eagle },
    { key: "birdie", label: "Birdie",       color: "#65A30D", count: d.birdie },
    { key: "par",    label: "Par",          color: "#A8957B", count: d.pars },
    { key: "bogey",  label: "Bogey",        color: "#D4AF37", count: d.bogey },
    { key: "double", label: "Double",       color: "#C05C1A", count: d.double_bogey },
    { key: "triple", label: "Triple+",      color: "#B91C1C", count: d.triple_plus },
  ];
}

export function computePercentages(slices: Slice[], total: number): Array<Slice & { percent: number }> {
  if (total <= 0) return slices.map(s => ({ ...s, percent: 0 }));
  return slices.map(s => ({ ...s, percent: +((s.count / total) * 100).toFixed(1) }));
}

export default function ScoringDistributionChart({
  distribution, testIdPrefix = "score-dist",
}: ScoringDistributionChartProps): JSX.Element {
  const { total_holes: total, ace } = distribution;

  if (total <= 0 && ace <= 0) {
    return (
      <div
        data-testid={`${testIdPrefix}-empty`}
        style={{
          padding: "18px 16px", borderRadius: 14, background: BRAND_SAND,
          border: `1px solid ${BRAND_BORDER}`, textAlign: "center",
          fontSize: 13, color: BRAND_BROWN, fontFamily: FONT,
        }}
      >
        No scored holes yet — finish a round to see your distribution.
      </div>
    );
  }

  const slices = computePercentages(buildSlices(distribution), total);
  const nonZero = slices.filter(s => s.count > 0);

  return (
    <div
      data-testid={`${testIdPrefix}-root`}
      style={{
        display: "flex", flexDirection: "column", gap: 12,
        fontFamily: FONT,
      }}
    >
      {ace > 0 && (
        <div
          data-testid={`${testIdPrefix}-ace-badge`}
          style={{
            padding: "10px 14px", borderRadius: 12,
            background: "#FEF3C7", border: "1px solid #D4AF37",
            fontSize: 14, fontWeight: 700, color: "#1E130A",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <span aria-hidden="true">🎉</span>
          <span>Career holes-in-one: {ace}</span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          // Pie + legend stack on narrow screens; side-by-side >= 480px.
          // Using media query via style prop isn't supported, so we rely on
          // CSS below wired through data attributes.
        }}
        className="scoring-dist-layout"
      >
        <div
          data-testid={`${testIdPrefix}-pie`}
          className="scoring-dist-pie"
          style={{ width: "100%", height: 200, background: "#fff", borderRadius: 14, border: `1px solid ${BRAND_BORDER}`, padding: 8 }}
        >
          {total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={nonZero}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={1}
                  isAnimationActive={false}
                >
                  {nonZero.map(s => (
                    <Cell
                      key={s.key}
                      fill={s.color}
                      aria-label={`${s.label}: ${s.count} (${s.percent}%)`}
                      data-testid={`${testIdPrefix}-slice-${s.key}`}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: BRAND_BROWN, fontSize: 13 }}>
              Only ace recorded so far — keep playing for a fuller picture.
            </div>
          )}
        </div>

        <table
          data-testid={`${testIdPrefix}-legend`}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: MONO,
            fontSize: 13,
            background: "#fff",
            borderRadius: 14,
            overflow: "hidden",
            border: `1px solid ${BRAND_BORDER}`,
          }}
        >
          <tbody>
            {slices.map(s => (
              <tr
                key={s.key}
                data-testid={`${testIdPrefix}-legend-${s.key}`}
                style={{ borderBottom: `1px solid ${BRAND_BORDER}` }}
              >
                <th scope="row" style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 10, height: 10, borderRadius: 2,
                      background: s.color, marginRight: 8,
                    }}
                  />
                  {s.label}
                </th>
                <td style={{ padding: "8px 10px", textAlign: "right", color: "#1E130A", fontWeight: 700 }}>
                  {s.count}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", color: BRAND_BROWN, width: 60 }}>
                  {s.percent}%
                </td>
              </tr>
            ))}
            <tr style={{ background: BRAND_SAND }}>
              <th scope="row" style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: BRAND_BROWN }}>
                Total
              </th>
              <td
                data-testid={`${testIdPrefix}-total-holes`}
                colSpan={2}
                style={{ padding: "8px 10px", textAlign: "right", color: "#1E130A", fontWeight: 800 }}
              >
                {total} holes
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Stack/side-by-side layout. Wired via data attribute because
          inline styles can't do media queries. Aspirationally, pie and
          legend go side-by-side at ≥ 480px. */}
      <style>{`
        @media (min-width: 480px) {
          .scoring-dist-layout {
            flex-direction: row !important;
            align-items: flex-start;
          }
          .scoring-dist-pie {
            flex: 0 0 240px;
          }
        }
      `}</style>
    </div>
  );
}
