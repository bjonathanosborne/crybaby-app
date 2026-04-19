// ============================================================
// Transition cities for the "OK. Cool onto [city]" beat between
// hammer holes. Cincinnati is the group's inside joke — always
// the first city. Everything after is variety for rhythm.
//
// Easy to swap / extend — just a single module.
// ============================================================

export const CINCINNATI = "Cincinnati";

export const TRANSITION_CITIES: readonly string[] = [
  "Toledo",
  "Duluth",
  "Muncie",
  "Boca",
  "Akron",
  "Tulsa",
  "Fresno",
  "Bakersfield",
  "Yuma",
  "Spokane",
  "Wichita",
  "Scranton",
  "Poughkeepsie",
  "Kalamazoo",
  "Sheboygan",
  "Peoria",
  "Albuquerque",
  "Tallahassee",
  "Cheyenne",
  "Boise",
];

/**
 * Pick the next transition city.
 *
 * If this is the first hole of the capture session (`usedCities` is
 * empty), always Cincinnati. Otherwise a random city from
 * TRANSITION_CITIES that's not already been used this session. If
 * every city is exhausted (>20 hole range, unrealistic for a round),
 * allow repeats and pick randomly from the full list.
 */
export function pickTransitionCity(
  usedCities: ReadonlySet<string>,
  rng: () => number = Math.random,
): string {
  if (usedCities.size === 0) return CINCINNATI;
  const remaining = TRANSITION_CITIES.filter(c => !usedCities.has(c));
  const pool = remaining.length > 0 ? remaining : TRANSITION_CITIES;
  const idx = Math.floor(rng() * pool.length);
  return pool[idx] ?? pool[0];
}
