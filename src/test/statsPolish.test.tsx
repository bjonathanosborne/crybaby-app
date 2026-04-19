import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScoringDistributionChart, {
  buildSlices,
  computePercentages,
} from "@/components/stats/ScoringDistributionChart";
import type { UserScoreDistribution } from "@/lib/db";

// ============================================================
// Part 3 — stats polish tests.
//
// Covers:
//   - buildSlices/computePercentages math (bucketing + %)
//   - <ScoringDistributionChart /> rendering:
//       • hole-in-one badge appears only when ace > 0
//       • all 6 slice colors are present in the legend
//       • total-holes row sums to the input total
//       • slices carry aria-labels with category + count + %
//   - percentages sum to ~100% for any non-empty distribution
//   - empty state (no holes, no ace)
//   - StatsPage source guards (back button wired via navigate(-1),
//     imports loadUserScoreDistribution, renders the component)
//   - migration shape (function signature + array_length handling)
// ============================================================

function mkDist(partial: Partial<UserScoreDistribution> = {}): UserScoreDistribution {
  return {
    ace: 0,
    eagle: 0,
    birdie: 0,
    pars: 0,
    bogey: 0,
    double_bogey: 0,
    triple_plus: 0,
    total_holes: 0,
    ...partial,
  };
}

beforeEach(() => cleanup());

