import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendFriendRequest } from "@/lib/db";
import { X, UserPlus, Check, Loader2 } from "lucide-react";

interface SuggestedUser {
  user_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  handicap: number | null;
  home_course: string | null;
}

export default function FriendSuggestionsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSuggestions();
  }, [user]);

  const loadSuggestions = async () => {
    try {
      // Load all profiles except current user
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, avatar_url, handicap, home_course")
        .neq("user_id", user!.id)
        .limit(50);

      // Load existing friendships to exclude
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id_a, user_id_b")
        .or(`user_id_a.eq.${user!.id},user_id_b.eq.${user!.id}`);

      const connectedIds = new Set<string>();
      (friendships || []).forEach((f: any) => {
        connectedIds.add(f.user_id_a);
        connectedIds.add(f.user_id_b);
      });

      const filtered = (profiles || []).filter(
        (p: any) => !connectedIds.has(p.user_id)
      );

      setSuggestions(filtered as SuggestedUser[]);
    } catch (err) {
      console.error("Failed to load suggestions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (targetId: string) => {
    setSendingId(targetId);
    try {
      await sendFriendRequest(targetId);
      setSentIds((prev) => new Set(prev).add(targetId));
    } catch (err: any) {
      console.error("Failed to send request:", err);
    } finally {
      setSendingId(null);
    }
  };

  const getInitials = (p: SuggestedUser) => {
    const f = p.first_name?.[0] || "";
    const l = p.last_name?.[0] || "";
    return (f + l).toUpperCase() || p.display_name?.[0]?.toUpperCase() || "?";
  };

  const getName = (p: SuggestedUser) => {
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
    return full || p.display_name || "Golfer";
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-[420px] max-h-[80vh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <h2 className="text-lg font-extrabold text-foreground tracking-tight">People You May Know</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Add friends to get the most out of Crybaby</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center border-none cursor-pointer hover:bg-accent/80 transition-colors"
            aria-label="Close"
          >
            <X size={16} className="text-accent-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No suggestions yet — invite your golf buddies!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((p) => {
                const isSent = sentIds.has(p.user_id);
                const isSending = sendingId === p.user_id;

                return (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-background border border-border hover:border-primary/20 transition-colors"
                  >
                    {/* Avatar */}
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt={getName(p)}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{getInitials(p)}</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-foreground truncate">{getName(p)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[
                          p.handicap != null ? `${p.handicap} HCP` : null,
                          p.home_course,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Crybaby member"}
                      </div>
                    </div>

                    {/* Action */}
                    <button
                      onClick={() => !isSent && !isSending && handleSend(p.user_id)}
                      disabled={isSent || isSending}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-none cursor-pointer transition-all ${
                        isSent
                          ? "bg-primary/10 text-primary"
                          : "bg-primary text-primary-foreground hover:opacity-90"
                      } disabled:cursor-default`}
                    >
                      {isSending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isSent ? (
                        <>
                          <Check size={12} />
                          Sent
                        </>
                      ) : (
                        <>
                          <UserPlus size={12} />
                          Add
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full p-3 rounded-2xl bg-accent text-accent-foreground text-sm font-bold border-none cursor-pointer hover:bg-accent/80 transition-colors"
          >
            {sentIds.size > 0 ? `Done (${sentIds.size} sent)` : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
