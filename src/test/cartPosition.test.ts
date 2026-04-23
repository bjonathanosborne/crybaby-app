import { describe, it, expect } from "vitest";
import {
  resolveCartPosition,
  resolvePlayerCartPosition,
} from "@/lib/cartPosition";

// ============================================================
// PR #23 commit 2 (D2) — Cart + position normalisation.
//
// Covers:
//   (a) resolveCartPosition — parses new/legacy/garbage inputs
//   (b) resolvePlayerCartPosition — normalises + applies fallback
//
// Integration with the engine's getDOCTeams is covered indirectly:
// if these helpers produce the canonical 'A'|'B' + 'driver'|'rider'
// shape, the engine's existing filters return correct team rosters
// (which are already covered by the existing DOC replay tests).
// ============================================================

describe("resolveCartPosition — canonical new shape", () => {
  it("resolves cart='A' + position='driver' unchanged", () => {
    expect(resolveCartPosition({ cart: "A", position: "driver" }))
      .toEqual({ cart: "A", position: "driver" });
  });

  it("resolves cart='B' + position='rider'", () => {
    expect(resolveCartPosition({ cart: "B", position: "rider" }))
      .toEqual({ cart: "B", position: "rider" });
  });

  it("all four combinations", () => {
    for (const cart of ["A", "B"] as const) {
      for (const position of ["driver", "rider"] as const) {
        expect(resolveCartPosition({ cart, position })).toEqual({ cart, position });
      }
    }
  });
});

describe("resolveCartPosition — legacy combined-label shape", () => {
  it("parses 'Cart A — Driver' (em-dash, Jonathan's orphan round's actual data)", () => {
    expect(resolveCartPosition({ cart: "Cart A — Driver", position: null }))
      .toEqual({ cart: "A", position: "driver" });
  });

  it("parses 'Cart A — Rider'", () => {
    expect(resolveCartPosition({ cart: "Cart A — Rider", position: null }))
      .toEqual({ cart: "A", position: "rider" });
  });

  it("parses 'Cart B — Driver'", () => {
    expect(resolveCartPosition({ cart: "Cart B — Driver", position: null }))
      .toEqual({ cart: "B", position: "driver" });
  });

  it("parses 'Cart B — Rider'", () => {
    expect(resolveCartPosition({ cart: "Cart B — Rider", position: null }))
      .toEqual({ cart: "B", position: "rider" });
  });

  it("parses a hyphen variant ('Cart A - Driver')", () => {
    expect(resolveCartPosition({ cart: "Cart A - Driver", position: null }))
      .toEqual({ cart: "A", position: "driver" });
  });

  it("parses an en-dash variant ('Cart B – Rider')", () => {
    expect(resolveCartPosition({ cart: "Cart B – Rider", position: null }))
      .toEqual({ cart: "B", position: "rider" });
  });

  it("is case-insensitive: 'cart a — driver'", () => {
    expect(resolveCartPosition({ cart: "cart a — driver", position: null }))
      .toEqual({ cart: "A", position: "driver" });
  });

  it("resolves cart alone from 'Cart A' even without position", () => {
    expect(resolveCartPosition({ cart: "Cart A", position: null }))
      .toEqual({ cart: "A", position: null });
  });

  it("respects an explicit position override even when cart is combined", () => {
    // If somehow both are set, the canonical position value wins.
    expect(resolveCartPosition({ cart: "Cart A — Driver", position: "rider" }))
      .toEqual({ cart: "A", position: "rider" });
  });
});

describe("resolveCartPosition — defensive / bad input", () => {
  it("empty object → both null", () => {
    expect(resolveCartPosition({})).toEqual({ cart: null, position: null });
  });

  it("null / undefined fields → both null", () => {
    expect(resolveCartPosition({ cart: null, position: null }))
      .toEqual({ cart: null, position: null });
    expect(resolveCartPosition({ cart: undefined, position: undefined }))
      .toEqual({ cart: null, position: null });
  });

  it("garbage strings → both null (no throw)", () => {
    expect(resolveCartPosition({ cart: "foo", position: "bar" }))
      .toEqual({ cart: null, position: null });
  });

  it("empty strings treated as null", () => {
    expect(resolveCartPosition({ cart: "", position: "" }))
      .toEqual({ cart: null, position: null });
  });

  it("whitespace-only strings treated as null", () => {
    expect(resolveCartPosition({ cart: "   ", position: "\t" }))
      .toEqual({ cart: null, position: null });
  });

  it("unknown cart letter ('C') → null, not a crash", () => {
    expect(resolveCartPosition({ cart: "C", position: "driver" }))
      .toEqual({ cart: null, position: "driver" });
  });

  it("unknown position ('wolf') → null, not a crash", () => {
    expect(resolveCartPosition({ cart: "A", position: "wolf" }))
      .toEqual({ cart: "A", position: null });
  });
});

