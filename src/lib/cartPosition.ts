// ============================================================
// Cart + position normalisation (PR #23 D2).
//
// Pre-fix, the setup wizard stored the full dropdown label as
// `playerConfig[i].cart` (e.g. "Cart A — Driver") and left
// `playerConfig[i].position` null. The engine's `getDOCTeams`
// compares `p.cart === 'A'` and `p.position === 'driver'` — so
// any DOC round created through the old picker produced empty
// team rosters on the Others (6-10) and Carts (11-15) phases.
//
// This module parses both legacy combined strings and the new
// letter-only shape into a canonical `{ cart: 'A'|'B', position:
// 'driver'|'rider' }` that the engine can consume unchanged.
// Normalisation happens at round-load time in CrybabyActiveRound;
// the engine stays untouched.
// ============================================================

export type Cart = "A" | "B";
export type Position = "driver" | "rider";

export interface CartPositionResolved {
  cart: Cart | null;
  position: Position | null;
}

/**
 * Parse a single `playerConfig[i]` slot's cart + position fields
 * into canonical single-letter / single-word values. Accepts:
 *
 *   - new shape:    cart: 'A'|'B', position: 'driver'|'rider'
 *   - legacy shape: cart: "Cart A — Driver" (position usually null)
 *   - partial / missing / garbage: returns null for the unresolved half
 *
 * Intentionally tolerant: never throws. Callers can fall back to
 * index-based guesses when both fields resolve to null.
 *
 * Handles the em-dash (—) variant actually written by the wizard,
 * plus a hyphen (-) variant just in case any user-typed migration
 * sneaks a different separator in.
 */
export function resolveCartPosition(raw: {
  cart?: string | null;
  position?: string | null;
}): CartPositionResolved {
  const rawCart = typeof raw.cart === "string" ? raw.cart.trim() : "";
  const rawPos = typeof raw.position === "string" ? raw.position.trim() : "";

  // Fast-path: already-canonical values.
  let cart: Cart | null = null;
  let position: Position | null = null;
  if (rawCart === "A" || rawCart === "B") cart = rawCart;
  if (rawPos === "driver" || rawPos === "rider") position = rawPos;

  // Legacy combined-label parsing. Only run if either half is still
  // unresolved — avoids regex work on modern rounds.
  if (cart === null || position === null) {
    const combined = rawCart || rawPos; // legacy stored it all in `cart`
    if (combined) {
      // "Cart A — Driver" | "Cart A - Driver" | "cart b – rider" (en-dash)
      const match = /cart\s+([ab])\s*[—–-]\s*(driver|rider)/i.exec(combined);
      if (match) {
        if (cart === null) {
          const letter = match[1].toUpperCase();
          if (letter === "A" || letter === "B") cart = letter;
        }
        if (position === null) {
          const role = match[2].toLowerCase();
          if (role === "driver" || role === "rider") position = role;
        }
      } else {
        // Last-chance: "Cart A" on its own → resolve cart but not position.
        const cartOnly = /cart\s+([ab])\b/i.exec(combined);
        if (cartOnly && cart === null) {
          const letter = cartOnly[1].toUpperCase();
          if (letter === "A" || letter === "B") cart = letter;
        }
      }
    }
  }

  return { cart, position };
}

/**
 * Resolve every player's cart + position from a playerConfig array,
 * falling back to deterministic index-based assignments when the
 * config is incomplete. Used at round-load time in
 * CrybabyActiveRound to produce the player objects passed to the
 * engine's `getDOCTeams`.
 *
 * The fallback pattern mirrors the existing runtime behaviour:
 *   - first two players → cart A, remaining → cart B
 *   - alternating driver / rider
 *
 * Intentionally kept here rather than inlined in the component so
 * tests can exercise the normalisation + fallback chain without
 * mounting React.
 */
export function resolvePlayerCartPosition(
  config: { cart?: string | null; position?: string | null } | null | undefined,
  playerIndex: number,
): { cart: Cart; position: Position } {
  const parsed = resolveCartPosition(config ?? {});
  const fallbackCart: Cart = playerIndex < 2 ? "A" : "B";
  const fallbackPosition: Position = playerIndex % 2 === 0 ? "driver" : "rider";
  return {
    cart: parsed.cart ?? fallbackCart,
    position: parsed.position ?? fallbackPosition,
  };
}
