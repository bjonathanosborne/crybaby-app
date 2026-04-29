import { useState, useEffect, useCallback, useRef } from "react";
import { startRound, loadActiveRound, loadProfile } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";
import AddClubModal from "@/components/AddClubModal";
import { Users, RotateCcw, Flag, Coins, Sliders, Globe, Lock, EyeOff, Eye, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WolfIcon, HammerIcon, CrybabyBottleIcon, BirdieIcon, MoneyIcon, PressIcon } from "@/components/icons/CrybIcons";
import CourseSearch from "@/components/CourseSearch";
// PR #30 commit 4: dedup AUSTIN_COURSES. The inline duplicate that
// drifted from constants.js (the "Westlake had Blue/White vs.
// Black/Gold/Silver/Violet" bug — see TODOS.md) is gone. Wizard
// now imports the canonical source. COURSE_GROUPS stays local
// because the wizard's labels differ from constants.js's emoji-
// prefixed labels — the UI shape is the wizard's concern.
import { AUSTIN_COURSES } from "@/data/constants";

// ============================================================
// CRYBABY — Game Setup Wizard
// Apple-level design, sans-serif, clean & fun
// ============================================================

// --- DATA ---
// GAME_FORMATS lives in src/lib/gameFormats.ts so tests can import without
// pulling the Supabase client init into jsdom. The wizard just consumes it.
import { GAME_FORMATS } from "@/lib/gameFormats";
export { GAME_FORMATS }; // re-exported for any existing callers

// SVG icon renderer per game — keyed by game id
const GAME_ICON = {
  drivers_others_carts: (s) => <Users size={s} strokeWidth={1.75} />,
  flip:                 (s) => <RotateCcw size={s} strokeWidth={1.75} />,
  nassau:               (s) => <Flag size={s} strokeWidth={1.75} />,
  skins:                (s) => <MoneyIcon size={s} />,
  wolf:                 (s) => <WolfIcon size={s} />,
  solo:                 (s) => <ClipboardList size={s} strokeWidth={1.75} />,
  custom:               (s) => <Sliders size={s} strokeWidth={1.75} />,
};


const COURSE_GROUPS = [
  { label: "City of Austin Municipal", types: ["municipal"] },
  { label: "Private Clubs", types: ["private"] },
  { label: "Resort / Semi-Private", types: ["resort", "semi-private"] },
  { label: "Public / Daily Fee", types: ["public"] },
];

const TYPE_COLORS = { municipal: "#059669", public: "#2D5016", private: "#7C3AED", "semi-private": "#3B82F6", resort: "#F59E0B" };

const MECHANICS_CONFIG = {
  hammer:       { label: "Hammer",          icon: (s) => <HammerIcon size={s} />,        description: "Double-or-nothing mid-hole challenge" },
  crybaby:      { label: "Crybaby",         icon: (s) => <CrybabyBottleIcon size={s} />, description: "End-of-round redemption for the biggest loser" },
  birdie_bonus: { label: "Birdie Bonus",    icon: (s) => <BirdieIcon size={s} />,        description: "Birdies multiply the hole value" },
  carry_overs:  { label: "Carry-Overs",     icon: (s) => <RotateCcw size={s} strokeWidth={2} />, description: "Tied holes carry value to the next hole" },
  presses:      { label: "Presses",         icon: (s) => <PressIcon size={s} />,         description: "New bet when a team goes 2-down" },
  pops:         { label: "Handicap Strokes",icon: (s) => <Users size={s} strokeWidth={2} />, description: "Stroke allocation based on GHIN handicap" },
  lone_wolf:    { label: "Lone Wolf",       icon: (s) => <WolfIcon size={s} />,          description: "Go solo for multiplied stakes" },
  greenies:     { label: "Greenies",        icon: (s) => <Flag size={s} strokeWidth={2} />, description: "Closest to pin on par 3s" },
  sandies:      { label: "Sandies",         icon: (s) => <Coins size={s} strokeWidth={2} />, description: "Par or better from a bunker" },
  kps:          { label: "KPs",             icon: (s) => <Flag size={s} strokeWidth={2} />, description: "Closest to the pin side bets" },
  no_pops_par3: { label: "No Pops Par 3s",  icon: (s) => <Sliders size={s} strokeWidth={2} />, description: "No handicap strokes on par 3s" },
};

