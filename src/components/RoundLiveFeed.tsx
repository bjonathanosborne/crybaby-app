import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { loadRoundEvents, loadEventReactions, toggleEventReaction } from "@/lib/db";
import { formatDistanceToNow, parseISO } from "date-fns";

const REACTION_OPTIONS = ["🔥", "😂", "💀", "🍼", "👏"];

const EVENT_ICONS: Record<string, string> = {
  eagle: "🦅",
  birdie: "🐦",
  par: "⛳",
  bogey: "😬",
  double_bogey: "😵",
  triple_plus: "💀",
  push: "🤝",
  team_win: "🏆",
  hammer: "🔨",
  hammer_fold: "🐔",
  score: "📝",
};

const EVENT_COLORS: Record<string, string> = {
  eagle: "hsl(var(--primary))",
  birdie: "hsl(var(--primary))",
  par: "hsl(var(--muted-foreground))",
  bogey: "hsl(var(--destructive))",
  double_bogey: "hsl(var(--destructive))",
  triple_plus: "hsl(var(--destructive))",
  push: "hsl(var(--muted-foreground))",
  team_win: "hsl(var(--primary))",
  hammer: "#F59E0B",
  hammer_fold: "hsl(var(--muted-foreground))",
  score: "hsl(var(--foreground))",
};

interface RoundLiveFeedProps {
  roundId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function RoundLiveFeed({ roundId, isOpen, onClose }: RoundLiveFeedProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [reactions, setReactions] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const [activeReactionEvent, setActiveReactionEvent] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const evts = await loadRoundEvents(roundId);
      setEvents(evts);
      if (evts.length) {
        const rxns = await loadEventReactions(evts.map((e: any) => e.id));
        const grouped: Record<string, any[]> = {};
        rxns.forEach((r: any) => {
          if (!grouped[r.event_id]) grouped[r.event_id] = [];
          grouped[r.event_id].push(r);
        });
        setReactions(grouped);
      }
    } catch (e) {
      console.error("Failed to load round events", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !roundId) return;
    refresh();

    // Subscribe to realtime events
    const channel = supabase
      .channel(`round-feed-${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "round_events", filter: `round_id=eq.${roundId}` },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_event_reactions" },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, roundId]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleReaction = async (eventId: string, emoji: string) => {
    try {
      await toggleEventReaction(eventId, emoji);
      setActiveReactionEvent(null);
      await refresh();
    } catch (e) {
      console.error("Failed to toggle reaction", e);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 border-b border-border"
        style={{ paddingTop: "max(14px, env(safe-area-inset-top))", paddingBottom: 14 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-extrabold text-foreground tracking-tight">
            LIVE FEED
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs font-semibold text-muted-foreground px-3 py-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors"
        >
          Close
        </button>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ paddingBottom: 20 }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Loading feed...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-3xl">📡</span>
            <span className="text-sm text-muted-foreground font-medium">
              Waiting for action...
            </span>
            <span className="text-xs text-muted-foreground">
              Events appear as holes are scored
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((evt: any) => {
              const icon = EVENT_ICONS[evt.event_type] || "📝";
              const color = EVENT_COLORS[evt.event_type] || "hsl(var(--foreground))";
              const eventReactions = reactions[evt.id] || [];
              const data = evt.event_data || {};
              const myReaction = eventReactions.find((r: any) => r.user_id === user?.id);

              // Group reactions by type
              const reactionCounts: Record<string, number> = {};
              eventReactions.forEach((r: any) => {
                reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
              });

              return (
                <div
                  key={evt.id}
                  className="rounded-2xl border border-border bg-card p-3"
                >
                  {/* Event header */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: `${color}14` }}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                          style={{ background: `${color}14`, color }}
                        >
                          Hole {evt.hole_number}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(parseISO(evt.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      {/* Event message */}
                      <p className="text-sm font-semibold text-foreground mt-1 leading-snug">
                        {data.playerName && (
                          <span style={{ color }}>{data.playerName} </span>
                        )}
                        {data.message || evt.event_type}
                      </p>
                      {data.quip && (
                        <p className="text-xs text-muted-foreground mt-1 italic leading-relaxed">
                          💬 "{data.quip}"
                        </p>
                      )}
                      {data.amount != null && data.amount !== 0 && (
                        <span
                          className="inline-block mt-1 text-xs font-bold font-mono px-2 py-0.5 rounded-md"
                          style={{
                            background: data.amount > 0 ? "hsl(var(--primary) / 0.1)" : "hsl(var(--destructive) / 0.1)",
                            color: data.amount > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))",
                          }}
                        >
                          {data.amount > 0 ? "+" : ""}${data.amount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reactions */}
                  <div className="flex items-center gap-1.5 mt-2 ml-12">
                    {/* Existing reactions */}
                    {Object.entries(reactionCounts).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(evt.id, emoji)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors"
                        style={{
                          borderColor: myReaction?.reaction_type === emoji
                            ? "hsl(var(--primary))"
                            : "hsl(var(--border))",
                          background: myReaction?.reaction_type === emoji
                            ? "hsl(var(--primary) / 0.1)"
                            : "hsl(var(--secondary))",
                        }}
                      >
                        <span className="text-xs">{emoji}</span>
                        <span className="text-[10px] font-bold text-muted-foreground">{count}</span>
                      </button>
                    ))}

                    {/* Add reaction button */}
                    {activeReactionEvent === evt.id ? (
                      <div className="flex gap-1 bg-card border border-border rounded-full px-1.5 py-0.5 shadow-lg">
                        {REACTION_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(evt.id, emoji)}
                            className="text-base hover:scale-125 transition-transform px-0.5"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveReactionEvent(evt.id)}
                        className="w-7 h-7 rounded-full border border-border bg-secondary flex items-center justify-center text-xs hover:bg-muted transition-colors"
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
