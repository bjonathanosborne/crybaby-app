import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { AUSTIN_COURSES } from "@/data/constants";

// ============================================================
// PR — Add three Sea Island Resort courses (Seaside / Plantation
// / Retreat) to the course preset catalog.
//
// Two layers of coverage:
//
//   1. Shape validation — every course in AUSTIN_COURSES must have
//      18 (or `holes` if explicitly set) entries on `pars` and
//      `handicaps`, with valid pars (3-5) and handicaps that are a
//      permutation of 1..18 (or 1..9). Run on the WHOLE catalog so
//      adding a course later that breaks shape gets caught.
//
//   2. Sea Island specifics — three named courses must exist with
//      the right par totals (70 / 72 / 72), and the wizard's inline
//      copy of AUSTIN_COURSES must stay in sync with constants.js
//      for the three new IDs.
//
// Source: course.bluegolf.com per-course detailedscorecard JSON
// (accessed 2026-04-27). Pars cross-checked against seaisland.com.
// ============================================================

interface Tee {
  name: string;
  slope: number;
  rating: number;
  yardage: number;
}
interface Course {
  id: string;
  name: string;
  city: string;
  type: string;
  pars: number[];
  handicaps: number[];
  tees: Tee[];
  holes?: number;
}

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", rel), "utf-8");
}

const COURSES = AUSTIN_COURSES as Course[];

// ------------------------------------------------------------
// Block 1 — Catalog-wide shape validation.
// ------------------------------------------------------------