// --- STEP INDICATOR ---
function StepIndicator({ steps, currentStep }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 8px", marginBottom: 10 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600,
            fontFamily: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            background: i <= currentStep ? "#2D5016" : "#DDD0BB",
            color: i <= currentStep ? "#fff" : "#A8957B",
            transition: "all 0.3s ease",
          }}>
            {i < currentStep ? "✓" : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: "0 4px",
              background: i < currentStep ? "#2D5016" : "#DDD0BB",
              transition: "background 0.3s ease",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- GAME FORMAT CARD ---
function GameCard({ game, selected, onSelect, playerCount }) {
  const fits = playerCount >= game.players.min && playerCount <= game.players.max;
  const isSelected = selected === game.id;
  return (
    <button
      onClick={() => onSelect(game.id)}
      disabled={!fits && playerCount > 0}
      style={{
        width: "100%", textAlign: "left", border: "none", cursor: fits || playerCount === 0 ? "pointer" : "not-allowed",
        background: isSelected ? "#EEF5E5" : "#FAF5EC",
        borderRadius: 16, padding: "20px 20px",
        boxShadow: isSelected ? "0 0 0 2px #2D5016, 0 2px 8px rgba(45,80,22,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
        opacity: !fits && playerCount > 0 ? 0.4 : 1,
        transition: "all 0.2s ease",
        transform: isSelected ? "scale(1.01)" : "scale(1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: isSelected ? "rgba(45,80,22,0.12)" : "#EDE7D9",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isSelected ? "#2D5016" : "#8B7355",
          transition: "all 0.2s ease",
        }}>
          {GAME_ICON[game.id]?.(22)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: 15, fontWeight: 400, color: "#2D5016", marginBottom: 4,
          }}>
            {game.name}
          </div>
          <div style={{
            fontFamily: "'Lato', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 13, color: "#8B7355", lineHeight: 1.45,
          }}>
            {game.description}
          </div>
          <div style={{
            marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              background: "#EDE7D9", color: "#8B7355",
              fontFamily: "'Lato', -apple-system, sans-serif",
            }}>
              {game.players.min === game.players.max ? `${game.players.min}P` : `${game.players.min}-${game.players.max}P`}
            </span>
            {game.mechanics.slice(0, 3).map(m => (
              <span key={m} style={{
                fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                background: "#FEF3C7", color: "#92400E",
                fontFamily: "'Lato', -apple-system, sans-serif",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {MECHANICS_CONFIG[m]?.icon(11)}
                {MECHANICS_CONFIG[m]?.label}
              </span>
            ))}
          </div>
        </div>
        {isSelected && (
          <div style={{
            width: 24, height: 24, borderRadius: 12, background: "#2D5016",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>✓</div>
        )}
      </div>
    </button>
  );
}

// --- PLAYER ROW ---
function PlayerRow({ player, index, onUpdate, onRemove, showCarts, cartOptions, canRemove, currentUserId }) {
  const font = "'Lato', -apple-system, BlinkMacSystemFont, sans-serif";
  const mono = "'SF Mono', 'JetBrains Mono', monospace";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isLinkedUser, setIsLinkedUser] = useState(!!player.userId);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      // Search friends first, then all users
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id_a, user_id_b")
        .eq("status", "accepted")
        .or(`user_id_a.eq.${currentUserId},user_id_b.eq.${currentUserId}`);
      
      const friendIds = (friendships || []).map(f =>
        f.user_id_a === currentUserId ? f.user_id_b : f.user_id_a
      );

      const { data: results } = await supabase.rpc("search_users_by_name", { _query: q });
      
      // Sort friends first
      const sorted = (results || []).map(r => ({
        ...r,
        isFriend: friendIds.includes(r.user_id),
      })).sort((a, b) => (b.isFriend ? 1 : 0) - (a.isFriend ? 1 : 0));
      
      setSearchResults(sorted.slice(0, 10));
    } catch (e) {
      console.error("Player search error:", e);
    } finally {
      setSearching(false);
    }
  }, [currentUserId]);

  const handleNameChange = (val) => {
    onUpdate(index, { ...player, name: val, userId: null });
    setIsLinkedUser(false);
    setSearchQuery(val);
    clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => {
        doSearch(val);
        setShowDropdown(true);
      }, 300);
    } else {
      setShowDropdown(false);
      setSearchResults([]);
    }
  };

  const selectUser = (user) => {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name || "";
    onUpdate(index, {
      ...player,
      name: displayName,
      handicap: user.handicap,
      ghin: user.ghin || "",
      userId: user.user_id,
    });
    setIsLinkedUser(true);
    setShowDropdown(false);
    setSearchResults([]);
    setSearchQuery("");
  };

  const clearLinkedUser = () => {
    onUpdate(index, { ...player, name: "", handicap: null, ghin: "", userId: null });
    setIsLinkedUser(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
      background: "#FAF5EC", borderRadius: 12,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      transition: "all 0.2s ease",
      border: isLinkedUser ? "1.5px solid #2D5016" : "1px solid transparent",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 16, marginTop: 6,
        background: isLinkedUser ? "#2D5016" : ["#2D5016", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899"][index % 6],
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: font, flexShrink: 0,
      }}>
        {player.name ? player.name[0].toUpperCase() : (index + 1)}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0, position: "relative" }} ref={dropdownRef}>
        {isLinkedUser ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
            background: "#EEF5E5", borderRadius: 8, border: "1px solid #BBF7D0",
            minHeight: 44, boxSizing: "border-box",
          }}>
            <span style={{ fontFamily: font, fontSize: 16, fontWeight: 600, color: "#1E130A", flex: 1 }}>
              {player.name}
            </span>
            <button onClick={clearLinkedUser} style={{
              width: 24, height: 24, borderRadius: 12, border: "none",
              background: "#DC262620", color: "#DC2626", cursor: "pointer",
              fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          </div>
        ) : (
          <input
            value={player.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder={`Search or type Player ${index + 1}`}
            style={{
              fontFamily: font, fontSize: 16, fontWeight: 500, color: "#1E130A",
              border: "1px solid #DDD0BB", background: "#FAF5EC", borderRadius: 8,
              outline: "none", padding: "10px 12px", width: "100%",
              minHeight: 44, boxSizing: "border-box",
            }}
          />
        )}

        {/* Search dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div style={{
            position: "absolute", top: 48, left: 0, right: 0, zIndex: 50,
            background: "#FAF5EC", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            border: "1px solid #DDD0BB", maxHeight: 240, overflowY: "auto",
          }}>
            {searchResults.map((u, i) => (
              <button key={u.user_id} onClick={() => selectUser(u)} style={{
                width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                padding: "10px 14px", background: "transparent",
                borderBottom: i < searchResults.length - 1 ? "1px solid #F3F4F6" : "none",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 14, objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: 14, background: "#DDD0BB",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#8B7355",
                  }}>
                    {(u.display_name || "?")[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: "#1E130A", display: "flex", alignItems: "center", gap: 6 }}>
                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.display_name}
                    {u.isFriend && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#DBEAFE", color: "#2563EB" }}>Friend</span>
                    )}
                  </div>
                  <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", display: "flex", gap: 8 }}>
                    {u.handicap != null && <span>HCP {u.handicap}</span>}
                    {u.home_course && <span>{u.home_course}</span>}
                  </div>
                </div>
              </button>
            ))}
            <div style={{
              padding: "8px 14px", borderTop: "1px solid #F3F4F6",
              fontFamily: font, fontSize: 11, color: "#A8957B", textAlign: "center",
            }}>
              Or just type a name for a guest player
            </div>
          </div>
        )}
        {showDropdown && searching && (
          <div style={{
            position: "absolute", top: 48, left: 0, right: 0, zIndex: 50,
            background: "#FAF5EC", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            padding: "14px", textAlign: "center", fontFamily: font, fontSize: 13, color: "#A8957B",
          }}>
            Searching…
          </div>
        )}

        {/* Empty-state prompt: when a LINKED user (userId set, implies profile
            was loaded) has no handicap on their profile, surface an explicit
            nudge to the scorekeeper. Guests don't show this — a null handicap
            on a guest row is the default starting state, not a gap.
            Round-specific value does NOT back-save to the profile (per spec). */}
        {player.userId && (player.handicap === null || player.handicap === undefined) && (
          <div
            data-testid={`player-handicap-empty-prompt-${index}`}
            style={{
              fontFamily: font, fontSize: 11, color: "#8B7355",
              background: "#FFF4D1", border: "1px solid #F5D77B",
              borderRadius: 8, padding: "6px 10px", lineHeight: 1.4,
            }}
          >
            {(player.name || "This player").split(" ")[0] || "This player"} hasn't set a handicap. Enter one for this round?
          </div>
        )}

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            value={player.handicap ?? ""}
            onChange={e => {
              const val = e.target.value;
              if (val === "") { onUpdate(index, { ...player, handicap: null }); return; }
              const num = parseFloat(val);
              if (isNaN(num)) return;
              // Clamp to the shared handicap bounds (-5 to 54, 0.1 step).
              // The bounds live in src/lib/handicap.ts; duplicating the numeric
              // literals here avoids an import into this .jsx file and keeps
              // the wizard's inline validation fast. Spec 2026-04-20.
              const clamped = Math.min(54, Math.max(-5, num));
              onUpdate(index, { ...player, handicap: clamped });
            }}
            placeholder="HCP"
            min="-5"
            max="54"
            step="0.1"
            data-testid={`player-handicap-input-${index}`}
            style={{
              fontFamily: mono, fontSize: 13, color: "#8B7355",
              border: "1px solid #DDD0BB", borderRadius: 6, padding: "8px 10px",
              width: 72, background: "#FAF5EC", outline: "none",
              minHeight: 36, boxSizing: "border-box",
            }}
          />
          {showCarts && (
            // PR #23 D2: the combined "Cart A — Driver" picker wrote the
            // whole label string into `player.cart` and left `player.position`
            // null, so downstream `getDOCTeams` (which compares `p.cart === 'A'`
            // and `p.position === 'driver'`) returned empty team rosters for
            // every DOC round. Split into two independent pickers and store
            // the letter / role separately — what the engine has always
            // expected.
            <>
              <select
                value={player.cart || ""}
                onChange={e => onUpdate(index, { ...player, cart: e.target.value })}
                data-testid={`player-cart-select-${index}`}
                style={{
                  fontFamily: font, fontSize: 12, color: "#8B7355",
                  border: "1px solid #DDD0BB", borderRadius: 6, padding: "8px 10px",
                  background: "#FAF5EC", outline: "none",
                  minHeight: 36, boxSizing: "border-box",
                  flex: 1, minWidth: 70,
                }}
              >
                <option value="">Cart…</option>
                <option value="A">Cart A</option>
                <option value="B">Cart B</option>
              </select>
              <select
                value={player.position || ""}
                onChange={e => onUpdate(index, { ...player, position: e.target.value })}
                data-testid={`player-position-select-${index}`}
                style={{
                  fontFamily: font, fontSize: 12, color: "#8B7355",
                  border: "1px solid #DDD0BB", borderRadius: 6, padding: "8px 10px",
                  background: "#FAF5EC", outline: "none",
                  minHeight: 36, boxSizing: "border-box",
                  flex: 1, minWidth: 80,
                }}
              >
                <option value="">Position…</option>
                <option value="driver">Driver</option>
                <option value="rider">Rider</option>
              </select>
            </>
          )}
        </div>
      </div>
      {canRemove && (
        <button
          onClick={() => onRemove(index)}
          style={{
            width: 32, height: 32, borderRadius: 16, border: "none",
            background: "#FEE2E2", color: "#DC2626", cursor: "pointer",
            fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0, marginTop: 6,
          }}
        >×</button>
      )}
    </div>
  );
}

