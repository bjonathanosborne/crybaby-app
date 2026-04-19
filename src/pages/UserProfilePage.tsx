import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadUserProfile, loadSettlements, sendFriendRequest, acceptFriendRequest, removeFriendship, loadFriends, loadSentRequests, loadPendingRequests } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Check, Clock, MessageCircle, ChevronRight } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { CrybIcon } from "@/components/icons/CrybIcons";

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending_sent" | "pending_received" | "accepted">("none");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // If viewing own profile, redirect
  useEffect(() => {
    if (userId === user?.id) navigate("/profile", { replace: true });
  }, [userId, user?.id]);

  useEffect(() => {
    if (!userId || userId === user?.id) return;

    const load = async () => {
      try {
        const [p, friends, sent, received] = await Promise.all([
          loadUserProfile(userId),
          loadFriends(),
          loadSentRequests(),
          loadPendingRequests(),
        ]);
        setProfile(p);

        const accepted = friends.find((f: any) => f.user_id_a === userId || f.user_id_b === userId);
        if (accepted) {
          setFriendStatus("accepted");
          setFriendshipId(accepted.id);
        } else {
          const sentReq = sent.find((f: any) => f.user_id_b === userId);
          if (sentReq) {
            setFriendStatus("pending_sent");
            setFriendshipId(sentReq.id);
          } else {
            const receivedReq = received.find((f: any) => f.user_id_a === userId);
            if (receivedReq) {
              setFriendStatus("pending_received");
              setFriendshipId(receivedReq.id);
            }
          }
        }

        // Load their recent rounds
        const { data: roundData } = await supabase
          .from("rounds")
          .select("id, course, game_type, status, created_at")
          .eq("created_by", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        const roundList = roundData || [];
        setRounds(roundList);

        // Load recent events from those rounds
        if (roundList.length > 0) {
          const roundIds = roundList.map((r: any) => r.id);
          const { data: eventData } = await supabase
            .from("round_events")
            .select("*")
            .in("round_id", roundIds)
            .order("created_at", { ascending: false })
            .limit(20);
          setRecentEvents(eventData || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, user?.id]);

  const handleAddFriend = async () => {
    if (!userId || sending) return;
    setSending(true);
    try {
      await sendFriendRequest(userId);
      setFriendStatus("pending_sent");
      toast({ title: "Friend request sent! 🤝" });
    } catch (e: any) {
      toast({ title: "Failed to send request", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async () => {
    if (!friendshipId || accepting) return;
    setAccepting(true);
    try {
      await acceptFriendRequest(friendshipId);
      setFriendStatus("accepted");
      toast({ title: "Friend added! 🤝" });
    } catch {
      // silent
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;
  }

  if (!profile) {
    return (
      <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24 px-4 pt-6">
        <div className="bg-card rounded-2xl p-10 text-center border border-border">
          <div className="text-3xl mb-3">👤</div>
          <div className="text-sm font-semibold text-muted-foreground">Profile not found</div>
        </div>
      </div>
    );
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "Player";
  const roundMap = Object.fromEntries(rounds.map((r: any) => [r.id, r]));

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl text-primary tracking-tight">Profile</h1>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {/* ── Profile Card ── */}
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={fullName}
                className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold flex-shrink-0">
                {fullName[0]?.toUpperCase() || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-extrabold text-foreground truncate">{fullName}</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {/* Handicap respects the viewed user's handicap_visible_to_friends flag.
                    Default is true (visible). In-round contexts bypass this entirely —
                    they read the LOCKED round_players handicap from course_details JSONB,
                    not profiles.handicap, so this toggle has no effect on scoring surfaces. */}
                {profile.handicap != null && profile.handicap_visible_to_friends !== false && (
                  <span
                    data-testid="user-profile-handicap"
                    className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded font-mono"
                  >
                    HCP {profile.handicap}
                  </span>
                )}
                {profile.home_course && (
                  <span className="text-xs text-muted-foreground">⛳ {profile.home_course}</span>
                )}
                {profile.state && (
                  <span className="text-xs text-muted-foreground">📍 {profile.state}</span>
                )}
              </div>
            </div>
          </div>

          {/* Friend CTA — full-width below the profile row */}
          <div className="mt-4">
            {friendStatus === "accepted" && (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-bold">
                <Check size={15} /> Friends
              </div>
            )}
            {friendStatus === "pending_sent" && (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-semibold">
                <Clock size={15} /> Request Sent
              </div>
            )}
            {friendStatus === "pending_received" && (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <UserPlus size={15} /> {accepting ? "Accepting…" : "Accept Friend Request"}
              </button>
            )}
            {friendStatus === "none" && (
              <button
                onClick={handleAddFriend}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <UserPlus size={15} /> {sending ? "Sending…" : "Add Friend"}
              </button>
            )}
          </div>
        </div>

        {/* ── Recent Activity Feed ── */}
        {recentEvents.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Activity
            </div>
            <div className="flex flex-col divide-y divide-border">
              {recentEvents.slice(0, 10).map((event: any) => {
                const data = event.event_data || {};
                const round = roundMap[event.round_id];
                return (
                  <div key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 flex-shrink-0 text-foreground"><CrybIcon name={event.event_type} size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground leading-snug">
                        {data.message || `Hole ${event.hole_number}`}
                      </div>
                      {data.quip && (
                        <div className="text-xs text-muted-foreground italic mt-0.5">💬 {data.quip}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {round?.course && <span>{round.course} · </span>}
                        {event.hole_number && <span>Hole {event.hole_number} · </span>}
                        {formatDistanceToNow(parseISO(event.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    {data.amount > 0 && (
                      <span className="text-xs font-bold text-primary font-mono flex-shrink-0">${data.amount}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recent Rounds ── */}
        {rounds.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Rounds ({rounds.length})
            </div>
            <div className="flex flex-col gap-0">
              {rounds.map((r: any, i: number) => (
                <div key={r.id}
                  className={`flex items-center gap-3 py-3 ${i < rounds.length - 1 ? "border-b border-border" : ""}`}>
                  <span className="text-base">⛳</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{r.course}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.game_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      r.status === "completed" ? "bg-primary/10 text-primary" :
                      r.status === "active" ? "bg-amber-100 text-amber-700" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {r.status === "completed" ? "Done" : r.status === "active" ? "● Live" : r.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
