import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadRoundEvents,
  loadEventReactions,
  toggleEventReaction,
  followRound,
  declineRound,
} from "@/lib/db";
import { formatDistanceToNow, parseISO } from "date-fns";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const REACTION_OPTIONS = ["🔥", "😂", "💀", "🍼", "👏"];

const EVENT_ICONS = {
  eagle: "🦅", birdie: "🐦", par: "⛳", bogey: "😬",
  double_bogey: "😵", triple_plus: "💀", push: "🤝",
  team_win: "🏆", hammer: "🔨", hammer_fold: "🐔", score: "📝",
};

const EVENT_COLORS = {
  eagle: "hsl(var(--primary))", birdie: "hsl(var(--primary))",
  par: "hsl(var(--muted-foreground))", bogey: "hsl(var(--destructive))",
  double_bogey: "hsl(var(--destructive))", triple_plus: "hsl(var(--destructive))",
  push: "hsl(var(--muted-foreground))", team_win: "hsl(var(--primary))",
  hammer: "#F59E0B", hammer_fold: "hsl(var(--muted-foreground))", score: "hsl(var(--foreground))",
};

export default function RoundSpectateView() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roundId = params.get("id");

  const [round, setRound] = useState(null);
  const [players, setPlayers] = useState([]);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [reactions, setReactions] = useState({});
  const [followStatus, setFollowStatus] = useState(null); // null | "following" | "declined"
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeReactionEvent, setActiveReactionEvent] = useState(null);
  const feedRef = useRef(null);

  // useCallback so these are stable references for the subscription effect
  const refreshEvents = useCallback(async () => {
    if (!roundId) return;
    try {
      const evts = await loadRoundEvents(roundId);
      setEvents(evts);
      if (evts.length) {
        const rxns = await loadEventReactions(evts.map(e => e.id));
        const grouped = {};
        rxns.forEach(r => {
          if (!grouped[r.event_id]) grouped[r.event_id] = [];
          grouped[r.event_id].push(r);
        });
        setReactions(grouped);
      }
    } catch (e) {
      console.error("Failed to load events", e);
    }
  }, [roundId]);

  const refreshPlayers = useCallback(async () => {
    if (!roundId) return;
    const { data } = await supabase
      .from("round_players")
      .select("*")
      .eq("round_id", roundId)
      .order("created_at");
    if (data) setPlayers(data);
  }, [roundId]);

  const loadAll = async () => {
    if (!roundId) { setLoading(false); return; }
    try {
      const { data: roundData } = await supabase
        .from("rounds")
        .select("*")
        .eq("id", roundId)
        .maybeSingle();
      if (!roundData) { setLoading(false); return; }
      setRound(roundData);

      await Promise.all([
        refreshPlayers(),
        refreshEvents(),
        supabase.from("profiles")
          .select("user_id, display_name, first_name, last_name, avatar_url")
          .eq("user_id", roundData.created_by)
          .maybeSingle()
          .then(({ data }) => setCreatorProfile(data)),
        user && supabase.from("round_followers")
          .select("status")
          .eq("round_id", roundId)
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data }) => setFollowStatus(data?.status ?? null)),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();

    if (!roundId) return;
    const channel = supabase
      .channel(`spectate-${roundId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_players", filter: `round_id=eq.${roundId}` }, refreshPlayers)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_events", filter: `round_id=eq.${roundId}` }, refreshEvents)
      // round_event_reactions has no round_id — filter is handled in refreshEvents by reloading for current round only
      .on("postgres_changes", { event: "*", schema: "public", table: "round_event_reactions" }, refreshEvents)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roundId, refreshPlayers, refreshEvents]);

  // Auto-scroll feed on new events
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events.length]);

  const handleFollow = async () => {
    if (!user || !roundId) return;
    setFollowLoading(true);
    try {
      await followRound(roundId);
      setFollowStatus("following");
    } catch (e) {
      console.error(e);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user || !roundId) return;
    setFollowLoading(true);
    try {
      await declineRound(roundId);
      setFollowStatus("declined");
    } catch (e) {
      console.error(e);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleReaction = async (eventId, emoji) => {
    try {
      await toggleEventReaction(eventId, emoji);
      setActiveReactionEvent(null);
      await refreshEvents();
    } catch (e) {
      console.error(e);
    }
  };

  // Scoreboard: sort players by total_score ascending (lower is better in golf)
  const scoreboard = [...players].sort((a, b) => (a.total_score ?? 999) - (b.total_score ?? 999));

  const creatorName = creatorProfile
    ? ([creatorProfile.first_name, creatorProfile.last_name].filter(Boolean).join(" ") || creatorProfile.display_name)
    : "Unknown";

  const isActive = round?.status === "active";

  if (loading) {
    return (
      <div style={{ fontFamily: FONT, maxWidth: 480, margin: "0 auto", padding: "40px 20px", textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
        Loading round...
      </div>
    );
  }

  if (!round) {
    return (
      <div style={{ fontFamily: FONT, maxWidth: 480, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Round not found</div>
        <button onClick={() => navigate("/feed")} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 12, border: "none", background: "#16A34A", color: "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Back to Feed
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "hsl(var(--background))", paddingBottom: 100 }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid hsl(var(--border))",
        background: "hsl(var(--background))", position: "sticky", top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ fontSize: 14, fontWeight: 600, color: "#16A34A", background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}
        >
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isActive && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "hsl(var(--destructive) / 0.1)" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "hsl(var(--destructive))", animation: "pulse 1.5s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: "hsl(var(--destructive))", letterSpacing: "0.06em" }}>LIVE</span>
            </div>
          )}
        </div>
        {/* Follow button in header (compact) */}
        {user && followStatus === null && (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#16A34A", border: "none", borderRadius: 10, padding: "7px 12px", cursor: "pointer" }}
          >
            📡 Follow
          </button>
        )}
        {followStatus === "following" && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>Following ✓</span>
        )}
        {followStatus === "declined" && (
          <button onClick={handleFollow} style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--muted-foreground))", background: "none", border: "none", cursor: "pointer" }}>
            Follow
          </button>
        )}
      </div>

      {/* Round header */}
      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {creatorProfile?.avatar_url ? (
            <img src={creatorProfile.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "hsl(var(--accent))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
              {creatorName[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))" }}>{creatorName}</div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>started a round</div>
          </div>
        </div>

        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "hsl(var(--foreground))", marginBottom: 4 }}>⛳ {round.course}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>{round.game_type}</span>
            {round.stakes && <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>💰 {round.stakes}</span>}
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>🏌️ {players.length} players</span>
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      {scoreboard.length > 0 && (
        <div style={{ margin: "0 16px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Scoreboard</div>
          <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 14, overflow: "hidden" }}>
            {scoreboard.map((p, i) => {
              const name = p.guest_name || "Player";
              const holesPlayed = Array.isArray(p.hole_scores) ? p.hole_scores.filter(s => s != null && s !== "").length : 0;
              const total = p.total_score ?? 0;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    borderBottom: i < scoreboard.length - 1 ? "1px solid hsl(var(--border))" : "none",
                  }}
                >
                  <div style={{ width: 20, fontSize: 12, fontWeight: 700, color: i === 0 ? "#16A34A" : "hsl(var(--muted-foreground))", textAlign: "center" }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))" }}>{name}</div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginRight: 8 }}>
                    {holesPlayed > 0 ? `Hole ${holesPlayed}` : "—"}
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 800, minWidth: 32, textAlign: "right",
                    color: total === 0 ? "hsl(var(--muted-foreground))" : total < 0 ? "#16A34A" : "hsl(var(--destructive))",
                  }}>
                    {total > 0 ? `+${total}` : total === 0 ? "E" : total}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live event feed */}
      <div style={{ margin: "0 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Live Feed
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "hsl(var(--muted-foreground))" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{isActive ? "📡" : "🏁"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {isActive ? "Waiting for action…" : "Round complete"}
            </div>
            <div style={{ fontSize: 12 }}>
              {isActive ? "Events appear as holes are scored" : "No events were recorded for this round"}
            </div>
          </div>
        ) : (
          <div ref={feedRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map(evt => {
              const icon = EVENT_ICONS[evt.event_type] || "📝";
              const color = EVENT_COLORS[evt.event_type] || "hsl(var(--foreground))";
              const eventReactions = reactions[evt.id] || [];
              const data = evt.event_data || {};
              const myReaction = eventReactions.find(r => r.user_id === user?.id);
              const reactionCounts = {};
              eventReactions.forEach(r => {
                reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
              });

              return (
                <div key={evt.id} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, background: `${color}14` }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 5, background: `${color}14`, color }}>
                          Hole {evt.hole_number}
                        </span>
                        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                          {formatDistanceToNow(parseISO(evt.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))", lineHeight: 1.4 }}>
                        {data.playerName && <span style={{ color }}>{data.playerName} </span>}
                        {data.message || evt.event_type}
                      </p>
                      {data.quip && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>
                          💬 "{data.quip}"
                        </p>
                      )}
                      {data.amount != null && data.amount !== 0 && (
                        <span style={{
                          display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 700,
                          padding: "2px 8px", borderRadius: 6,
                          background: data.amount > 0 ? "hsl(var(--primary) / 0.1)" : "hsl(var(--destructive) / 0.1)",
                          color: data.amount > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))",
                        }}>
                          {data.amount > 0 ? "+" : ""}${data.amount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reactions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, marginLeft: 46 }}>
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(evt.id, emoji)}
                        style={{
                          display: "flex", alignItems: "center", gap: 3,
                          padding: "2px 8px", borderRadius: 20,
                          border: `1px solid ${myReaction?.reaction_type === emoji ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                          background: myReaction?.reaction_type === emoji ? "hsl(var(--primary) / 0.1)" : "hsl(var(--secondary))",
                          cursor: "pointer", fontFamily: FONT,
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{emoji}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>{count}</span>
                      </button>
                    ))}
                    {activeReactionEvent === evt.id ? (
                      <div style={{ display: "flex", gap: 4, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 20, padding: "2px 8px" }}>
                        {REACTION_OPTIONS.map(emoji => (
                          <button key={emoji} onClick={() => handleReaction(evt.id, emoji)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", padding: "0 2px" }}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveReactionEvent(evt.id)}
                        style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