// --- COURSE CARD ---
function CourseCard({ course, selected, onSelect }) {
  const isSelected = selected === course.id;
  const typeColors = { public: "#2D5016", private: "#7C3AED", "semi-private": "#3B82F6", resort: "#F59E0B" };
  return (
    <button
      onClick={() => onSelect(course.id)}
      style={{
        width: "100%", textAlign: "left", border: "none", cursor: "pointer",
        background: isSelected ? "#EEF5E5" : "#fff", borderRadius: 14,
        padding: "14px 16px",
        boxShadow: isSelected ? "0 0 0 2px #2D5016, 0 2px 8px rgba(45,80,22,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{
            fontFamily: "'Lato', -apple-system, sans-serif",
            fontSize: 15, fontWeight: 600, color: "#1E130A", marginBottom: 3,
          }}>{course.name}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              fontFamily: "'Lato', -apple-system, sans-serif",
              fontSize: 12, color: "#8B7355",
            }}>{course.city}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: typeColors[course.type] + "18",
              color: typeColors[course.type],
              fontFamily: "'Lato', -apple-system, sans-serif",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{course.type}</span>
          </div>
        </div>
        {isSelected && (
          <div style={{
            width: 24, height: 24, borderRadius: 12, background: "#2D5016",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14, fontWeight: 700,
          }}>✓</div>
        )}
      </div>
      {isSelected && course.tees && (
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {course.tees.map(tee => (
            <span key={tee.name} style={{
              fontFamily: "'SF Mono', monospace", fontSize: 11, padding: "3px 8px",
              borderRadius: 6, background: "#EDE7D9", color: "#8B7355",
            }}>
              {tee.name} · {tee.yardage}y · {tee.slope}/{tee.rating}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// --- MECHANIC TOGGLE ---
function MechanicToggle({ id, config, enabled, onToggle, expanded, onExpand, settings, onSettings }) {
  const font = "'Lato', -apple-system, BlinkMacSystemFont, sans-serif";
  return (
    <div style={{
      background: enabled ? "#EEF5E5" : "#fff", borderRadius: 14, overflow: "hidden",
      boxShadow: enabled ? "0 0 0 1.5px #2D501620, 0 1px 3px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.06)",
      transition: "all 0.2s ease",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer",
      }} onClick={() => onToggle(id)}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: enabled ? "rgba(45,80,22,0.10)" : "#EDE7D9",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: enabled ? "#2D5016" : "#8B7355", transition: "all 0.2s ease",
        }}>
          {config.icon(18)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{config.label}</div>
          <div style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>{config.description}</div>
        </div>
        <div
          onClick={e => { e.stopPropagation(); onToggle(id); }}
          style={{
            width: 48, height: 28, borderRadius: 14, padding: 2, cursor: "pointer",
            background: enabled ? "#2D5016" : "#CEC0AA", transition: "background 0.2s ease",
            display: "flex", alignItems: "center",
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 12, background: "#FAF5EC",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transform: enabled ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.2s ease",
          }} />
        </div>
      </div>
      {enabled && id === "hammer" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["Losing team only", "Either team"].map(opt => (
              <button key={opt} onClick={() => onSettings(id, { ...settings, initiator: opt })} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: font, fontSize: 12, fontWeight: 600,
                background: settings?.initiator === opt ? "#2D5016" : "#EDE7D9",
                color: settings?.initiator === opt ? "#fff" : "#8B7355",
                transition: "all 0.15s ease",
              }}>{opt}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Max depth:</span>
            {[1, 2, 3, "∞"].map(d => (
              <button key={d} onClick={() => onSettings(id, { ...settings, maxDepth: d })} style={{
                width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "'SF Mono', monospace", fontSize: 13, fontWeight: 600,
                background: settings?.maxDepth === d ? "#2D5016" : "#EDE7D9",
                color: settings?.maxDepth === d ? "#fff" : "#8B7355",
              }}>{d}</button>
            ))}
          </div>
        </div>
      )}
      {enabled && id === "crybaby" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Crybaby holes:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => onSettings(id, { ...settings, holes: n })} style={{
                width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "'SF Mono', monospace", fontSize: 13, fontWeight: 600,
                background: settings?.holes === n ? "#2D5016" : "#EDE7D9",
                color: settings?.holes === n ? "#fff" : "#8B7355",
              }}>{n}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Only crybaby hammers", "Anyone can hammer"].map(opt => (
              <button key={opt} onClick={() => onSettings(id, { ...settings, hammerRule: opt })} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: font, fontSize: 11, fontWeight: 600,
                background: settings?.hammerRule === opt ? "#3B82F6" : "#EDE7D9",
                color: settings?.hammerRule === opt ? "#fff" : "#8B7355",
              }}>{opt}</button>
            ))}
          </div>
        </div>
      )}
      {enabled && id === "birdie_bonus" && (
        <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Multiplier:</span>
          {["2x", "3x", "4x"].map(m => (
            <button key={m} onClick={() => onSettings(id, { ...settings, multiplier: m })} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'SF Mono', monospace", fontSize: 13, fontWeight: 600,
              background: settings?.multiplier === m ? "#2D5016" : "#EDE7D9",
              color: settings?.multiplier === m ? "#fff" : "#8B7355",
            }}>{m}</button>
          ))}
        </div>
      )}
      {enabled && id === "carry_overs" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Max carry-overs:</span>
            {["None", 1, 2, 3, 5, "∞"].map(c => (
              <button key={c} onClick={() => onSettings(id, { ...settings, cap: c })} style={{
                minWidth: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                padding: "0 8px",
                fontFamily: c === "None" || c === "∞" ? font : "'SF Mono', monospace",
                fontSize: c === "None" ? 11 : 13, fontWeight: 600,
                background: settings?.cap === c ? "#2D5016" : "#EDE7D9",
                color: settings?.cap === c ? "#fff" : "#8B7355",
              }}>{c}</button>
            ))}
          </div>
          {settings?.cap === "None" && (
            <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", fontStyle: "italic" }}>
              Pushes reset — no value carries forward. Keeps things predictable.
            </div>
          )}
        </div>
      )}
      {enabled && id === "presses" && (
        <div style={{ padding: "0 16px 14px", display: "flex", gap: 8 }}>
          {["Auto-press when 2 down", "Optional (must request)"].map(opt => (
            <button key={opt} onClick={() => onSettings(id, { ...settings, autoPress: opt })} style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: font, fontSize: 12, fontWeight: 600,
              background: settings?.autoPress === opt ? "#2D5016" : "#EDE7D9",
              color: settings?.autoPress === opt ? "#fff" : "#8B7355",
            }}>{opt}</button>
          ))}
        </div>
      )}
      {/* pops handicapPercent button tabs removed in PR #17 commit 2. The
          setting is now a top-level slider (see HandicapPercentSlider below)
          visible for DOC + Flip regardless of whether pops is enabled. */}
    </div>
  );
}

