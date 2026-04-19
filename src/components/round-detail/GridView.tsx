import { diffSymbol } from "./scoreDecor";
import type { ScorecardPlayer } from "./ScorecardView";

// ============================================================
// GridView
//
// Compact horizontal-scroll grid: one "row group" per player,
// with scores on top and ±par below.
//
//   Hole 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18
//   Jon  5 3 4 6 4 5 3 5 5 5  4  5  5  4  5  4  5  6
//        +1 E P +1 P +1 P +1 P +1 +1 +1 E  P +1 +1 +1 +1
// ============================================================

const BRAND_BROWN = "#8B7355";
const BRAND_BORDER = "#DDD0BB";
const BRAND_SAND = "#FAF5EC";
const BRAND_GREEN = "#2D5016";
const BRAND_RED = "#DC2626";
const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export interface GridViewProps {
  pars: number[];
  players: ScorecardPlayer[];
  holes?: number;
}

function diffColor(diff: number): string {
  if (diff < 0) return BRAND_GREEN;
  if (diff === 0) return BRAND_BROWN;
  return BRAND_RED;
}

export default function GridView({ pars, players, holes = 18 }: GridViewProps): JSX.Element {
  const pars18 = pars.slice(0, holes);

  const cellStyle: React.CSSProperties = {
    padding: "4px 6px",
    textAlign: "center",
    fontSize: 12,
    fontFamily: MONO,
    whiteSpace: "nowrap",
    minWidth: 22,
  };
  const playerCellStyle: React.CSSProperties = {
    ...cellStyle,
    textAlign: "left",
    paddingLeft: 10,
    paddingRight: 10,
    fontFamily: FONT,
    fontWeight: 700,
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "#fff",
    borderRight: `1px solid ${BRAND_BORDER}`,
  };

  return (
    <div
      data-testid="grid-view"
      style={{
        overflowX: "auto",
        border: `1px solid ${BRAND_BORDER}`,
        borderRadius: 12,
        background: "#fff",
        fontFamily: FONT,
      }}
    >
      <table style={{ borderCollapse: "collapse", minWidth: 560 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...playerCellStyle, background: BRAND_SAND, color: BRAND_BROWN, fontWeight: 700 }}>Hole</th>
            {pars18.map((_, i) => (
              <th key={`h-${i + 1}`} scope="col" style={{ ...cellStyle, background: BRAND_SAND, color: BRAND_BROWN, fontWeight: 700 }}>
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map(player => {
            const scores = player.scores.slice(0, holes);
            const rowStyle: React.CSSProperties = player.isViewer
              ? { background: "rgba(212, 175, 55, 0.08)" }
              : {};
            const playerLabelStyle: React.CSSProperties = {
              ...playerCellStyle,
              background: player.isViewer ? "#FEF9E7" : "#fff",
            };
            return (
              <>
                <tr
                  key={`${player.id}-scores`}
                  data-testid={`grid-row-scores-${player.id}`}
                  data-viewer={player.isViewer ? "true" : "false"}
                  style={rowStyle}
                >
                  <th scope="row" rowSpan={2} style={playerLabelStyle}>{player.name}</th>
                  {scores.map((s, i) => (
                    <td
                      key={`s-${player.id}-${i}`}
                      style={{ ...cellStyle, borderTop: `1px solid ${BRAND_BORDER}` }}
                    >
                      {s > 0 ? s : "—"}
                    </td>
                  ))}
                </tr>
                <tr
                  key={`${player.id}-diffs`}
                  data-testid={`grid-row-diffs-${player.id}`}
                  style={rowStyle}
                >
                  {scores.map((s, i) => {
                    if (!s || s <= 0) {
                      return (
                        <td key={`d-${player.id}-${i}`} style={{ ...cellStyle, color: BRAND_BROWN, opacity: 0.3 }}>—</td>
                      );
                    }
                    const par = pars18[i] ?? 0;
                    const diff = s - par;
                    const label = diff === 0 ? "E" : diffSymbol(diff);
                    return (
                      <td
                        key={`d-${player.id}-${i}`}
                        style={{
                          ...cellStyle,
                          fontSize: 11,
                          color: diffColor(diff),
                          borderBottom: `1px solid ${BRAND_BORDER}`,
                        }}
                      >
                        {label}
                      </td>
                    );
                  })}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
