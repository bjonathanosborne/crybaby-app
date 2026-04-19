import ScoreCell from "./ScoreCell";
import { normaliseHoleScores, sum } from "./scoreDecor";

// ============================================================
// ScorecardView
//
// Traditional golf scorecard layout:
//
//       1  2  3  4  5  6  7  8  9 | OUT |10 11 12 13 14 15 16 17 18 | IN  | TOT
//  Par  4  3  4  5  4  4  3  4  5 | 36  | 4  3  4  5  4  4  3  4  5 | 36  | 72
//  HCP 11  1 15  7 17  9  3 13  5 |     |10  2 16  8 18  4 12  6 14 |     |
//  Jon  5  3  4  6  4  5  3  5  5 | 40  | 5  4  5  5  4  5  4  5  6 | 43  | 83
//  Said 4  4  5  5  3  4  4  4  6 | 39  | 5  3  4  6  5  5  3  4  5 | 40  | 79
//
// Mobile: horizontal scroll (never compressed).
// ============================================================

const BRAND_BROWN = "#8B7355";
const BRAND_BORDER = "#DDD0BB";
const BRAND_SAND = "#FAF5EC";
const BRAND_GREEN = "#2D5016";
const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export interface ScorecardPlayer {
  id: string;
  name: string;
  /** hole_scores normalised to length 18 by the caller. */
  scores: number[];
  isViewer?: boolean;
}

export interface ScorecardViewProps {
  pars: number[];
  handicaps?: number[];
  players: ScorecardPlayer[];
  /** How many holes the round covered (9 for 9-hole rounds, 18 default). */
  holes?: number;
}