// --- HANDICAP PERCENTAGE SLIDER (PR #17 commit 2) ---
//
// Per-round scale factor applied uniformly to every player's raw
// handicap. Pulled out of the `pops` mechanic block so the scorekeeper
// can set a team-game reduction (e.g. 80%) without having to enable
// pops as a separate toggle. Visible only for DOC + Flip — Skins,
// Nassau, Solo, Custom all use 100% and this control stays hidden.
//
// Stored at round creation via `rounds.handicap_percent` (new column,
// migration 20260420030000). Legacy rounds that predate the column
// read through `resolveHandicapPercent` with a fallback chain to the
// old `course_details.mechanicSettings.pops.handicapPercent` location.
function HandicapPercentSlider({ value, onChange, font }) {
  const mono = "'SF Mono', 'JetBrains Mono', monospace";
  return (
    <div
      data-testid="handicap-percent-slider"
      style={{
        background: "#FAF5EC", borderRadius: 14, padding: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016" }}>
          Handicap %
        </div>
        <div
          data-testid="handicap-percent-value"
          style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: "#1E130A" }}
        >
          {value}%
        </div>
      </div>
      <input
        type="range"
        min={50}
        max={100}
        step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        data-testid="handicap-percent-slider-input"
        aria-label="Handicap percentage"
        aria-valuemin={50}
        aria-valuemax={100}
        aria-valuenow={value}
        style={{
          width: "100%",
          accentColor: "#2D5016",
        }}
      />
      <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", lineHeight: 1.4 }}>
        Scale each player's handicap for team fairness. 100% = full handicap, 80% = common team-game reduction.
      </div>
    </div>
  );
}