describe("resolvePlayerCartPosition — fallback pattern", () => {
  it("fully-resolved config stays resolved", () => {
    expect(resolvePlayerCartPosition({ cart: "B", position: "rider" }, 2))
      .toEqual({ cart: "B", position: "rider" });
  });

  it("missing cart + position → index 0 → cart A, driver", () => {
    expect(resolvePlayerCartPosition(null, 0)).toEqual({ cart: "A", position: "driver" });
  });

  it("missing cart + position → index 1 → cart A, rider", () => {
    expect(resolvePlayerCartPosition(null, 1)).toEqual({ cart: "A", position: "rider" });
  });

  it("missing cart + position → index 2 → cart B, driver", () => {
    expect(resolvePlayerCartPosition(null, 2)).toEqual({ cart: "B", position: "driver" });
  });

  it("missing cart + position → index 3 → cart B, rider", () => {
    expect(resolvePlayerCartPosition(null, 3)).toEqual({ cart: "B", position: "rider" });
  });

  it("legacy combined-label resolves cart AND position from one field", () => {
    expect(resolvePlayerCartPosition({ cart: "Cart B — Rider" }, 0))
      .toEqual({ cart: "B", position: "rider" });
  });

  it("partial resolution falls back per-field: new cart + missing position", () => {
    // cart resolves from new shape, position falls back via index.
    expect(resolvePlayerCartPosition({ cart: "B" }, 0))
      .toEqual({ cart: "B", position: "driver" }); // index 0 → driver
  });

  it("partial resolution: missing cart + canonical position", () => {
    expect(resolvePlayerCartPosition({ position: "rider" }, 2))
      .toEqual({ cart: "B", position: "rider" }); // index 2 → cart B
  });

  it("end-to-end: Jonathan's orphan round shape resolves correctly", () => {
    // The actual playerConfig from the canceled 006181dc… round.
    const orphanConfig = [
      { cart: "Cart A — Driver", position: null },
      { cart: "Cart A — Rider",  position: null },
      { cart: "Cart B — Driver", position: null },
      { cart: "Cart B — Rider",  position: null },
    ];
    const resolved = orphanConfig.map((c, i) => resolvePlayerCartPosition(c, i));
    expect(resolved).toEqual([
      { cart: "A", position: "driver" },
      { cart: "A", position: "rider" },
      { cart: "B", position: "driver" },
      { cart: "B", position: "rider" },
    ]);
    // Sanity: 2 drivers + 2 riders, 2 cart-A + 2 cart-B → getDOCTeams
    // would produce balanced team rosters (previously returned empty).
    expect(resolved.filter(r => r.position === "driver")).toHaveLength(2);
    expect(resolved.filter(r => r.position === "rider")).toHaveLength(2);
    expect(resolved.filter(r => r.cart === "A")).toHaveLength(2);
    expect(resolved.filter(r => r.cart === "B")).toHaveLength(2);
  });
});

// ---------- setup wizard + active round wiring (source-level) ----------

describe("CrybabySetupWizard — split cart+position pickers (source-level)", () => {
  it("has separate testids for cart + position selects", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"), "utf-8");
    expect(src).toMatch(/data-testid=\{`player-cart-select-\$\{index\}`\}/);
    expect(src).toMatch(/data-testid=\{`player-position-select-\$\{index\}`\}/);
  });

  it("cart select offers exactly A / B as canonical values", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"), "utf-8");
    expect(src).toMatch(/<option value="A">Cart A<\/option>/);
    expect(src).toMatch(/<option value="B">Cart B<\/option>/);
  });

  it("position select offers exactly driver / rider as canonical values", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"), "utf-8");
    expect(src).toMatch(/<option value="driver">Driver<\/option>/);
    expect(src).toMatch(/<option value="rider">Rider<\/option>/);
  });

  it("canProceed at step 1 requires both cart + position when format.requiresCarts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"), "utf-8");
    expect(src).toMatch(/format\?\.requiresCarts/);
    expect(src).toMatch(/p\.cart === "A" \|\| p\.cart === "B"/);
    expect(src).toMatch(/p\.position === "driver" \|\| p\.position === "rider"/);
  });

  it("legacy combined-label dropdown is gone (regression guard)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabySetupWizard.jsx"), "utf-8");
    // The old picker emitted a single select with cartOptions array.
    expect(src).not.toMatch(/cartOptions\.\.map\(c => \(/);
  });
});

describe("CrybabyActiveRound — normalises cart+position on load (source-level)", () => {
  it("imports resolvePlayerCartPosition", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"), "utf-8");
    expect(src).toMatch(/import \{ resolvePlayerCartPosition \} from "@\/lib\/cartPosition"/);
  });

  it("calls resolvePlayerCartPosition inside the players.map", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"), "utf-8");
    expect(src).toMatch(/const \{ cart, position \} = resolvePlayerCartPosition\(config, i\)/);
  });

  it("old inline fallback (i < 2 ? \"A\" : \"B\") is gone — now handled by the helper", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/pages/CrybabyActiveRound.tsx"), "utf-8");
    // The old ternary used to live in the players.map return. If it's
    // still there, the helper migration didn't take.
    expect(src).not.toMatch(/cart:\s*config\.cart \|\| \(i < 2 \? "A" : "B"\)/);
  });
});
