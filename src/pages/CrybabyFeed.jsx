import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { loadFeed, createPost, addComment, toggleReaction, loadGroups, createGroup, loadProfile, loadMyRounds } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";

// ============================================================
// CRYBABY — Social Feed & Round Summary
// Home feed, trash talk, live rounds, profiles
// ============================================================

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

// --- MOCK DATA ---
const CURRENT_USER = { id: "u1", name: "Jonathan", avatar: "J", color: "#16A34A" };

const MOCK_USERS = {
  u1: { id: "u1", name: "Jonathan", avatar: "J", color: "#16A34A", handicap: 12, following: true },
  u2: { id: "u2", name: "Mike", avatar: "M", color: "#3B82F6", handicap: 18, following: true },
  u3: { id: "u3", name: "Dave", avatar: "D", color: "#F59E0B", handicap: 8, following: true },
  u4: { id: "u4", name: "Chris", avatar: "C", color: "#DC2626", handicap: 22, following: true },
  u5: { id: "u5", name: "Tyler", avatar: "T", color: "#8B5CF6", handicap: 15, following: true },
  u6: { id: "u6", name: "Matt", avatar: "M", color: "#EC4899", handicap: 20, following: false },
  u7: { id: "u7", name: "Brian", avatar: "B", color: "#14B8A6", handicap: 10, following: false },
};

const MOCK_FEED = [
  {
    id: "live1",
    type: "live_round",
    timestamp: new Date(Date.now() - 1000 * 60 * 25),
    round: {
      gameMode: "Drivers / Others / Carts",
      course: "Barton Creek — Fazio Foothills",
      holeValue: 10,
      currentHole: 8,
      players: [
        { id: "u5", name: "Tyler", amount: 35, color: "#8B5CF6" },
        { id: "u6", name: "Matt", amount: 10, color: "#EC4899" },
        { id: "u7", name: "Brian", amount: -15, color: "#14B8A6" },
        { id: "u2", name: "Mike", amount: -30, color: "#3B82F6" },
      ],
      lastEvent: "🔨 Tyler hammered on Hole 8. Matt accepted.",
      spectators: 4,
      shareCode: "FAZIO8",
    },
  },
  {
    id: "post1",
    type: "round_result",
    userId: "u1",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
    round: {
      gameMode: "Drivers / Others / Carts",
      course: "Westlake Country Club",
      holeValue: 5,
      results: [
        { id: "u1", name: "Jonathan", amount: 45, isCrybaby: false },
        { id: "u2", name: "Mike", amount: 12, isCrybaby: false },
        { id: "u3", name: "Dave", amount: -22, isCrybaby: false },
        { id: "u4", name: "Chris", amount: -35, isCrybaby: true },
      ],
      stats: { hammers: 3, carryOvers: 2, photos: 4 },
      commentatorSummary: "Jonathan rode the birdie train home with +$45. Chris got hammered on 14 and folded like a lawn chair — crybaby at -$35. Three hammers thrown, two accepted, one chicken dinner. Another day in paradise.",
    },
    reactions: { hammer: 2, fire: 5, crybaby: 3, dead: 1, chicken: 0 },
    comments: [
      { id: "c1", userId: "u4", text: "I'll get you back Wednesday. Mark it.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
      { id: "c2", userId: "u3", text: "Chris folding on 14 was the highlight of my year", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 1.5) },
      { id: "c3", userId: "u1", text: "🐔🐔🐔", timestamp: new Date(Date.now() - 1000 * 60 * 45) },
    ],
    privacy: "friends",
  },
  {
    id: "post2",
    type: "trash_talk",
    userId: "u4",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
    text: "Wednesday. Westlake. $10 holes. Hammers on. Who's in? I need to get my money back from Jonathan before he buys another putter he doesn't need.",
    reactions: { hammer: 1, fire: 3, crybaby: 0, dead: 0, chicken: 0 },
    comments: [
      { id: "c4", userId: "u1", text: "I'm in. Bring your wallet and a tissue.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 7) },
      { id: "c5", userId: "u2", text: "In. Someone's gotta keep these two from killing each other.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6.5) },
    ],
    privacy: "friends",
  },
  {
    id: "post3",
    type: "round_result",
    userId: "u5",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26),
    round: {
      gameMode: "Nassau",
      course: "Lions Municipal Golf Course",
      holeValue: 5,
      results: [
        { id: "u5", name: "Tyler", amount: 15, isCrybaby: false },
        { id: "u6", name: "Matt", amount: -15, isCrybaby: false },
      ],
      stats: { hammers: 0, carryOvers: 0, photos: 1 },
      commentatorSummary: "Tyler swept all three legs of the Nassau. Matt's wallet took a clean $15 hit. No hammers, no drama — just business.",
    },
    reactions: { hammer: 0, fire: 2, crybaby: 0, dead: 1, chicken: 0 },
    comments: [],
    privacy: "public",
  },
  {
    id: "post4",
    type: "round_result",
    userId: "u3",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50),
    round: {
      gameMode: "Skins",
      course: "Grey Rock Golf Club",
      holeValue: 5,
      results: [
        { id: "u3", name: "Dave", amount: 40, isCrybaby: false },
        { id: "u1", name: "Jonathan", amount: 10, isCrybaby: false },
        { id: "u5", name: "Tyler", amount: -20, isCrybaby: false },
        { id: "u4", name: "Chris", amount: -30, isCrybaby: true },
      ],
      stats: { hammers: 0, carryOvers: 5, photos: 2 },
      commentatorSummary: "Dave cleaned up in skins with 8 of 18. Five carry-overs meant some holes got juicy. Chris is the crybaby again — someone get this man a loyalty card.",
    },
    reactions: { hammer: 0, fire: 4, crybaby: 6, dead: 0, chicken: 0 },
    comments: [
      { id: "c6", userId: "u4", text: "I'm starting to think this app is rigged against me", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48) },
    ],
    privacy: "friends",
  },
];

