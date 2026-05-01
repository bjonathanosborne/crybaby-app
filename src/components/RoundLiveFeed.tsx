import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { loadRoundEvents, loadEventReactions, toggleEventReaction } from "@/lib/db";
import { formatDistanceToNow, parseISO } from "date-fns";
import { CrybIcon } from "@/components/icons/CrybIcons";
import CaptureAppliedCard from "@/components/round/events/CaptureAppliedCard";
import LiveStandings from "@/components/round/LiveStandings";
import { mergeCaptureEvents, type RoundEventRow, type MergedCaptureEvent } from "@/components/round/events/captureEventTypes";

const REACTION_OPTIONS = ["🔥", "😂", "💀", "🍼", "👏"];

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
  /**
   * Optional: display-name map for the event renderers. Passed in by
   * the page so we avoid duplicate profile lookups. Keyed by
   * round_player_id (the primary key used in event_data.running_totals).
   */
  playerNames?: Record<string, string>;
  /**
   * Display name of the scorekeeper who captured (shown in the header
   * of capture cards). Optional: if absent, cards just show the timestamp.
   */
  scorekeeperName?: string;
  /**
   * Per-capture hammer hole count, keyed by capture_id. Populated by the
   * page from `rounds.course_details.game_state.hammerStateByHole` joined
   * with the capture's hole range. Used for the small "2 hammers" badge.
   */
  hammerHoleCountByCaptureId?: Record<string, number>;
  /** Course pars for the LiveStandings strokes-over-par derivation. */
  pars?: number[];
  /** Initial round_players.hole_scores map for the LiveStandings fallback. */
  initialHoleScores?: Record<string, Record<number, number>>;
  /** Initial totals per round_player_id for the LiveStandings fallback. */
  initialTotals?: Record<string, number>;
  /** Game mode label for the standings column header (e.g. "Nassau"). */
  gameLabel?: string;
  /** Hide the money column (solo rounds). */
  hideMoney?: boolean;
  /** Player ids currently holding an open hammer — drives the badge in standings. */
  openHammerPlayerIds?: string[];
  /**
   * Broadcast state for the round + a toggle handler. Rendered as an
   * on/off pill in this panel's header so the scorekeeper can flip
   * round-level visibility without leaving the feed view (BROADCAST
   * + FEED merged into a single concept; see PR description).
   * Both must be passed together to render the toggle; if either is
   * absent (e.g. the panel is opened from a context that doesn't own
   * broadcast state) the toggle is hidden.
   */
  isBroadcast?: boolean;
  onToggleBroadcast?: () => void;
}

export default function RoundLiveFeed({
  roundId,
  isOpen,
  onClose,
  playerNames = {},
  scorekeeperName,
  hammerHoleCountByCaptureId = {},
  pars = [],
  initialHoleScores = {},
  initialTotals = {},
  gameLabel = "Money",
  hideMoney = false,
  openHammerPlayerIds = [],
  isBroadcast,
  onToggleBroadcast,
}: RoundLiveFeedProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [reactions, setReactions] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const [activeReactionEvent, setActiveReactionEvent] = useState<string | null>(null);

  // Phase 3: split the event stream into capture-merged events + everything else.
  // Capture cards are rendered first (most eyeball-grabbing), then legacy event
  // types keep their existing renderer for score/birdie/hammer/etc.
  const { merged, nonCapture } = useMemo<{ merged: MergedCaptureEvent[]; nonCapture: RoundEventRow[] }>(() => {
    return mergeCaptureEvents(events as RoundEventRow[]);
  }, [events]);

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
        className="flex items-center justify-between px-5 border-b border-border gap-3"
        style={{ paddingTop: "max(14px, env(safe-area-inset-top))", paddingBottom: 14 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-extrabold text-foreground tracking-tight">
            LIVE FEED
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Broadcast toggle — only shown when the parent passes both
              the current broadcast state AND a toggle handler. Letting
              the scorekeeper turn friend-visibility on/off from the
              same panel that shows the events keeps the two concepts
              co-located: "what's happening" and "who can see it." */}
          {typeof isBroadcast === "boolean" && onToggleBroadcast && (
            <button
              onClick={onToggleBroadcast}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontFamily: "'Lato', sans-serif",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                background: isBroadcast ? "#2D5016" : "#DC2626",
                color: "#fff",
              }}
              title={isBroadcast ? "Broadcasting to friends — tap to stop" : "Tap to broadcast this round to friends"}
            >
              {isBroadcast ? "BROADCAST ON" : "BROADCAST OFF"}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs font-semibold text-muted-foreground px-3 py-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ paddingBottom: 20 }}
      >
        {/* Phase 3b: LiveStandings panel at the top of the modal.
            Renders even when no events yet so the scorekeeper sees
            the round's state from the moment they open the feed. */}
        {roundId && pars.length > 0 ? (
          <div className="mb-3">
            <LiveStandings
              roundId={roundId}
              playerNames={playerNames}
              gameLabel={gameLabel}
              pars={pars}
              initialHoleScores={initialHoleScores}
              initialTotals={initialTotals}
              hideMoney={hideMoney}
              openHammerPlayerIds={openHammerPlayerIds}
            />
          </div>
        ) : null}

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
            {/* Phase 3: capture cards (capture_applied merged with capture_money_shift) */}
            {merged.map(m => (
              <CaptureAppliedCard
                key={m.applied.id}
                merged={m}
                playerNames={playerNames}
                scorekeeperName={scorekeeperName}
                hammerHoleCount={hammerHoleCountByCaptureId[m.captureId] ?? 0}
              />
            ))}
            {nonCapture.map((evt: any) => {
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
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}14`, color }}
                    >
                      <CrybIcon name={evt.event_type} size={18} />
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