export default function ScorecardView({ pars, handicaps, players, holes = 18 }: ScorecardViewProps): JSX.Element {
  const pars18 = pars.slice(0, holes);
  const front = 9;
  const hcpRaw = handicaps?.slice(0, holes);

  const frontPar = sum(pars18.slice(0, front));
  const backPar = sum(pars18.slice(front, holes));
  const totalPar = frontPar + backPar;

  const cellStyle: React.CSSProperties = {
    padding: "6px 6px",
    textAlign: "center",
    fontSize: 12,
    fontFamily: MONO,
    borderBottom: `1px solid ${BRAND_BORDER}`,
    background: "#fff",
    whiteSpace: "nowrap",
  };
  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 700,
    color: BRAND_BROWN,
    background: BRAND_SAND,
  };
  const labelCellStyle: React.CSSProperties = {
    ...cellStyle,
    textAlign: "left",
    paddingLeft: 10,
    paddingRight: 10,
    fontFamily: FONT,
    fontWeight: 600,
    color: "#1E130A",
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "#fff",
    borderRight: `1px solid ${BRAND_BORDER}`,
  };
  const totalCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: BRAND_SAND,
    fontWeight: 700,
    color: BRAND_GREEN,
  };

  return (
    <div
      data-testid="scorecard-view"
      style={{
        overflowX: "auto",
        border: `1px solid ${BRAND_BORDER}`,
        borderRadius: 12,
        background: "#fff",
        fontFamily: FONT,
      }}
    >
      <table style={{ borderCollapse: "collapse", minWidth: 680 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...labelCellStyle, background: BRAND_SAND, color: BRAND_BROWN }}>Hole</th>
            {pars18.slice(0, front).map((_, i) => (
              <th key={`h-${i + 1}`} scope="col" style={headerCellStyle}>{i + 1}</th>
            ))}
            <th scope="col" style={{ ...headerCellStyle, color: BRAND_GREEN }}>OUT</th>
            {holes > front && pars18.slice(front, holes).map((_, i) => (
              <th key={`h-${front + i + 1}`} scope="col" style={headerCellStyle}>{front + i + 1}</th>
            ))}
            {holes > front && <th scope="col" style={{ ...headerCellStyle, color: BRAND_GREEN }}>IN</th>}
            <th scope="col" style={{ ...headerCellStyle, color: BRAND_GREEN }}>TOT</th>
          </tr>
        </thead>
        <tbody>
          {/* Par row */}
          <tr>
            <th scope="row" style={labelCellStyle}>Par</th>
            {pars18.slice(0, front).map((p, i) => (
              <td key={`p-${i}`} style={cellStyle}>{p}</td>
            ))}
            <td style={totalCellStyle}>{frontPar}</td>
            {holes > front && pars18.slice(front, holes).map((p, i) => (
              <td key={`p-${front + i}`} style={cellStyle}>{p}</td>
            ))}
            {holes > front && <td style={totalCellStyle}>{backPar}</td>}
            <td style={totalCellStyle}>{totalPar}</td>
          </tr>
          {/* HCP row */}
          {hcpRaw && hcpRaw.some(h => h) && (
            <tr>
              <th scope="row" style={{ ...labelCellStyle, fontWeight: 500, color: BRAND_BROWN }}>HCP</th>
              {hcpRaw.slice(0, front).map((h, i) => (
                <td key={`hcp-${i}`} style={{ ...cellStyle, color: BRAND_BROWN }}>{h || "—"}</td>
              ))}
              <td style={{ ...totalCellStyle, color: "transparent" }}></td>
              {holes > front && hcpRaw.slice(front, holes).map((h, i) => (
                <td key={`hcp-${front + i}`} style={{ ...cellStyle, color: BRAND_BROWN }}>{h || "—"}</td>
              ))}
              {holes > front && <td style={{ ...totalCellStyle, color: "transparent" }}></td>}
              <td style={{ ...totalCellStyle, color: "transparent" }}></td>
            </tr>
          )}
          {/* Per-player rows */}
          {players.map(player => {
            const scores18 = player.scores.slice(0, holes);
            const frontScore = sum(scores18.slice(0, front));
            const backScore = holes > front ? sum(scores18.slice(front, holes)) : 0;
            const total = frontScore + backScore;
            const rowStyle: React.CSSProperties = player.isViewer
              ? { background: "rgba(212, 175, 55, 0.08)" }
              : {};
            const playerLabelStyle: React.CSSProperties = {
              ...labelCellStyle,
              background: player.isViewer ? "#FEF9E7" : "#fff",
            };
            return (
              <tr
                key={player.id}
                data-testid={`scorecard-row-${player.id}`}
                data-viewer={player.isViewer ? "true" : "false"}
                style={rowStyle}
              >
                <th scope="row" style={playerLabelStyle}>{player.name}</th>
                {scores18.slice(0, front).map((s, i) => (
                  <td key={`s-${player.id}-${i}`} style={cellStyle}>
                    <ScoreCell
                      score={s || null}
                      par={pars18[i]}
                      testId={`scorecard-${player.id}-h${i + 1}`}
                    />
                  </td>
                ))}
                <td style={totalCellStyle}>{frontScore || "—"}</td>
                {holes > front && scores18.slice(front, holes).map((s, i) => (
                  <td key={`s-${player.id}-${front + i}`} style={cellStyle}>
                    <ScoreCell
                      score={s || null}
                      par={pars18[front + i]}
                      testId={`scorecard-${player.id}-h${front + i + 1}`}
                    />
                  </td>
                ))}
                {holes > front && <td style={totalCellStyle}>{backScore || "—"}</td>}
                <td style={totalCellStyle}>{total || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Adapter that normalises a set of raw player rows into the shape the view consumes. */
export function buildScorecardPlayers(
  rows: Array<{ id: string; user_id: string | null; guest_name: string | null; hole_scores: Record<string, number> | number[] | null }>,
  viewerUserId: string | undefined,
  participantNames: Record<string, string>,
): ScorecardPlayer[] {
  return rows.map(row => ({
    id: row.id,
    name: row.user_id
      ? participantNames[row.user_id] || row.guest_name || "Player"
      : row.guest_name || "Guest",
    scores: normaliseHoleScores(row.hole_scores),
    isViewer: row.user_id === viewerUserId,
  }));
}