const REACTION_TYPES = [
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "hammer", emoji: "🔨", label: "Hammer" },
  { key: "crybaby", emoji: "🍼", label: "Crybaby" },
  { key: "dead", emoji: "💀", label: "Dead" },
  { key: "chicken", emoji: "🐔", label: "Chicken" },
];

// --- HELPERS ---
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// --- COMPONENTS ---

function Avatar({ user, size = 36 }) {
  const u = typeof user === "string" ? MOCK_USERS[user] : user;
  if (!u) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, background: u.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: size * 0.4, fontWeight: 700, fontFamily: FONT,
      flexShrink: 0,
    }}>
      {u.avatar || u.name?.[0] || "?"}
    </div>
  );
}

function NavBar({ activeTab, onTabChange }) {
  const tabs = [
    { key: "feed", label: "Feed", icon: "🏠" },
    { key: "live", label: "Live", icon: "📡" },
    { key: "groups", label: "Groups", icon: "👥" },
    { key: "profile", label: "Profile", icon: "👤" },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
      borderTop: "1px solid #E5E7EB",
      display: "flex", justifyContent: "center",
      paddingBottom: "max(8px, env(safe-area-inset-bottom))",
    }}>
      <div style={{ display: "flex", maxWidth: 420, width: "100%", justifyContent: "space-around" }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            padding: "8px 4px", background: "none", border: "none", cursor: "pointer",
            gap: 2,
          }}>
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span style={{
              fontFamily: FONT, fontSize: 10, fontWeight: 600,
              color: activeTab === tab.key ? "#16A34A" : "#9CA3AF",
              transition: "color 0.2s ease",
            }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LiveRoundCard({ data }) {
  const round = data.round;
  const sorted = [...round.players].sort((a, b) => b.amount - a.amount);
  return (
    <div style={{
      background: "#fff", borderRadius: 20, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      border: "1px solid #E5E7EB",
    }}>
      {/* Live badge header */}
      <div style={{
        padding: "14px 18px", background: "linear-gradient(135deg, #1A1A1A 0%, #374151 100%)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: 4, background: "#EF4444",
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Live · Hole {round.currentHole}/18
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>👁️</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            {round.spectators}
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
              {round.course}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF" }}>
              {round.gameMode} · ${round.holeValue}/hole
            </div>
          </div>
        </div>

        {/* Standings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {sorted.map((p, i) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Avatar user={p.id} size={28} />
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1A1A1A", flex: 1 }}>{p.name}</span>
              <span style={{
                fontFamily: MONO, fontSize: 14, fontWeight: 800,
                color: p.amount > 0 ? "#16A34A" : p.amount < 0 ? "#DC2626" : "#9CA3AF",
              }}>
                {p.amount >= 0 ? "+" : ""}${p.amount}
              </span>
            </div>
          ))}
        </div>

        {/* Last event */}
        <div style={{
          padding: "10px 12px", background: "#FEF3C7", borderRadius: 10,
          fontFamily: FONT, fontSize: 12, color: "#92400E", fontStyle: "italic",
          borderLeft: "3px solid #F59E0B",
          marginBottom: 12,
        }}>
          💬 {round.lastEvent}
        </div>

        <button style={{
          width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 13, fontWeight: 700,
          background: "#1A1A1A", color: "#fff",
        }}>
          Watch Live 📡
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function RoundResultCard({ data, onReact, onToggleComments }) {
  const round = data.round;
  const user = MOCK_USERS[data.userId];
  const sorted = [...round.results].sort((a, b) => b.amount - a.amount);
  const winner = sorted[0];
  const crybaby = sorted.find(r => r.isCrybaby);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");

  const totalReactions = Object.values(data.reactions).reduce((a, b) => a + b, 0);

  return (
    <div style={{
      background: "#fff", borderRadius: 20, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      border: "1px solid #E5E7EB",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", display: "flex", gap: 12 }}>
        <Avatar user={data.userId} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
            {user?.name}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF" }}>
            {timeAgo(data.timestamp)} · {data.privacy === "public" ? "🌐" : "👥"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {round.gameMode}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#6B7280" }}>
            {round.course}
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ padding: "0 18px 12px" }}>
        <div style={{
          background: "#F9FAFB", borderRadius: 14, padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {sorted.map((p, i) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: p.isCrybaby ? "6px 8px" : "0",
              background: p.isCrybaby ? "#FEF2F2" : "transparent",
              borderRadius: 8,
            }}>
              <span style={{
                fontSize: 14, width: 22, textAlign: "center",
              }}>{i === 0 ? "🏆" : p.isCrybaby ? "🍼" : ""}</span>
              <Avatar user={p.id} size={28} />
              <span style={{
                fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1A1A1A", flex: 1,
              }}>{p.name}</span>
              {p.isCrybaby && (
                <span style={{
                  fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: "2px 6px",
                  borderRadius: 4, background: "#DC2626", color: "#fff",
                }}>CRYBABY</span>
              )}
              <span style={{
                fontFamily: MONO, fontSize: 15, fontWeight: 800,
                color: p.amount > 0 ? "#16A34A" : p.amount < 0 ? "#DC2626" : "#9CA3AF",
              }}>
                {p.amount >= 0 ? "+" : ""}${p.amount}
              </span>
            </div>
          ))}
        </div>

        {/* Stats pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {round.stats.hammers > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E" }}>
              🔨 {round.stats.hammers} hammer{round.stats.hammers !== 1 ? "s" : ""}
            </span>
          )}
          {round.stats.carryOvers > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#EEF2FF", color: "#4338CA" }}>
              ➡️ {round.stats.carryOvers} carry-over{round.stats.carryOvers !== 1 ? "s" : ""}
            </span>
          )}
          {round.stats.photos > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#F0FDF4", color: "#166534" }}>
              📸 {round.stats.photos} photo{round.stats.photos !== 1 ? "s" : ""}
            </span>
          )}
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280" }}>
            ${round.holeValue}/hole
          </span>
        </div>
      </div>

      {/* Commentator Summary */}
      <div style={{
        margin: "0 18px 12px", padding: "12px 14px",
        background: "#F0FDF4", borderRadius: 12,
        borderLeft: "3px solid #16A34A",
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 13, color: "#166534", fontStyle: "italic", lineHeight: 1.5,
          display: "-webkit-box", WebkitLineClamp: showFullSummary ? 999 : 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          💬 "{round.commentatorSummary}"
        </div>
        {round.commentatorSummary.length > 100 && (
          <button onClick={() => setShowFullSummary(!showFullSummary)} style={{
            fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#16A34A",
            background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0,
          }}>
            {showFullSummary ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {/* Reactions bar */}
      <div style={{
        padding: "0 18px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 2 }}>
          {REACTION_TYPES.filter(r => data.reactions[r.key] > 0).map(r => (
            <span key={r.key} style={{ fontSize: 14 }}>{r.emoji}</span>
          ))}
          {totalReactions > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>
              {totalReactions}
            </span>
          )}
        </div>
        <span style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", cursor: "pointer" }}
          onClick={() => setShowComments(!showComments)}>
          {data.comments.length} comment{data.comments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{
        padding: "8px 18px 12px", borderTop: "1px solid #F3F4F6",
        display: "flex", gap: 4,
      }}>
        {REACTION_TYPES.map(r => (
          <button key={r.key} onClick={() => onReact?.(data.id, r.key)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 18, background: "#F9FAFB",
            transition: "all 0.15s ease",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {r.emoji}
          </button>
        ))}
        <button onClick={() => setShowComments(!showComments)} style={{
          flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 18, background: "#F9FAFB",
        }}>
          💬
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ padding: "0 18px 14px", borderTop: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
            {data.comments.map(comment => {
              const commenter = MOCK_USERS[comment.userId];
              return (
                <div key={comment.id} style={{ display: "flex", gap: 10 }}>
                  <Avatar user={comment.userId} size={28} />
                  <div style={{
                    flex: 1, background: "#F9FAFB", borderRadius: 12, padding: "8px 12px",
                  }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>
                        {commenter?.name}
                      </span>
                      <span style={{ fontFamily: FONT, fontSize: 10, color: "#9CA3AF" }}>
                        {timeAgo(comment.timestamp)}
                      </span>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: "#374151", marginTop: 2 }}>
                      {comment.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment input */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <Avatar user={CURRENT_USER} size={28} />
            <div style={{
              flex: 1, display: "flex", background: "#F3F4F6", borderRadius: 20,
              padding: "4px 4px 4px 14px", alignItems: "center",
            }}>
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Talk your trash..."
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontFamily: FONT, fontSize: 13, color: "#1A1A1A",
                }}
              />
              <button
                disabled={!newComment.trim()}
                style={{
                  width: 32, height: 32, borderRadius: 16, border: "none", cursor: "pointer",
                  background: newComment.trim() ? "#16A34A" : "transparent",
                  color: newComment.trim() ? "#fff" : "#D1D5DB",
                  fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrashTalkCard({ data, onReact }) {
  const user = MOCK_USERS[data.userId];
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const totalReactions = Object.values(data.reactions).reduce((a, b) => a + b, 0);

  return (
    <div style={{
      background: "#fff", borderRadius: 20, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      border: "1px solid #E5E7EB",
    }}>
      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <Avatar user={data.userId} size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
              {user?.name}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF" }}>
              {timeAgo(data.timestamp)}
            </div>
          </div>
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 15, color: "#1A1A1A", lineHeight: 1.5,
        }}>
          {data.text}
        </div>
      </div>

      {/* Reactions */}
      <div style={{
        padding: "0 18px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 2 }}>
          {REACTION_TYPES.filter(r => data.reactions[r.key] > 0).map(r => (
            <span key={r.key} style={{ fontSize: 14 }}>{r.emoji}</span>
          ))}
          {totalReactions > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>{totalReactions}</span>
          )}
        </div>
        <span style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", cursor: "pointer" }}
          onClick={() => setShowComments(!showComments)}>
          {data.comments.length} comment{data.comments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Actions */}
      <div style={{
        padding: "8px 18px 12px", borderTop: "1px solid #F3F4F6",
        display: "flex", gap: 4,
      }}>
        {REACTION_TYPES.map(r => (
          <button key={r.key} onClick={() => onReact?.(data.id, r.key)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
            fontSize: 18, background: "#F9FAFB",
          }}>
            {r.emoji}
          </button>
        ))}
        <button onClick={() => setShowComments(!showComments)} style={{
          flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
          fontSize: 18, background: "#F9FAFB",
        }}>
          💬
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ padding: "0 18px 14px", borderTop: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
            {data.comments.map(comment => {
              const commenter = MOCK_USERS[comment.userId];
              return (
                <div key={comment.id} style={{ display: "flex", gap: 10 }}>
                  <Avatar user={comment.userId} size={28} />
                  <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 12, padding: "8px 12px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>{commenter?.name}</span>
                      <span style={{ fontFamily: FONT, fontSize: 10, color: "#9CA3AF" }}>{timeAgo(comment.timestamp)}</span>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: "#374151", marginTop: 2 }}>{comment.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <Avatar user={CURRENT_USER} size={28} />
            <div style={{
              flex: 1, display: "flex", background: "#F3F4F6", borderRadius: 20,
              padding: "4px 4px 4px 14px", alignItems: "center",
            }}>
              <input value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder="Talk your trash..."
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontFamily: FONT, fontSize: 13, color: "#1A1A1A",
                }} />
              <button disabled={!newComment.trim()} style={{
                width: 32, height: 32, borderRadius: 16, border: "none", cursor: "pointer",
                background: newComment.trim() ? "#16A34A" : "transparent",
                color: newComment.trim() ? "#fff" : "#D1D5DB",
                fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>↑</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPostComposer({ onPost }) {
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "14px 18px", background: "#fff", borderRadius: 16,
        border: "1px solid #E5E7EB", cursor: "pointer", textAlign: "left",
      }}>
        <Avatar user={CURRENT_USER} size={36} />
        <span style={{ fontFamily: FONT, fontSize: 14, color: "#9CA3AF" }}>
          Challenge someone, talk trash, share a story...
        </span>
      </button>
    );
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "16px 18px",
      border: "1px solid #E5E7EB",
    }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <Avatar user={CURRENT_USER} size={36} />
        <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
          {CURRENT_USER.name}
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What's on your mind? Challenge someone. Roast the crybaby. Call your shot."
        autoFocus
        rows={3}
        style={{
          width: "100%", border: "none", outline: "none", resize: "none",
          fontFamily: FONT, fontSize: 15, color: "#1A1A1A", lineHeight: 1.5,
          background: "transparent", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{
            padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 12, fontWeight: 600,
            background: "#F3F4F6", color: "#6B7280",
          }}>📸 Photo</button>
          <button style={{
            padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 12, fontWeight: 600,
            background: "#F3F4F6", color: "#6B7280",
          }}>👥 Tag</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setIsOpen(false); setText(""); }} style={{
            padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 13, fontWeight: 600,
            background: "#F3F4F6", color: "#6B7280",
          }}>Cancel</button>
          <button disabled={!text.trim()} onClick={() => { onPost?.(text); setText(""); setIsOpen(false); }} style={{
            padding: "8px 20px", borderRadius: 10, border: "none",
            cursor: text.trim() ? "pointer" : "not-allowed",
            fontFamily: FONT, fontSize: 13, fontWeight: 700,
            background: text.trim() ? "#1A1A1A" : "#D1D5DB",
            color: text.trim() ? "#fff" : "#9CA3AF",
          }}>Post</button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const user = MOCK_USERS["u1"];
  const stats = [
    { label: "Rounds", value: "47" },
    { label: "Winnings", value: "+$385" },
    { label: "Crybabies", value: "4" },
    { label: "Hammer %", value: "68%" },
  ];
  const badges = [
    { emoji: "💰", label: "Shark", desc: "Positive P&L 20+ rounds" },
    { emoji: "🔨", label: "Hammer Time", desc: "10+ successful hammers" },
    { emoji: "🔥", label: "On Fire", desc: "Won 5 consecutive holes" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Profile header */}
      <div style={{
        background: "#fff", borderRadius: 20, padding: "24px 20px", textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <Avatar user={CURRENT_USER} size={72} />
        <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginTop: 12 }}>
          {user.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
          <span style={{
            fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#16A34A",
            background: "#F0FDF4", padding: "3px 10px", borderRadius: 6,
          }}>HCP {user.handicap}</span>
          <span style={{
            fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#16A34A",
            background: "#F0FDF4", padding: "3px 8px", borderRadius: 6,
          }}>✅ GHIN Verified</span>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>
          Westlake CC · Austin, TX
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>128</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9CA3AF" }}>Following</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>94</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9CA3AF" }}>Followers</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        background: "#fff", borderRadius: 20, padding: "18px 20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
          Season Stats
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {stats.map(s => (
            <div key={s.label} style={{
              padding: "12px 14px", background: "#F9FAFB", borderRadius: 12, textAlign: "center",
            }}>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: "#1A1A1A" }}>{s.value}</div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Badges */}
      <div style={{
        background: "#fff", borderRadius: 20, padding: "18px 20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
          Badges
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {badges.map(b => (
            <div key={b.label} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", background: "#F9FAFB", borderRadius: 12,
            }}>
              <span style={{ fontSize: 24 }}>{b.emoji}</span>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{b.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "#9CA3AF" }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupsTab() {
  const groups = [
    { id: "g1", name: "Wednesday Crew", members: 6, avatar: "🏌️", lastActive: "Today", leader: "Jonathan", leaderAmount: "+$385" },
    { id: "g2", name: "Westlake Degenerates", members: 12, avatar: "🎰", lastActive: "2d ago", leader: "Tyler", leaderAmount: "+$220" },
    { id: "g3", name: "Bachelor Party '26", members: 8, avatar: "🍺", lastActive: "5d ago", leader: "Dave", leaderAmount: "+$150" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>Your Groups</div>
        <button style={{
          padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 12, fontWeight: 700,
          background: "#1A1A1A", color: "#fff",
        }}>+ New Group</button>
      </div>

      {groups.map(g => (
        <div key={g.id} style={{
          background: "#fff", borderRadius: 16, padding: "16px 18px", cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #E5E7EB",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, background: "#F3F4F6",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}>{g.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{g.name}</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9CA3AF" }}>
                {g.members} members · Active {g.lastActive}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" }}>Leader</div>
              <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>{g.leader}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#16A34A" }}>{g.leaderAmount}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveTab() {
  const liveRounds = MOCK_FEED.filter(p => p.type === "live_round");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>Live Rounds</div>
      {liveRounds.length > 0 ? (
        liveRounds.map(lr => <LiveRoundCard key={lr.id} data={lr} />)
      ) : (
        <div style={{
          background: "#fff", borderRadius: 20, padding: "40px 20px", textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
          <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#6B7280" }}>
            No live rounds right now
          </div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#9CA3AF", marginTop: 4, fontStyle: "italic" }}>
            Your friends are probably at work. For now.
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CrybabyFeed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "feed";
  const { user, signOut } = useAuth();
  const setActiveTab = (tab) => {
    if (tab === "feed") {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };
  const navigate = useNavigate();
  const [feed, setFeed] = useState(MOCK_FEED);
  const [dbPosts, setDbPosts] = useState([]);
  const [dbProfiles, setDbProfiles] = useState({});
  const [dbComments, setDbComments] = useState([]);
  const [dbReactions, setDbReactions] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [dbGroups, setDbGroups] = useState([]);

  // Load real data from DB
  useEffect(() => {
    loadFeed().then(data => {
      if (data.posts.length > 0) {
        setDbPosts(data.posts);
        const profileMap = {};
        data.profiles.forEach(p => { profileMap[p.user_id] = p; });
        setDbProfiles(profileMap);
        setDbComments(data.comments);
        setDbReactions(data.reactions);
      }
    }).catch(console.error);

    loadProfile().then(p => { if (p) setMyProfile(p); }).catch(console.error);
    loadGroups().then(g => { if (g) setDbGroups(g); }).catch(console.error);

    // Subscribe to new posts in realtime
    const channel = supabase
      .channel("feed-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        setDbPosts(prev => [payload.new, ...prev]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => {
        setDbComments(prev => [...prev, payload.new]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
        // Reload reactions on any change
        loadFeed().then(data => setDbReactions(data.reactions)).catch(console.error);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleReact = async (postId, reactionKey) => {
    // Optimistic update for mock data
    setFeed(prev => prev.map(post => {
      if (post.id === postId && post.reactions) {
        return {
          ...post,
          reactions: { ...post.reactions, [reactionKey]: (post.reactions[reactionKey] || 0) + 1 },
        };
      }
      return post;
    }));
    // DB reaction
    try {
      await toggleReaction(postId, reactionKey);
    } catch (e) { console.error(e); }
  };

  const feedPosts = feed.filter(p => p.type !== "live_round");
  const livePosts = feed.filter(p => p.type === "live_round");

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F7F7F5", fontFamily: FONT,
      paddingBottom: 160,
    }}>
      {/* Header */}
      <div style={{
        padding: "52px 20px 16px", background: "#fff",
        borderBottom: "1px solid #E5E7EB",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img src={crybabyLogo} alt="Crybaby Golf" style={{ height: 40 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              width: 36, height: 36, borderRadius: 18, border: "none", cursor: "pointer",
              background: "#F3F4F6", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>🔔</button>
            <button onClick={() => navigate("/setup")} style={{
              padding: "8px 14px", borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 13, fontWeight: 700,
              background: "#16A34A", color: "#fff",
            }}>+ New Round</button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px" }}>
        {activeTab === "feed" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Composer */}
            <NewPostComposer onPost={async (text) => {
              try {
                await createPost({ content: text, postType: "trash_talk" });
              } catch (e) { console.error(e); }
            }} />

            {/* Live rounds at top */}
            {livePosts.map(lr => <LiveRoundCard key={lr.id} data={lr} />)}

            {/* Feed posts */}
            {feedPosts.map(post => {
              if (post.type === "round_result") {
                return <RoundResultCard key={post.id} data={post} onReact={handleReact} />;
              }
              if (post.type === "trash_talk") {
                return <TrashTalkCard key={post.id} data={post} onReact={handleReact} />;
              }
              return null;
            })}

            {/* End of feed */}
            <div style={{
              textAlign: "center", padding: "20px 0",
              fontFamily: FONT, fontSize: 13, color: "#9CA3AF", fontStyle: "italic",
            }}>
              💬 "That's all for now. Go play a round and give the people something to talk about."
            </div>
          </div>
        )}

        {activeTab === "live" && <LiveTab />}
        {activeTab === "groups" && <GroupsTab />}
        {activeTab === "profile" && <ProfileTab />}
      </div>

    </div>
  );
}
