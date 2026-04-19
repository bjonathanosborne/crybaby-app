import type { ScoreCategory } from "./scoreDecor";
import { categorize } from "./scoreDecor";

// ============================================================
// ScoreCell
//
// A single numeric score with its category decoration:
//   ace         — filled gold background
//   eagle       — double-circle
//   birdie      — circle
//   par         — no decoration
//   bogey       — square outline
//   doublePlus  — filled square
//   none        — muted dash
// Used in both the Scorecard (tight column) and Grid (row) views.
// ============================================================

const COLOR_GOLD = "#D4AF37";
const COLOR_GREEN = "#2D5016";
const COLOR_RED = "#DC2626";
const COLOR_BROWN = "#8B7355";

export interface ScoreCellProps {
  score: number | null | undefined;
  par: number | null | undefined;
  /** data-testid applied on the outer span for addressable tests. */
  testId?: string;
  size?: "sm" | "md";
}

export default function ScoreCell({ score, par, testId, size = "sm" }: ScoreCellProps): JSX.Element {
  const cat: ScoreCategory = categorize(score, par);
  const w = size === "md" ? 28 : 22;
  const h = w;
  const fontSize = size === "md" ? 14 : 12;

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: w,
    height: h,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    fontSize,
    fontWeight: 700,
    lineHeight: 1,
  };

  if (cat === "none") {
    return (
      <span data-testid={testId} data-cat="none" style={{ ...baseStyle, color: COLOR_BROWN, opacity: 0.4 }}>
        –
      </span>
    );
  }

  const label = String(score);

  if (cat === "ace") {
    return (
      <span
        data-testid={testId}
        data-cat="ace"
        aria-label={`Hole-in-one (${label})`}
        style={{
          ...baseStyle,
          background: COLOR_GOLD,
          color: "#1E130A",
          borderRadius: "50%",
          boxShadow: "0 0 0 2px #1E130A",
        }}
      >
        {label}
      </span>
    );
  }

  if (cat === "eagle") {
    return (
      <span
        data-testid={testId}
        data-cat="eagle"
        aria-label={`Eagle (${label})`}
        style={{
          ...baseStyle,
          color: COLOR_GREEN,
          border: `2px double ${COLOR_GREEN}`,
          borderRadius: "50%",
          background: "rgba(45,80,22,0.08)",
        }}
      >
        {label}
      </span>
    );
  }

  if (cat === "birdie") {
    return (
      <span
        data-testid={testId}
        data-cat="birdie"
        aria-label={`Birdie (${label})`}
        style={{
          ...baseStyle,
          color: COLOR_GREEN,
          border: `1.5px solid ${COLOR_GREEN}`,
          borderRadius: "50%",
        }}
      >
        {label}
      </span>
    );
  }

  if (cat === "par") {
    return (
      <span data-testid={testId} data-cat="par" aria-label={`Par (${label})`} style={{ ...baseStyle, color: "#1E130A" }}>
        {label}
      </span>
    );
  }

  if (cat === "bogey") {
    return (
      <span
        data-testid={testId}
        data-cat="bogey"
        aria-label={`Bogey (${label})`}
        style={{ ...baseStyle, color: COLOR_RED, border: `1.5px solid ${COLOR_RED}`, borderRadius: 3 }}
      >
        {label}
      </span>
    );
  }

  // doublePlus
  return (
    <span
      data-testid={testId}
      data-cat="doublePlus"
      aria-label={`Double bogey or worse (${label})`}
      style={{
        ...baseStyle,
        background: COLOR_RED,
        color: "#fff",
        borderRadius: 3,
      }}
    >
      {label}
    </span>
  );
}
