// ============================================================
// CRYBABY — Shared Constants
// Courses, logo, colors
// ============================================================

// Logo: SVG inline version — replace with actual image when available
// The original logo is a cartoon crying baby with "CRYBABY" text
// For now, using a styled text+emoji SVG. Upload the real PNG and convert to base64.
export const CRYBABY_LOGO_PLACEHOLDER = true; // Set to false when real logo is embedded

export const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const MONO = "'SF Mono', 'JetBrains Mono', monospace";

// Course presets database. Originally Austin-only ("Beta: Austin, TX")
// — now also seeded with the three Sea Island Resort courses
// (St. Simons Island, GA) per PR adding Seaside, Plantation, Retreat.
// Variable name kept for API stability (CourseSearch.tsx, the wizard,
// and several tests import AUSTIN_COURSES); rename is a separate
// concern. Keep the existing rule: every course is { id, name, city,
// type, pars, handicaps, tees: [{ name, slope, rating, yardage }] }
// with `pars.length === handicaps.length === 18` (or 9 for the one
// 9-hole entry, marked with `holes: 9`).
export const AUSTIN_COURSES = [
  // === CITY OF AUSTIN MUNICIPAL (Golf ATX) ===
  { id: "lions", name: "Lions Municipal Golf Course", nickname: "Muny", city: "Austin", type: "municipal", pars: [4,4,3,4,5,4,3,5,4,4,4,4,3,4,5,4,3,5], handicaps: [5,3,15,9,1,11,17,7,13,6,2,14,16,10,4,8,18,12], tees: [{ name: "Blue", slope: 121, rating: 69.1, yardage: 6001 }, { name: "White", slope: 118, rating: 67.8, yardage: 5689 }] },
  { id: "jimmy_clay", name: "Jimmy Clay Golf Course", nickname: "", city: "Austin", type: "municipal", pars: [5,4,3,4,4,4,3,4,5,4,3,5,4,4,4,3,5,4], handicaps: [1,9,13,7,3,11,17,15,5,10,18,2,8,4,6,16,12,14], tees: [{ name: "Blue", slope: 126, rating: 70.7, yardage: 6557 }, { name: "White", slope: 121, rating: 68.8, yardage: 6087 }] },
  { id: "roy_kizer", name: "Roy Kizer Golf Course", nickname: "", city: "Austin", type: "municipal", pars: [4,5,4,3,4,3,5,4,4,4,4,3,4,5,4,3,5,4], handicaps: [7,1,11,15,3,17,5,9,13,6,10,18,8,2,12,16,4,14], tees: [{ name: "Blue", slope: 128, rating: 71.3, yardage: 6749 }, { name: "White", slope: 123, rating: 69.2, yardage: 6219 }] },
  { id: "morris_williams", name: "Morris Williams Golf Course", nickname: "", city: "Austin", type: "municipal", pars: [4,4,5,3,4,4,3,5,4,4,5,4,3,4,4,5,3,4], handicaps: [9,3,5,17,1,7,13,11,15,10,4,8,18,2,6,12,16,14], tees: [{ name: "Blue", slope: 127, rating: 70.4, yardage: 6636 }, { name: "White", slope: 122, rating: 68.5, yardage: 6126 }] },
  { id: "hancock", name: "Hancock Golf Course", nickname: "", city: "Austin", type: "municipal", holes: 9, pars: [4,3,3,5,3,4,4,3,4], handicaps: [3,5,9,1,7,4,2,8,6], tees: [{ name: "Blue", slope: 108, rating: 31.6, yardage: 2633 }] },
  { id: "grey_rock", name: "Grey Rock Golf Club", nickname: "", city: "Austin", type: "municipal", pars: [4,4,3,5,4,4,3,4,5,4,5,4,3,4,4,5,3,4], handicaps: [7,3,13,1,11,9,17,5,15,8,2,10,18,6,12,4,16,14], tees: [{ name: "Blue", slope: 135, rating: 72.5, yardage: 6808 }, { name: "White", slope: 129, rating: 70.2, yardage: 6290 }] },

  // === PRIVATE CLUBS ===
  // Westlake tees corrected 2026-04-19 to match the actual club card
  // (Black / Gold / Silver / Violet) and the new post-2025 handicap order.
  // NOTE: CrybabySetupWizard.jsx has an inline copy of AUSTIN_COURSES that
  // is kept in sync manually. See TODOS.md "Dedupe AUSTIN_COURSES".
  { id: "westlake", name: "Westlake Country Club", nickname: "", city: "Austin", type: "private", pars: [5,4,4,3,4,4,4,3,4,3,5,4,4,4,4,5,4,3], handicaps: [1,9,7,17,13,5,11,15,3,18,14,12,6,4,10,8,2,16], tees: [{ name: "Black", slope: 141, rating: 74.9, yardage: 6935 }, { name: "Gold", slope: 138, rating: 70.9, yardage: 6224 }, { name: "Silver", slope: 124, rating: 66.8, yardage: 5589 }, { name: "Violet", slope: 113, rating: 63.8, yardage: 4937 }] },
  { id: "austin_cc", name: "Austin Country Club", nickname: "ACC", city: "Austin", type: "private", pars: [4,4,3,5,4,4,4,3,5,4,4,3,4,5,4,4,3,5], handicaps: [5,9,17,1,7,3,11,15,13,8,4,16,10,2,6,12,18,14], tees: [{ name: "Blue", slope: 138, rating: 73.5, yardage: 7104 }, { name: "White", slope: 132, rating: 71.2, yardage: 6625 }] },
  { id: "spanish_oaks", name: "Spanish Oaks Golf Club", nickname: "", city: "Bee Cave", type: "private", pars: [4,5,3,4,4,3,5,4,4,4,3,5,4,4,3,4,5,4], handicaps: [7,3,15,1,9,17,5,11,13,8,16,2,6,10,18,12,4,14], tees: [{ name: "Blue", slope: 142, rating: 74.6, yardage: 7234 }, { name: "White", slope: 135, rating: 72.0, yardage: 6680 }] },
  { id: "lost_creek", name: "Lost Creek Country Club", nickname: "", city: "Austin", type: "private", pars: [4,5,4,3,4,3,4,4,5,4,3,5,4,4,4,3,5,4], handicaps: [9,1,5,15,7,17,11,3,13,10,18,4,8,2,6,16,12,14], tees: [{ name: "Blue", slope: 130, rating: 71.2, yardage: 6640 }, { name: "White", slope: 125, rating: 69.1, yardage: 6152 }] },
  { id: "onion_creek", name: "Onion Creek Club", nickname: "", city: "Austin", type: "private", pars: [4,3,4,5,4,4,3,5,4,5,4,4,3,4,4,3,5,4], handicaps: [7,15,3,1,9,5,17,11,13,2,10,8,18,4,6,16,12,14], tees: [{ name: "Blue", slope: 133, rating: 72.4, yardage: 6880 }, { name: "White", slope: 127, rating: 70.1, yardage: 6350 }] },
  { id: "river_place", name: "River Place Country Club", nickname: "", city: "Austin", type: "private", pars: [4,4,3,5,4,4,3,4,5,4,5,3,4,4,4,3,5,4], handicaps: [5,7,17,1,3,9,15,13,11,8,2,18,6,4,10,16,12,14], tees: [{ name: "Blue", slope: 137, rating: 73.1, yardage: 6931 }, { name: "White", slope: 131, rating: 70.8, yardage: 6400 }] },
  { id: "hills_lakeway", name: "The Hills of Lakeway", nickname: "The Hills", city: "Lakeway", type: "private", pars: [4,5,3,4,4,4,3,5,4,4,4,3,4,5,4,4,3,5], handicaps: [7,3,15,9,1,11,17,5,13,8,4,18,10,2,6,12,16,14], tees: [{ name: "Blue", slope: 134, rating: 72.3, yardage: 6914 }, { name: "White", slope: 128, rating: 70.0, yardage: 6380 }] },
  { id: "flintrock", name: "Flintrock Falls Golf Club", nickname: "Flintrock", city: "Lakeway", type: "private", pars: [4,4,5,3,4,4,3,4,5,4,3,5,4,4,3,4,5,4], handicaps: [9,5,1,17,7,3,15,11,13,10,18,2,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 139, rating: 73.8, yardage: 7093 }, { name: "White", slope: 133, rating: 71.5, yardage: 6560 }] },
  { id: "ut_golf", name: "UT Golf Club", nickname: "", city: "Austin", type: "private", pars: [4,4,5,3,4,4,3,5,4,4,5,3,4,4,4,3,5,4], handicaps: [5,9,1,15,7,3,17,11,13,8,2,18,10,4,6,16,12,14], tees: [{ name: "Blue", slope: 136, rating: 73.0, yardage: 6970 }, { name: "White", slope: 130, rating: 70.6, yardage: 6440 }] },
  { id: "cimarron_hills", name: "Cimarron Hills Golf & Country Club", nickname: "Cimarron", city: "Georgetown", type: "private", pars: [4,5,4,3,4,3,5,4,4,4,4,3,5,4,3,4,5,4], handicaps: [7,1,9,15,5,17,3,11,13,6,10,18,2,8,16,12,4,14], tees: [{ name: "Blue", slope: 141, rating: 74.2, yardage: 7159 }, { name: "White", slope: 134, rating: 71.8, yardage: 6610 }] },

  // === RESORT / SEMI-PRIVATE ===
  { id: "barton_fazio", name: "Barton Creek — Fazio Foothills", nickname: "Fazio", city: "Austin", type: "resort", pars: [4,5,3,4,4,4,3,4,5,4,3,4,5,4,4,3,5,4], handicaps: [7,1,17,9,3,11,15,13,5,8,18,4,2,6,14,16,10,12], tees: [{ name: "Blue", slope: 137, rating: 73.2, yardage: 6956 }, { name: "White", slope: 130, rating: 70.8, yardage: 6407 }] },
  { id: "barton_crenshaw", name: "Barton Creek — Crenshaw Cliffside", nickname: "Crenshaw", city: "Austin", type: "resort", pars: [4,3,4,5,4,3,4,4,5,4,5,3,4,4,4,3,5,4], handicaps: [9,17,5,1,7,15,3,11,13,10,2,18,8,6,12,16,4,14], tees: [{ name: "Blue", slope: 135, rating: 72.8, yardage: 6880 }, { name: "White", slope: 128, rating: 70.4, yardage: 6340 }] },
  { id: "barton_coore", name: "Barton Creek — Coore Crenshaw", nickname: "Coore", city: "Austin", type: "resort", pars: [4,4,5,3,4,4,3,5,4,4,3,4,5,4,3,4,5,4], handicaps: [5,11,1,15,7,9,17,3,13,8,16,6,2,10,18,12,4,14], tees: [{ name: "Blue", slope: 139, rating: 73.8, yardage: 7100 }, { name: "White", slope: 132, rating: 71.3, yardage: 6550 }] },
  { id: "barton_palmer", name: "Barton Creek — Palmer Lakeside", nickname: "Palmer", city: "Austin", type: "resort", pars: [4,5,4,3,4,3,5,4,4,4,4,3,5,4,4,3,4,5], handicaps: [7,3,9,15,1,17,5,11,13,6,10,18,2,8,12,16,14,4], tees: [{ name: "Blue", slope: 136, rating: 73.0, yardage: 6957 }, { name: "White", slope: 129, rating: 70.5, yardage: 6415 }] },
  { id: "falconhead", name: "Falconhead Golf Club", nickname: "", city: "Bee Cave", type: "semi-private", pars: [4,5,4,3,4,4,3,5,4,4,3,5,4,4,3,4,5,4], handicaps: [11,3,7,15,1,9,17,5,13,10,18,2,8,4,16,12,6,14], tees: [{ name: "Blue", slope: 136, rating: 73.0, yardage: 7002 }, { name: "White", slope: 130, rating: 70.6, yardage: 6490 }] },
  { id: "wolfdancer", name: "Wolfdancer Golf Club", nickname: "", city: "Cedar Creek", type: "resort", pars: [4,4,5,3,4,4,3,4,5,5,3,4,4,4,3,5,4,4], handicaps: [5,9,1,13,7,11,17,15,3,2,16,10,6,8,18,4,14,12], tees: [{ name: "Blue", slope: 140, rating: 74.1, yardage: 7205 }, { name: "White", slope: 133, rating: 71.5, yardage: 6645 }] },

  // === OTHER PUBLIC / DAILY FEE ===
  { id: "avery_ranch", name: "Avery Ranch Golf Club", nickname: "", city: "Austin", type: "public", pars: [4,3,5,4,4,3,4,5,4,4,5,3,4,4,5,4,3,4], handicaps: [9,15,1,5,11,17,7,3,13,10,4,16,8,2,6,14,18,12], tees: [{ name: "Blue", slope: 133, rating: 72.1, yardage: 6894 }, { name: "White", slope: 128, rating: 70.0, yardage: 6398 }] },
  { id: "star_ranch", name: "Star Ranch Golf Club", nickname: "", city: "Round Rock", type: "public", pars: [5,3,4,4,4,3,5,4,4,4,4,5,3,4,4,3,4,5], handicaps: [3,17,7,9,1,13,5,11,15,10,6,2,18,8,4,16,14,12], tees: [{ name: "Blue", slope: 132, rating: 72.0, yardage: 6860 }, { name: "White", slope: 126, rating: 69.6, yardage: 6310 }] },
  { id: "teravista", name: "Teravista Golf Club", nickname: "", city: "Round Rock", type: "public", pars: [4,4,3,5,4,3,4,5,4,4,3,5,4,4,3,4,5,4], handicaps: [9,5,17,1,7,15,11,3,13,8,18,2,6,10,16,12,4,14], tees: [{ name: "Blue", slope: 134, rating: 72.6, yardage: 6913 }, { name: "White", slope: 128, rating: 70.2, yardage: 6385 }] },
  { id: "crystal_falls", name: "Crystal Falls Golf Club", nickname: "", city: "Leander", type: "semi-private", pars: [4,5,3,4,4,4,3,5,4,4,4,3,5,4,4,3,4,5], handicaps: [7,1,15,9,3,11,17,5,13,6,10,18,2,8,12,16,14,4], tees: [{ name: "Blue", slope: 131, rating: 71.5, yardage: 6654 }, { name: "White", slope: 125, rating: 69.2, yardage: 6120 }] },
  { id: "shadow_glen", name: "Shadow Glen Golf Club", nickname: "", city: "Manor", type: "public", pars: [4,4,5,3,4,4,3,4,5,4,3,5,4,4,3,4,5,4], handicaps: [5,9,1,15,7,3,17,11,13,10,18,2,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 133, rating: 72.1, yardage: 6869 }, { name: "White", slope: 127, rating: 69.8, yardage: 6340 }] },
  { id: "plum_creek", name: "Plum Creek Golf Course", nickname: "", city: "Kyle", type: "public", pars: [4,5,3,4,4,4,3,5,4,4,5,3,4,4,3,4,5,4], handicaps: [9,1,17,7,3,11,15,5,13,10,2,18,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 130, rating: 71.4, yardage: 6753 }, { name: "White", slope: 124, rating: 69.0, yardage: 6210 }] },
  { id: "forest_creek", name: "Forest Creek Golf Club", nickname: "", city: "Round Rock", type: "public", pars: [4,4,5,3,4,4,3,4,5,4,4,3,5,4,4,3,5,4], handicaps: [7,3,1,17,9,5,15,11,13,8,6,18,2,10,4,16,12,14], tees: [{ name: "Blue", slope: 135, rating: 72.8, yardage: 7014 }, { name: "White", slope: 129, rating: 70.4, yardage: 6475 }] },
  { id: "kissing_tree", name: "Kissing Tree Golf Club", nickname: "", city: "San Marcos", type: "public", pars: [4,3,5,4,4,3,4,5,4,5,4,3,4,4,3,4,5,4], handicaps: [5,15,1,9,7,17,11,3,13,2,8,18,6,10,16,12,4,14], tees: [{ name: "Blue", slope: 132, rating: 71.8, yardage: 6842 }, { name: "White", slope: 126, rating: 69.5, yardage: 6310 }] },
  { id: "vaaler_creek", name: "Vaaler Creek Golf Club", nickname: "", city: "Pflugerville", type: "public", pars: [4,4,3,5,4,3,4,5,4,4,5,3,4,4,4,3,5,4], handicaps: [9,5,15,1,7,17,11,3,13,8,2,18,6,10,12,16,4,14], tees: [{ name: "Blue", slope: 129, rating: 71.0, yardage: 6630 }, { name: "White", slope: 123, rating: 68.8, yardage: 6100 }] },
  { id: "riverside", name: "Riverside Golf Course", nickname: "", city: "Austin", type: "public", pars: [5,4,3,4,4,4,3,5,4,4,5,4,3,4,4,5,3,4], handicaps: [3,7,15,5,1,9,17,11,13,8,2,10,18,4,6,12,16,14], tees: [{ name: "Blue", slope: 124, rating: 69.8, yardage: 6308 }, { name: "White", slope: 119, rating: 67.9, yardage: 5880 }] },
  { id: "colovista", name: "ColoVista Country Club", nickname: "", city: "Bastrop", type: "semi-private", pars: [4,5,4,3,4,3,5,4,4,4,3,5,4,4,3,4,5,4], handicaps: [7,1,9,15,5,17,3,11,13,10,18,2,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 134, rating: 72.3, yardage: 6886 }, { name: "White", slope: 128, rating: 70.0, yardage: 6350 }] },

  // === SEA ISLAND RESORT (St. Simons Island, GA) ===
  // Tee names follow BlueGolf's published scorecard naming (Red /
  // Blue / White / Green) so the slope + rating + handicap data stay
  // internally consistent. seaisland.com's marketing pages use a
  // different label set (Blue / White / Green / Black / Gold) but
  // do not publish slope or rating per label — using BlueGolf's
  // labels keeps the per-tee numbers verifiable. Pars + per-hole
  // handicap stroke indexes verified against seaisland.com (pars
  // match exactly).
  // Source: course.bluegolf.com (accessed 2026-04-27).
  { id: "sea_island_seaside", name: "Sea Island — Seaside Course", nickname: "Seaside", city: "St. Simons Island", type: "resort", pars: [4,4,3,4,4,3,5,4,4,4,4,3,4,4,5,4,3,4], handicaps: [7,3,9,1,11,17,15,13,5,6,10,12,2,16,14,8,18,4], tees: [{ name: "Red", slope: 138, rating: 73.8, yardage: 6883 }, { name: "Blue", slope: 139, rating: 72.4, yardage: 6568 }, { name: "White", slope: 135, rating: 70.9, yardage: 6277 }, { name: "Green", slope: 128, rating: 69.2, yardage: 5895 }] },
  { id: "sea_island_plantation", name: "Sea Island — Plantation Course", nickname: "Plantation", city: "St. Simons Island", type: "resort", pars: [4,4,3,5,4,4,3,5,4,4,3,4,4,5,4,3,4,5], handicaps: [15,5,11,9,1,7,13,17,3,18,8,4,2,10,14,16,6,12], tees: [{ name: "Red", slope: 129, rating: 74.0, yardage: 6999 }, { name: "Blue", slope: 124, rating: 72.3, yardage: 6640 }, { name: "White", slope: 120, rating: 70.5, yardage: 6183 }, { name: "Green", slope: 116, rating: 69.1, yardage: 5818 }] },
  { id: "sea_island_retreat", name: "Sea Island — Retreat Course", nickname: "Retreat", city: "St. Simons Island", type: "resort", pars: [5,4,3,4,4,4,3,5,4,5,4,3,4,4,4,3,5,4], handicaps: [13,5,11,1,7,17,15,9,3,16,6,14,8,2,10,18,12,4], tees: [{ name: "Red", slope: 133, rating: 73.9, yardage: 7110 }, { name: "Blue", slope: 131, rating: 72.6, yardage: 6723 }, { name: "White", slope: 128, rating: 70.8, yardage: 6350 }, { name: "Green", slope: 124, rating: 68.6, yardage: 5876 }] },
];

// Group courses by type for dropdown
export const COURSE_GROUPS = [
  { label: "🏛️ City of Austin Municipal", type: "municipal" },
  { label: "🔒 Private Clubs", type: "private" },
  { label: "⛳ Resort / Semi-Private", types: ["resort", "semi-private"] },
  { label: "🏌️ Public / Daily Fee", type: "public" },
];

export const AVATAR_COLORS = [
  "#16A34A", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];