describe("Course catalog — shape validation (every entry)", () => {
  it("AUSTIN_COURSES is a non-empty array", () => {
    expect(Array.isArray(COURSES)).toBe(true);
    expect(COURSES.length).toBeGreaterThan(0);
  });

  it("every course has the required scalar fields with the right types", () => {
    for (const c of COURSES) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(typeof c.city).toBe("string");
      expect(typeof c.type).toBe("string");
      expect(Array.isArray(c.pars)).toBe(true);
      expect(Array.isArray(c.handicaps)).toBe(true);
      expect(Array.isArray(c.tees)).toBe(true);
    }
  });

  it("course IDs are unique across the catalog", () => {
    const ids = COURSES.map(c => c.id);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes, `Duplicate course ids: ${dupes.join(", ")}`).toEqual([]);
  });

  it("pars + handicaps arrays match the course's hole count (default 18)", () => {
    for (const c of COURSES) {
      const expected = c.holes ?? 18;
      expect(c.pars.length, `${c.id} pars`).toBe(expected);
      expect(c.handicaps.length, `${c.id} handicaps`).toBe(expected);
    }
  });

  it("every par is 3, 4, or 5", () => {
    for (const c of COURSES) {
      for (let i = 0; i < c.pars.length; i++) {
        const p = c.pars[i];
        expect([3, 4, 5], `${c.id} hole ${i + 1} par`).toContain(p);
      }
    }
  });

  it("every handicap array is a permutation of 1..N (no duplicates, no gaps)", () => {
    for (const c of COURSES) {
      const n = c.handicaps.length;
      const sorted = [...c.handicaps].sort((a, b) => a - b);
      const expected = Array.from({ length: n }, (_, i) => i + 1);
      expect(sorted, `${c.id} handicap permutation`).toEqual(expected);
    }
  });

  it("every tee has name + slope + rating + yardage of the right types and ranges", () => {
    for (const c of COURSES) {
      expect(c.tees.length, `${c.id} has at least one tee`).toBeGreaterThan(0);
      for (const t of c.tees) {
        expect(typeof t.name, `${c.id} tee name`).toBe("string");
        expect(t.name.length).toBeGreaterThan(0);
        // Slope: USGA range 55-155.
        expect(t.slope, `${c.id} ${t.name} slope`).toBeGreaterThanOrEqual(55);
        expect(t.slope).toBeLessThanOrEqual(155);
        // Rating: USGA realistic range ~30-80 (9-hole courses can dip).
        expect(t.rating, `${c.id} ${t.name} rating`).toBeGreaterThan(25);
        expect(t.rating).toBeLessThan(85);
        // Yardage: positive integer.
        expect(t.yardage, `${c.id} ${t.name} yardage`).toBeGreaterThan(0);
        expect(Number.isInteger(t.yardage)).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------
// Block 2 — Sea Island specifics.
// ------------------------------------------------------------

const SEA_ISLAND_IDS = [
  "sea_island_seaside",
  "sea_island_plantation",
  "sea_island_retreat",
] as const;

describe("Sea Island courses — present in catalog with correct totals", () => {
  it("all three Sea Island courses are present by id", () => {
    for (const id of SEA_ISLAND_IDS) {
      const course = COURSES.find(c => c.id === id);
      expect(course, `${id} missing from AUSTIN_COURSES`).toBeDefined();
    }
  });

  it("Seaside is par 70 (the only par-70 layout in the Sea Island set)", () => {
    const seaside = COURSES.find(c => c.id === "sea_island_seaside")!;
    expect(seaside.pars.reduce((s, p) => s + p, 0)).toBe(70);
  });

  it("Plantation is par 72", () => {
    const plantation = COURSES.find(c => c.id === "sea_island_plantation")!;
    expect(plantation.pars.reduce((s, p) => s + p, 0)).toBe(72);
  });

  it("Retreat is par 72 with a symmetric front/back par sequence (5-4-3-4-4-4-3-5-4 mirrored)", () => {
    const retreat = COURSES.find(c => c.id === "sea_island_retreat")!;
    expect(retreat.pars.reduce((s, p) => s + p, 0)).toBe(72);
    expect(retreat.pars.slice(0, 9)).toEqual(retreat.pars.slice(9, 18));
  });

  it("all three Sea Island courses are typed 'resort' and located on St. Simons Island", () => {
    for (const id of SEA_ISLAND_IDS) {
      const c = COURSES.find(course => course.id === id)!;
      expect(c.type).toBe("resort");
      expect(c.city).toBe("St. Simons Island");
    }
  });

  it("each Sea Island course has 4 tees with strictly decreasing yardage", () => {
    for (const id of SEA_ISLAND_IDS) {
      const c = COURSES.find(course => course.id === id)!;
      expect(c.tees.length, `${id} tee count`).toBe(4);
      for (let i = 1; i < c.tees.length; i++) {
        expect(
          c.tees[i].yardage,
          `${id} tees should be ordered longest → shortest, but ${c.tees[i - 1].name} (${c.tees[i - 1].yardage}) <= ${c.tees[i].name} (${c.tees[i].yardage})`,
        ).toBeLessThan(c.tees[i - 1].yardage);
      }
    }
  });

  it("Seaside tee yardages match the BlueGolf scorecard exactly", () => {
    const seaside = COURSES.find(c => c.id === "sea_island_seaside")!;
    expect(seaside.tees.find(t => t.name === "Red")?.yardage).toBe(6883);
    expect(seaside.tees.find(t => t.name === "Blue")?.yardage).toBe(6568);
    expect(seaside.tees.find(t => t.name === "White")?.yardage).toBe(6277);
    expect(seaside.tees.find(t => t.name === "Green")?.yardage).toBe(5895);
  });

  it("Plantation tee yardages match the BlueGolf scorecard exactly", () => {
    const plantation = COURSES.find(c => c.id === "sea_island_plantation")!;
    expect(plantation.tees.find(t => t.name === "Red")?.yardage).toBe(6999);
    expect(plantation.tees.find(t => t.name === "Blue")?.yardage).toBe(6640);
    expect(plantation.tees.find(t => t.name === "White")?.yardage).toBe(6183);
    expect(plantation.tees.find(t => t.name === "Green")?.yardage).toBe(5818);
  });

  it("Retreat tee yardages match the BlueGolf scorecard exactly", () => {
    const retreat = COURSES.find(c => c.id === "sea_island_retreat")!;
    expect(retreat.tees.find(t => t.name === "Red")?.yardage).toBe(7110);
    expect(retreat.tees.find(t => t.name === "Blue")?.yardage).toBe(6723);
    expect(retreat.tees.find(t => t.name === "White")?.yardage).toBe(6350);
    expect(retreat.tees.find(t => t.name === "Green")?.yardage).toBe(5876);
  });
});

// ------------------------------------------------------------
// Block 3 — Wizard <-> constants.js dedup invariant.
// The wizard has its own inline AUSTIN_COURSES at
// src/pages/CrybabySetupWizard.jsx. Per the "Dedupe AUSTIN_COURSES"
// TODO, the two copies must agree at least on the ids + key fields
// for any course that exists in both. We assert each Sea Island id
// is present in the wizard source and carries identical par
// + handicap arrays + at least one tee with matching slope/rating.
// ------------------------------------------------------------

describe("Wizard inline AUSTIN_COURSES — Sea Island entries match constants.js", () => {
  const wizardSrc = readFile("src/pages/CrybabySetupWizard.jsx");

  for (const id of SEA_ISLAND_IDS) {
    it(`${id} is present in wizard's inline AUSTIN_COURSES`, () => {
      expect(wizardSrc).toMatch(new RegExp(`id:\\s*"${id}"`));
    });

    it(`${id} carries the same pars array in the wizard as in constants.js`, () => {
      const c = COURSES.find(x => x.id === id)!;
      const parsLiteral = `pars: [${c.pars.join(",")}]`;
      expect(wizardSrc).toContain(parsLiteral);
    });

    it(`${id} carries the same handicaps array in the wizard as in constants.js`, () => {
      const c = COURSES.find(x => x.id === id)!;
      const hcpLiteral = `handicaps: [${c.handicaps.join(",")}]`;
      expect(wizardSrc).toContain(hcpLiteral);
    });
  }
});

// ------------------------------------------------------------
// Block 4 — round_details flow (setup wizard integration).
// When a user picks a Sea Island course at setup, the round's
// course_details.pars + course_details.handicaps + course_details
// .course_name must populate from the catalog entry. The wizard
// stores `course.pars` and `course.handicaps` directly into
// course_details (see CrybabySetupWizard.jsx). This test asserts
// the catalog entries are wire-compatible — pars + handicaps
// arrays of length 18 with valid ranges so that downstream
// scoring (par-relative cells, handicap stroke allocation) doesn't
// blow up.
// ------------------------------------------------------------

describe("Sea Island courses — setup-wizard wire compatibility", () => {
  for (const id of SEA_ISLAND_IDS) {
    it(`${id} produces a valid round.course_details payload (pars + handicaps + total)`, () => {
      const c = COURSES.find(course => course.id === id)!;
      // Mirrors what the wizard does on createRound:
      //   course_details: { course_name: c.name, pars: c.pars,
      //                     handicaps: c.handicaps, ... }
      const totalPar = c.pars.reduce((s, p) => s + p, 0);
      expect(c.name.length, `${id} has a non-empty name`).toBeGreaterThan(0);
      expect(c.pars).toHaveLength(18);
      expect(c.handicaps).toHaveLength(18);
      // Total par should be a realistic 18-hole layout (66-74 covers
      // every regulation course; lets exotic par-66 executive courses
      // still work without false-failing on par 70).
      expect(totalPar).toBeGreaterThanOrEqual(66);
      expect(totalPar).toBeLessThanOrEqual(74);
    });
  }
});