// --- REVIEW SECTION ---
function ReviewSection({ label, value, icon }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "#FAF5EC", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: "#EDE7D9", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#8B7355",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Lato', -apple-system, sans-serif",
          fontSize: 11, fontWeight: 600, color: "#A8957B",
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2,
        }}>{label}</div>
        <div style={{
          fontFamily: "'Lato', -apple-system, sans-serif",
          fontSize: 14, fontWeight: 600, color: "#1E130A",
        }}>{value}</div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CrybabSetupWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const font = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const mono = "'SF Mono', 'JetBrains Mono', monospace";

  const [step, setStep] = useState(0);
  const steps = ["Format", "Players", "Course", "Rules", "Review"];

  // State
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [players, setPlayers] = useState([
    { name: "", ghin: "", handicap: null, cart: "", position: "" },
    { name: "", ghin: "", handicap: null, cart: "", position: "" },
  ]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCourseData, setSelectedCourseData] = useState(null);
  const [selectedTee, setSelectedTee] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [userCourses, setUserCourses] = useState([]);
  const [showAddClub, setShowAddClub] = useState(false);
  const [holeValue, setHoleValue] = useState(5);
  // Flip-specific config (C4B). Only consumed when selectedFormat === 'flip'.
  //   baseBet: even integer in dollars (validated below + in engine).
  //   carryOverWindow: 1 | 2 | 3 | 4 | 5 | "all". No default — scorekeeper
  //   must explicitly choose before advancing past step 3.
  const [flipBaseBet, setFlipBaseBet] = useState(2);
  const [flipCarryWindow, setFlipCarryWindow] = useState(null);
  const [enabledMechanics, setEnabledMechanics] = useState(new Set());
  const [mechanicSettings, setMechanicSettings] = useState({
    hammer: { initiator: "Losing team only", maxDepth: "∞" },
    crybaby: { holes: 3, hammerRule: "Only crybaby hammers" },
    birdie_bonus: { multiplier: "2x" },
    carry_overs: { cap: "∞" },
    presses: { autoPress: "Optional (must request)" },
    // pops-scoped handicapPercent removed in PR #17 commit 2 — the
    // scaling is now a first-class round-level setting. Retain the
    // `pops` entry as {} so code paths still iterating over mechanic
    // settings (telemetry, legacy test mocks) don't break.
    pops: {},
  });
  // PR #17 commit 2: per-round handicap percentage. Applies to DOC +
  // Flip (team games). 50-100 in 5%% steps. Lives at top level, not
  // nested under mechanicSettings.pops, so the slider is visible
  // regardless of whether the pops mechanic is enabled. Persists to
  // rounds.handicap_percent on round creation.
  const [handicapPercent, setHandicapPercent] = useState(100);
  const [privacy, setPrivacy] = useState("friends");
  const [roundStarted, setRoundStarted] = useState(false);
  const [activeRound, setActiveRound] = useState(null);
  const [checkingActive, setCheckingActive] = useState(true);

  // On mount: check for active round + pre-fill Player 1 + load user courses
  useEffect(() => {
    const init = async () => {
      const [active, profile] = await Promise.all([
        loadActiveRound().catch(() => null),
        loadProfile().catch(() => null),
      ]);
      setActiveRound(active);
      if (profile) {
        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "";
        setPlayers(prev => {
          const next = [...prev];
          next[0] = { ...next[0], name: fullName, handicap: profile.handicap ?? null, userId: user?.id || null };
          return next;
        });
      }
      setCheckingActive(false);

      // Load user-added courses
      supabase.from("user_courses").select("*").order("name").then(({ data }) => {
        if (data) setUserCourses(data);
      });
    };
    init();
  }, []);

  const format = GAME_FORMATS.find(g => g.id === selectedFormat);

  // Resolve course: API/search selection takes priority, then built-in list, then user courses
  const course = selectedCourseData || AUSTIN_COURSES.find(c => c.id === selectedCourse) || (() => {
    const uc = userCourses.find(c => c.id === selectedCourse);
    if (!uc) return undefined;
    const cd = uc.course_data || {};
    return {
      id: uc.id,
      name: uc.name,
      city: uc.city || "",
      state: uc.state || "",
      type: "user",
      holes: cd.holes || 18,
      pars: cd.pars || Array(cd.holes || 18).fill(4),
      handicaps: cd.handicaps || Array.from({ length: cd.holes || 18 }, (_, i) => i + 1),
      tees: cd.tees || [],
    };
  })();

  // Auto-enable default mechanics and set player count when format is selected
  useEffect(() => {
    if (format) {
      setEnabledMechanics(new Set(format.mechanics));
      // For fixed-count games, set exact number of player slots
      if (format.players.min === format.players.max) {
        const slots = Array.from({ length: format.players.min }, (_, i) => 
          players[i] || { name: "", ghin: "", handicap: null, cart: "", position: "" }
        );
        setPlayers(slots);
      } else {
        // For flexible games, ensure at least min players
        if (players.length < format.players.min) {
          const additional = Array.from(
            { length: format.players.min - players.length },
            () => ({ name: "", ghin: "", handicap: null, cart: "", position: "" })
          );
          setPlayers([...players, ...additional]);
        }
      }
    }
  }, [selectedFormat]);


  const addPlayer = () => {
    const maxP = format?.players.max || 6;
    if (players.length < maxP) {
      setPlayers([...players, { name: "", ghin: "", handicap: null, cart: "", position: "" }]);
    }
  };

  const removePlayer = (index) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  const updatePlayer = (index, updated) => {
    setPlayers(prev => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const toggleMechanic = (id) => {
    setEnabledMechanics(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateMechanicSettings = (id, settings) => {
    setMechanicSettings(prev => ({ ...prev, [id]: settings }));
  };

  const filteredCourses = AUSTIN_COURSES.filter(c =>
    c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
    c.city.toLowerCase().includes(courseSearch.toLowerCase())
  );

  // Flip config validation: bet must be even-positive AND window must be chosen.
  const flipBetIsValid = flipBaseBet > 0 && flipBaseBet % 2 === 0;
  const flipWindowIsChosen = flipCarryWindow !== null;
  const flipConfigReady = flipBetIsValid && flipWindowIsChosen;

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedFormat;
      case 1: {
        const named = players.filter(p => p.name.trim());
        if (named.length < (format?.players.min || 2)) return false;
        // PR #23 D2: when the format requires carts (DOC only today), every
        // named player must have BOTH a cart AND a position set. Previously
        // the combined-dropdown picker silently produced null position on
        // every round — caught here so the scorekeeper can't advance.
        if (format?.requiresCarts) {
          const allAssigned = named.every(p =>
            (p.cart === "A" || p.cart === "B")
            && (p.position === "driver" || p.position === "rider"),
          );
          if (!allAssigned) return false;
        }
        return true;
      }
      case 2: return !!course && (!course.tees?.length || !!selectedTee);
      case 3:
        // Flip requires explicit base-bet + window selection before
        // proceeding. Scorecard has no hole value (PR #19) — always OK.
        // Other modes just need a positive hole value.
        if (selectedFormat === "flip") {
          return flipConfigReady;
        }
        if (selectedFormat === "scorecard") {
          return true;
        }
        return holeValue > 0;
      case 4: return true;
      default: return false;
    }
  };

  // COMMENTATOR QUIPS
  const getCommentatorQuip = () => {
    if (roundStarted) return "🏌️ Round is live. Go get 'em.";
    const quips = {
      0: [
        "Pick your poison.",
        "Choose wisely. Or don't. It's your money.",
        "The game chooses you. Just kidding, you choose.",
      ],
      1: [
        `${players.filter(p => p.name).length} players, ${players.filter(p => !p.name).length} TBD. Someone's getting a text.`,
        "Add the pigeons. I mean, players.",
        "Everyone needs a GHIN. No sandbaggers allowed.",
      ],
      2: [
        "Where's the damage happening today?",
        "Pick the course. Blame the course later.",
      ],
      3: [
        `$${holeValue}/hole. ${enabledMechanics.has("hammer") ? "Hammers are live. Somebody's getting hurt." : "No hammers? Playing it safe."}`,
        "Set the rules. Break the rules. Actually, don't break the rules.",
      ],
      4: [
        "Last chance to back out. Nobody would blame you. (They would.)",
        "Everything looks good. Time to find out who's buying drinks.",
      ],
    };
    const options = quips[step] || ["Let's go."];
    return options[Math.floor(Math.random() * options.length)];
  };

  const [quip, setQuip] = useState(getCommentatorQuip());
  useEffect(() => { setQuip(getCommentatorQuip()); }, [step, holeValue, enabledMechanics.size]);

  const [saving, setSaving] = useState(false);

  const handleStartRound = async () => {
    if (activeRound) {
      toast({ title: "Round already in progress", description: "Resume or cancel your active round before starting a new one." });
      return;
    }
    setSaving(true);
    try {
      // Flip mode: pass the scorekeeper's base-bet + carry-over window
      // choice through to createRound so db.ts can seed
      // course_details.game_state.flipConfig on the new round.
      const flipConfig = selectedFormat === "flip"
        ? { baseBet: flipBaseBet, carryOverWindow: flipCarryWindow }
        : null;

      // Per-round handicap % applies only to team games. For individual-
      // scoring formats we pass 100 so the playerConfig.handicap math
      // below is a no-op (floor(raw * 1.0) === raw).
      const roundHandicapPercent =
        (selectedFormat === "drivers_others_carts" || selectedFormat === "flip")
          ? handicapPercent
          : 100;

      // PR #19: Scorecard rounds don't play for money, so holeValue +
      // stakes are stored as 0 / "Scorecard" — avoids polluting audit
      // tooling with a "$5/hole" string on a round that never moved money.
      const persistedHoleValue = selectedFormat === "flip"
        ? flipBaseBet
        : selectedFormat === "scorecard"
          ? 0
          : holeValue;
      const persistedStakes = selectedFormat === "scorecard"
        ? "Scorecard"
        : `$${holeValue}/hole`;

      // PR #30 commit 3 (D4-A): atomic round creation via the
      // `start_round` RPC. Returns PersistResult<string> so failures
      // surface as a typed error instead of throwing — handled below.
      // Round lands at status='setup'; CrybabyActiveRound's mount-
      // success effect flips it to 'active' once the page renders.
      const result = await startRound({
        gameType: selectedFormat,
        course,
        courseDetails: course,
        stakes: persistedStakes,
        holeValue: persistedHoleValue,
        players,
        mechanics: enabledMechanics,
        mechanicSettings,
        privacy,
        scorekeeperMode: true,
        flipConfig,
        handicapPercent: roundHandicapPercent,
      });
      if (!result.ok) {
        console.error("Failed to create round:", result.error);
        toast({
          title: "Failed to start round",
          description: result.error.kind === "auth"
            ? "Please sign in again."
            : result.error.kind === "network"
              ? "Check your connection and try again."
              : "Please try again.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }
      window.location.href = `/round?id=${result.data}`;
    } catch (err) {
      console.error("Failed to create round:", err);
      toast({ title: "Failed to start round", description: "Please try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  useEffect(() => {
    if (roundStarted) {
      handleStartRound();
    }
  }, [roundStarted]);

  return (
    <>
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F5EFE0", fontFamily: font,
      paddingBottom: 140, paddingTop: 16,
    }}>
      {/* Active Round Resume Banner */}
      {activeRound && (
        <div style={{
          margin: "12px 16px 0",
          padding: "14px 16px",
          background: "#FEF9C3",
          border: "1.5px solid #FDE047",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>⛳</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#A16207", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Round In Progress
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeRound.course}
            </div>
          </div>
          <button
            onClick={() => { window.location.href = `/round?id=${activeRound.id}`; }}
            style={{
              padding: "9px 14px", borderRadius: 12, border: "none",
              background: "#2D5016", color: "#fff",
              fontFamily: font, fontSize: 13, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Resume →
          </button>
        </div>
      )}

      {/* Header — sticky below AppLayout top bar */}
      <div style={{
        padding: "16px 20px 14px",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #DDD0BB",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 22, fontWeight: 400, color: "#2D5016" }}>New Round</span>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                fontFamily: font, fontSize: 14, fontWeight: 600, color: "#2D5016",
                background: "none", border: "none", cursor: "pointer",
                padding: "6px 12px", margin: "-6px -12px",
              }}
            >
              ← Back
            </button>
          )}
        </div>
        <StepIndicator steps={steps} currentStep={step} />
        {/* Commentator */}
        <div style={{
          padding: "8px 12px", background: "#F5EFE0", borderRadius: 8,
          fontFamily: font, fontSize: 12, color: "#8B7355", fontStyle: "italic",
          borderLeft: "3px solid #F59E0B",
        }}>
          💬 {quip}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px" }}>
        {/* STEP 0: FORMAT */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              fontFamily: "'Pacifico', cursive",
              fontSize: 22, fontWeight: 400, color: "#2D5016",
              letterSpacing: "0", marginBottom: 2,
            }}>
              Choose Your Game
            </div>
            {/* Filter out games flagged `hidden: true` so they don't show in the
                picker. Hidden entries still live in GAME_FORMATS so legacy-round
                rendering (name/icon/description lookups on load) keeps working. */}
            {GAME_FORMATS.filter(g => !g.hidden).map(g => (
              <GameCard
                key={g.id}
                game={g}
                selected={selectedFormat}
                onSelect={setSelectedFormat}
                playerCount={0}
              />
            ))}
          </div>
        )}

        {/* STEP 1: PLAYERS */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em" }}>
                  Add Players
                </div>
                <div style={{ fontSize: 13, color: "#A8957B", marginTop: 2 }}>
                  {format?.players.min === format?.players.max
                    ? `Exactly ${format.players.min} players required`
                    : `${format?.players.min}-${format?.players.max} players`
                  }
                </div>
              </div>
              {format?.players.min === format?.players.max ? (
                <span style={{
                  fontFamily: mono, fontSize: 13, fontWeight: 700,
                  padding: "4px 10px", borderRadius: 8,
                  background: players.filter(p => p.name.trim()).length === format.players.min ? "#EEF5E5" : "#FEF3C7",
                  color: players.filter(p => p.name.trim()).length === format.players.min ? "#2D5016" : "#92400E",
                }}>
                  {players.filter(p => p.name.trim()).length}/{format.players.min} locked
                </span>
              ) : (
                <span style={{
                  fontFamily: mono, fontSize: 13, fontWeight: 700,
                  color: players.filter(p => p.name.trim()).length >= (format?.players.min || 2) ? "#2D5016" : "#A8957B",
                }}>
                  {players.filter(p => p.name.trim()).length}/{format?.players.max || 6}
                </span>
              )}
            </div>

            {players.map((p, i) => (
              <PlayerRow
                key={i}
                player={p}
                index={i}
                onUpdate={updatePlayer}
                onRemove={removePlayer}
                showCarts={format?.requiresCarts}
                cartOptions={["Cart A — Driver", "Cart A — Rider", "Cart B — Driver", "Cart B — Rider"]}
                canRemove={format?.players.min !== format?.players.max && i >= 2}
                currentUserId={user?.id}
              />
            ))}

            {format?.players.min !== format?.players.max && players.length < (format?.players.max || 6) && (
              <button onClick={addPlayer} style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "2px dashed #D1D5DB",
                background: "transparent", cursor: "pointer",
                fontFamily: font, fontSize: 14, fontWeight: 600, color: "#A8957B",
                transition: "all 0.15s ease",
              }}>
                + Add Player
              </button>
            )}

            <div style={{
              marginTop: 8, padding: "10px 14px", background: "#FEF3C7", borderRadius: 10,
              fontFamily: font, fontSize: 12, color: "#92400E",
            }}>
              💡 Start typing a name to search friends &amp; players. Their handicap auto-fills. Or just type a guest name.
            </div>
          </div>
        )}

        {/* STEP 2: COURSE */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em" }}>
              Select Course
            </div>

            <CourseSearch
              value={course?.name}
              onSelect={c => {
                setSelectedCourseData(c);
                setSelectedCourse(c.id);
                setSelectedTee(null);
              }}
              onAddManually={() => setShowAddClub(true)}
            />

            {/* Selected course info card */}
            {course && (
              <div style={{
                background: "#FAF5EC", borderRadius: 14, padding: "14px 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                border: "1px solid #DDD0BB",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: "#1E130A" }}>
                    {course.name}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: (TYPE_COLORS[course.type] || "#8B7355") + "18",
                    color: TYPE_COLORS[course.type] || "#8B7355",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>{course.type}</span>
                </div>
                <div style={{ fontFamily: font, fontSize: 12, color: "#8B7355", marginBottom: 12 }}>
                  {course.city}{course.holes === 9 ? " · 9 holes" : " · 18 holes"}
                </div>

                {/* Tee selection */}
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 8 }}>
                  Select Tees
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {course.tees.map(tee => (
                    <button key={tee.name} onClick={() => setSelectedTee(tee.name)} style={{
                      flex: 1, padding: "12px 14px", borderRadius: 12, border: "none", cursor: "pointer",
                      background: selectedTee === tee.name ? "#2D5016" : "#FAF5EC",
                      color: selectedTee === tee.name ? "#fff" : "#1E130A",
                      boxShadow: selectedTee === tee.name ? "0 2px 8px rgba(45,80,22,0.2)" : "none",
                      transition: "all 0.2s ease", textAlign: "center",
                    }}>
                      <div style={{ fontFamily: font, fontSize: 14, fontWeight: 700 }}>{tee.name}</div>
                      <div style={{ fontFamily: mono, fontSize: 11, marginTop: 4, opacity: 0.8 }}>{tee.yardage}y</div>
                      <div style={{ fontFamily: mono, fontSize: 10, marginTop: 2, opacity: 0.6 }}>{tee.slope} / {tee.rating}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {course && selectedTee && (
              <div style={{
                marginTop: 4, background: "#FAF5EC", borderRadius: 14, padding: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "auto",
              }}>
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 10 }}>
                  Scorecard Preview
                </div>
                <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
                  {course.pars.map((par, i) => (
                    <div key={i} style={{
                      minWidth: 36, textAlign: "center", padding: "6px 4px",
                      background: i < 9 ? "#FAF5EC" : "#EDE7D9", borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: mono, fontSize: 10, color: "#A8957B", fontWeight: 700 }}>{i + 1}</div>
                      <div style={{ fontFamily: mono, fontSize: 13, color: "#1E130A", fontWeight: 700 }}>{par}</div>
                      <div style={{ fontFamily: mono, fontSize: 9, color: "#8B7355" }}>H{course.handicaps[i]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: RULES */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em" }}>
              Set the Stakes
            </div>

            {/* Flip-specific config: per-player base bet (even) + rolling carry-over window.
                Appears instead of the generic Hole Value picker because Flip's
                bet unit (B) drives different math (3v2 asymmetric payout,
                rolling-window carry with forfeit). */}
            {selectedFormat === "flip" && (
              <div
                data-testid="flip-config-panel"
                style={{
                  background: "#FAF5EC", borderRadius: 16, padding: "20px 20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  display: "flex", flexDirection: "column", gap: 18,
                }}
              >
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016" }}>
                  Flip Settings
                </div>

                {/* Base bet — even dollars only */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Base Bet (per player, per push)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
                    <button
                      type="button"
                      data-testid="flip-bet-decrement"
                      onClick={() => setFlipBaseBet(Math.max(2, flipBaseBet - 2))}
                      style={{
                        width: 48, height: 48, borderRadius: 24, border: "none",
                        background: "#EDE7D9", cursor: flipBaseBet <= 2 ? "not-allowed" : "pointer",
                        fontSize: 22, fontWeight: 700, color: "#8B7355",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: flipBaseBet <= 2 ? 0.5 : 1,
                      }}
                    >−</button>
                    <div
                      data-testid="flip-bet-value"
                      style={{
                        fontFamily: mono, fontSize: 48, fontWeight: 800, color: "#1E130A",
                        letterSpacing: "-0.03em", minWidth: 100, textAlign: "center",
                      }}
                    >
                      ${flipBaseBet}
                    </div>
                    <button
                      type="button"
                      data-testid="flip-bet-increment"
                      onClick={() => setFlipBaseBet(flipBaseBet + 2)}
                      style={{
                        width: 48, height: 48, borderRadius: 24, border: "none",
                        background: "#2D5016", cursor: "pointer", fontSize: 22, fontWeight: 700, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >+</button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                    {[2, 4, 6, 10, 20].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFlipBaseBet(v)}
                        style={{
                          padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                          fontFamily: mono, fontSize: 12, fontWeight: 700,
                          background: flipBaseBet === v ? "#1E130A" : "#EDE7D9",
                          color: flipBaseBet === v ? "#fff" : "#8B7355",
                        }}
                      >${v}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "#A8957B" }}>
                    Even dollars only. On a push, every player antes ${flipBaseBet} into the pot.
                  </div>
                  {!flipBetIsValid && (
                    <div data-testid="flip-bet-error" style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "#DC2626", fontWeight: 600 }}>
                      Bet must be even dollars.
                    </div>
                  )}
                </div>

                {/* Carry-over window size */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Carry-Over Window
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5, "all"].map(v => (
                      <button
                        key={String(v)}
                        type="button"
                        data-testid={`flip-window-${v}`}
                        onClick={() => setFlipCarryWindow(v)}
                        aria-pressed={flipCarryWindow === v}
                        style={{
                          flex: "1 0 auto",
                          padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                          fontFamily: mono, fontSize: 13, fontWeight: 700,
                          background: flipCarryWindow === v ? "#2D5016" : "#EDE7D9",
                          color: flipCarryWindow === v ? "#fff" : "#8B7355",
                        }}
                      >
                        {v === "all" ? "All" : String(v)}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "#A8957B", lineHeight: 1.4 }}>
                    How many pushed holes roll forward before the oldest falls off.<br />
                    &quot;All&quot; = no forfeit; any finite window = oldest evicts on the Nth+1 push.
                  </div>
                  {!flipWindowIsChosen && (
                    <div data-testid="flip-window-error" style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "#DC2626", fontWeight: 600 }}>
                      Pick a window size to continue.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hole Value — hidden in Flip (baseBet replaces it) and in
                Scorecard (no money). PR #19: scorecard has no wager, so
                the dollar-per-hole input is suppressed entirely. */}
            {selectedFormat !== "flip" && selectedFormat !== "scorecard" && (
            <>
            {/* Hole Value */}
            <div style={{
              background: "#FAF5EC", borderRadius: 16, padding: "20px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 12 }}>
                Hole Value
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
                <button onClick={() => setHoleValue(Math.max(1, holeValue - 1))} style={{
                  width: 48, height: 48, borderRadius: 24, border: "none",
                  background: "#EDE7D9", cursor: "pointer", fontSize: 22, fontWeight: 700, color: "#8B7355",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>−</button>
                <div style={{
                  fontFamily: mono, fontSize: 48, fontWeight: 800, color: "#1E130A",
                  letterSpacing: "-0.03em", minWidth: 100, textAlign: "center",
                }}>
                  ${holeValue}
                </div>
                <button onClick={() => setHoleValue(holeValue + 1)} style={{
                  width: 48, height: 48, borderRadius: 24, border: "none",
                  background: "#2D5016", cursor: "pointer", fontSize: 22, fontWeight: 700, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>+</button>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                {[2, 5, 10, 20, 50].map(v => (
                  <button key={v} onClick={() => setHoleValue(v)} style={{
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontFamily: mono, fontSize: 12, fontWeight: 700,
                    background: holeValue === v ? "#1E130A" : "#EDE7D9",
                    color: holeValue === v ? "#fff" : "#8B7355",
                    transition: "all 0.15s ease",
                  }}>${v}</button>
                ))}
              </div>
              <div style={{
                marginTop: 14, textAlign: "center",
                fontFamily: mono, fontSize: 12, color: "#A8957B",
              }}>
                Max exposure: ~${holeValue * (format?.defaultHoles || 18) * 3}
              </div>
            </div>
            </>
            )}

            {/* Handicap % slider — team games only (DOC + Flip). Non-team
                formats (Skins, Nassau, Solo, Custom) play at full handicap;
                we hide the control entirely so the wizard doesn't imply a
                setting that will be ignored. */}
            {(selectedFormat === "drivers_others_carts" || selectedFormat === "flip") && (
              <HandicapPercentSlider
                value={handicapPercent}
                onChange={setHandicapPercent}
                font={font}
              />
            )}

            {/* Mechanics — PR #19: suppressed for Scorecard. Hammer,
                crybaby, birdie-bonus, pops, carry-over, presses all
                assume money is on the table; a scorecard round toggling
                any of them would be UI noise. Scorecard jumps straight
                from Course (step 2) to Privacy + Review. */}
            {selectedFormat !== "scorecard" && (
              <>
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginTop: 4 }}>
                  Game Mechanics
                </div>
                {Object.entries(MECHANICS_CONFIG).map(([id, config]) => (
                  <MechanicToggle
                    key={id}
                    id={id}
                    config={config}
                    enabled={enabledMechanics.has(id)}
                    onToggle={toggleMechanic}
                    settings={mechanicSettings[id]}
                    onSettings={updateMechanicSettings}
                  />
                ))}
              </>
            )}

            {/* Privacy */}
            <div style={{
              marginTop: 4, background: "#FAF5EC", borderRadius: 14, padding: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 10 }}>
                Round Visibility
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { value: "public",  label: "Public",     icon: <Globe size={16} strokeWidth={2} /> },
                  { value: "friends", label: "Friends",    icon: <Users size={16} strokeWidth={2} /> },
                  { value: "group",   label: "Group Only", icon: <Lock size={16} strokeWidth={2} /> },
                  { value: "private", label: "Private",    icon: <EyeOff size={16} strokeWidth={2} /> },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setPrivacy(opt.value)} style={{
                    flex: 1, minWidth: 70, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: privacy === opt.value ? "#1E130A" : "#EDE7D9",
                    color: privacy === opt.value ? "#fff" : "#8B7355",
                    fontFamily: font, fontSize: 12, fontWeight: 600,
                    transition: "all 0.15s ease", textAlign: "center",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em", marginBottom: 4 }}>
              Review & Start
            </div>

            <ReviewSection icon={format ? GAME_ICON[format.id]?.(18) : null} label="Game" value={format?.name} />
            <ReviewSection icon={<Users size={18} strokeWidth={2} />} label="Players" value={players.filter(p => p.name.trim()).map(p => p.name).join(", ")} />
            <ReviewSection icon={<Flag size={18} strokeWidth={2} />} label="Course" value={`${course?.name}${selectedTee ? ` · ${selectedTee} tees` : ""}`} />
            {/* PR #19: Scorecard has no hole value or mechanics; skip
                those review rows rather than rendering "$0 / hole" +
                "Mechanics: None". Keeps the review screen honest. */}
            {selectedFormat !== "scorecard" && (
              <>
                <ReviewSection icon={<MoneyIcon size={18} />} label="Hole Value" value={`$${holeValue} / hole`} />
                <ReviewSection icon={<Sliders size={18} strokeWidth={2} />} label="Mechanics" value={[...enabledMechanics].map(m => MECHANICS_CONFIG[m]?.label).join(", ") || "None"} />
              </>
            )}
            <ReviewSection icon={<Eye size={18} strokeWidth={2} />} label="Visibility" value={privacy.charAt(0).toUpperCase() + privacy.slice(1)} />

            {/* Estimated exposure — hidden for Scorecard (no money). */}
            {selectedFormat !== "scorecard" && (
            <div style={{
              marginTop: 8, background: "#FEF3C7", borderRadius: 14, padding: "16px 18px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Estimated Max Exposure
              </div>
              <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 800, color: "#92400E" }}>
                ${holeValue * (format?.defaultHoles || 18) * (enabledMechanics.has("hammer") ? 4 : 2)}
              </div>
              <div style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>
                {enabledMechanics.has("hammer") ? "With hammers, things can escalate." : "Steady game. No hammers."}
              </div>
            </div>
            )}

            {/* Rules summary */}
            {enabledMechanics.size > 0 && (
              <div style={{
                background: "#FAF5EC", borderRadius: 14, padding: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 10 }}>
                  House Rules
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {enabledMechanics.has("hammer") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🔨 Hammer: {mechanicSettings.hammer.initiator}, max depth {mechanicSettings.hammer.maxDepth}
                    </div>
                  )}
                  {enabledMechanics.has("crybaby") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🍼 Crybaby: {mechanicSettings.crybaby.holes} holes, {mechanicSettings.crybaby.hammerRule.toLowerCase()}
                    </div>
                  )}
                  {enabledMechanics.has("birdie_bonus") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🐦 Birdies: {mechanicSettings.birdie_bonus.multiplier} hole value
                    </div>
                  )}
                  {enabledMechanics.has("presses") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      📈 Presses: {mechanicSettings.presses.autoPress}
                    </div>
                  )}
                  {enabledMechanics.has("pops") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🎯 Handicap strokes at {handicapPercent}%{enabledMechanics.has("no_pops_par3") ? " (no pops on par 3s)" : ""}
                    </div>
                  )}
                  {enabledMechanics.has("carry_overs") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      ➡️ Carry-overs enabled
                    </div>
                  )}
                  {enabledMechanics.has("greenies") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🟢 Greenies enabled
                    </div>
                  )}
                  {enabledMechanics.has("sandies") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      ⛱️ Sandies enabled
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: "fixed", bottom: 64, left: 0, right: 0,
        padding: "16px 20px", paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        background: "rgba(247,247,245,0.95)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid #DDD0BB",
        display: "flex", justifyContent: "center",
      }}>
        <button
          disabled={!canProceed()}
          onClick={() => {
            if (step === 0 && selectedFormat === "solo") { navigate("/solo"); return; }
            if (step < 4) setStep(step + 1);
            else setRoundStarted(true);
          }}
          style={{
            width: "100%", maxWidth: 380,
            padding: "11px 24px",
            borderRadius: 14,
            border: "none", cursor: canProceed() ? "pointer" : "not-allowed",
            fontFamily: "'Pacifico', cursive",
            fontSize: 18,
            fontWeight: 400,
            background: "#2D5016",
            color: "#D4AF37",
            opacity: canProceed() ? 1 : 0.45,
            transition: "all 0.2s ease",
            minHeight: 44,
            boxShadow: "0 2px 12px rgba(45,80,22,0.25)",
            textShadow: "0 1px 6px rgba(212, 175, 55, 0.45)",
          }}
        >
          {step < 4 ? "Continue" : "Start Round 🏌️"}
        </button>
      </div>
    </div>

    {/* Add Club Modal */}
    {showAddClub && (
      <AddClubModal
        onClose={() => setShowAddClub(false)}
        onSaved={(newCourse) => {
          setUserCourses(prev => [...prev, newCourse]);
          setSelectedCourse(newCourse.id);
          setSelectedTee(null);
          setShowAddClub(false);
        }}
      />
    )}
    </>
  );
}