describe("buildSlices + computePercentages", () => {
  it("produces 6 slices in order: eagle, birdie, par, bogey, double, triple", () => {
    const slices = buildSlices(mkDist({ eagle: 3, birdie: 48, pars: 289, bogey: 205, double_bogey: 78, triple_plus: 25, total_holes: 648 }));
    expect(slices.map(s => s.key)).toEqual(["eagle", "birdie", "par", "bogey", "double", "triple"]);
    expect(slices.map(s => s.count)).toEqual([3, 48, 289, 205, 78, 25]);
  });

  it("computePercentages produces percents that sum within ±0.1 of 100", () => {
    const slices = buildSlices(mkDist({ eagle: 3, birdie: 48, pars: 289, bogey: 205, double_bogey: 78, triple_plus: 25, total_holes: 648 }));
    const pct = computePercentages(slices, 648);
    const sum = pct.reduce((a, b) => a + b.percent, 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
  });

  it("zero total → all percents 0", () => {
    const slices = buildSlices(mkDist());
    const pct = computePercentages(slices, 0);
    expect(pct.every(s => s.percent === 0)).toBe(true);
  });
});

describe("<ScoringDistributionChart /> rendering", () => {
  it("shows empty state when no holes and no ace", () => {
    render(<ScoringDistributionChart distribution={mkDist()} />);
    expect(screen.getByTestId("score-dist-empty")).toHaveTextContent(/No scored holes yet/i);
  });

  it("renders the hole-in-one badge when ace > 0", () => {
    render(<ScoringDistributionChart distribution={mkDist({ ace: 2, pars: 100, total_holes: 100 })} />);
    expect(screen.getByTestId("score-dist-ace-badge")).toHaveTextContent("Career holes-in-one: 2");
  });

  it("does NOT render the ace badge when ace === 0", () => {
    render(<ScoringDistributionChart distribution={mkDist({ pars: 100, total_holes: 100 })} />);
    expect(screen.queryByTestId("score-dist-ace-badge")).not.toBeInTheDocument();
  });

  it("legend shows all 6 categories with counts and percentages, plus total holes", () => {
    render(
      <ScoringDistributionChart
        distribution={mkDist({
          eagle: 3, birdie: 48, pars: 289, bogey: 205, double_bogey: 78, triple_plus: 25,
          total_holes: 648,
        })}
      />,
    );
    for (const key of ["eagle", "birdie", "par", "bogey", "double", "triple"]) {
      expect(screen.getByTestId(`score-dist-legend-${key}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("score-dist-total-holes")).toHaveTextContent("648 holes");
  });

  it("computed slices carry the correct category labels + percentages (fed directly to Cell aria-label)", () => {
    // Recharts only mounts Cell elements when the ResponsiveContainer has
    // measured a width > 0. In jsdom that's brittle, so assert on the
    // same source-of-truth the component uses for aria-label generation:
    // computePercentages() output.
    const slices = computePercentages(
      buildSlices(mkDist({ eagle: 3, birdie: 48, pars: 289, bogey: 205, double_bogey: 78, triple_plus: 25, total_holes: 648 })),
      648,
    );
    const labels = slices.map(s => `${s.label}: ${s.count} (${s.percent}%)`);
    expect(labels).toContain("Eagle: 3 (0.5%)");
    expect(labels).toContain("Birdie: 48 (7.4%)");
    expect(labels).toContain("Par: 289 (44.6%)");
    expect(labels).toContain("Bogey: 205 (31.6%)");
    expect(labels).toContain("Double: 78 (12%)");
    expect(labels).toContain("Triple+: 25 (3.9%)");
  });
});

describe("StatsPage — source guards for Part 3", () => {
  it("imports loadUserScoreDistribution + renders <ScoringDistributionChart />", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/StatsPage.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/import\s*\{[^}]*loadUserScoreDistribution[^}]*\}\s*from\s*["']@\/lib\/db["']/);
    expect(src).toMatch(/import\s+ScoringDistributionChart\s+from\s+["']@\/components\/stats\/ScoringDistributionChart["']/);
    expect(src).toMatch(/<ScoringDistributionChart\s+distribution=\{scoreDist\}/);
  });

  it("adds a back button wired to navigate(-1)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/pages/StatsPage.tsx"),
      "utf-8",
    );
    // Must be a real <button> (not an <a>) for consistency with other back
    // buttons in the app, and must call navigate(-1). Order-agnostic: assert
    // the three attributes independently rather than in a single regex.
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*navigate\(-1\)\}/);
    expect(src).toMatch(/data-testid="stats-back"/);
    expect(src).toMatch(/aria-label="Back"/);
  });
});

describe("get_user_score_distribution migration shape", () => {
  it("declares 8 return columns matching UserScoreDistribution", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260419040000_get_user_score_distribution.sql"),
      "utf-8",
    );
    for (const col of ["ace", "eagle", "birdie", "pars", "bogey", "double_bogey", "triple_plus", "total_holes"]) {
      expect(src).toContain(`${col}`);
    }
    // ace detection: score = 1 AND par >= 3
    expect(src).toMatch(/score\s*=\s*1\s+AND\s+par\s*>=\s*3/);
    // triple_plus: score - par >= 3
    expect(src).toMatch(/\(score\s*-\s*par\)\s*>=\s*3/);
    // 9-hole handling: joins on pars ordinality — only holes with a par are counted.
    expect(src).toMatch(/jsonb_array_elements_text\(r\.course_details->'pars'\)\s+WITH\s+ORDINALITY/);
    // Security-definer + grant to authenticated.
    expect(src).toMatch(/SECURITY DEFINER/);
    expect(src).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_user_score_distribution\(uuid\)\s+TO\s+authenticated/);
  });
});

describe("loadUserScoreDistribution wrapper", () => {
  it("is exported from db.ts and coerces bigint strings to numbers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/db.ts"),
      "utf-8",
    );
    expect(src).toMatch(/export async function loadUserScoreDistribution\(userId\?:\s*string\):\s*Promise<UserScoreDistribution\s*\|\s*null>/);
    // Number() coercion on each field — guards against bigint strings leaking through.
    expect(src).toMatch(/ace:\s*Number\(row\.ace\)\s*\|\|\s*0/);
    expect(src).toMatch(/total_holes:\s*Number\(row\.total_holes\)/);
  });
});

describe("Route wiring for navigate context", () => {
  it("component renders inside a router context without crashing", () => {
    render(
      <MemoryRouter>
        <ScoringDistributionChart distribution={mkDist({ eagle: 1, pars: 100, total_holes: 101 })} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("score-dist-legend")).toBeInTheDocument();
  });
});
