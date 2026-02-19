import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadUserProfile, loadSettlements, sendFriendRequest, loadFriends, loadSentRequests, loadPendingRequests } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Check, Clock, MessageCircle } from "lucide-react";

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending_sent" | "pending_received" | "accepted">("none");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  // If viewing own profile, redirect
  useEffect(() => {
    if (userId === user?.id) {
      navigate("/profile", { replace: true });
    }
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

        // Check friendship status
        const accepted = friends.find(
          (f: any) => f.user_id_a === userId || f.user_id_b === userId
        );
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

        // Load their completed rounds (visible ones)
        const { data: roundData } = await supabase
          .from("rounds")
          .select("id, course, game_type, status, created_at")
          .eq("created_by", userId)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10);
        setRounds(roundData || []);
      } catch (e) {
        console.error("Failed to load user profile", e);
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
      toast({ title: "Friend request sent!" });
    } catch (e: any) {
      toast({ title: "Failed to send request", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24 px-4 pt-6">
        <div className="bg-card rounded-2xl p-10 text-center border border-border">
          <div className="text-3xl mb-3">👤</div>
          <div className="text-sm font-semibold text-muted-foreground">Profile not found</div>
          <div className="text-xs text-muted-foreground mt-1">This user may not exist or you don't have access.</div>
        </div>
      </div>
    );
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "Player";

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Profile</h1>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {/* Profile Card */}
        <div className="bg-card rounded-2xl p-6 text-center border border-border shadow-sm">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={fullName}
              className="w-[72px] h-[72px] rounded-full object-cover mx-auto" />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[28px] font-bold mx-auto">
              {fullName[0]?.toUpperCase() || "?"}
            </div>
          )}

          <div className="text-xl font-extrabold text-foreground mt-3 truncate px-2">
            {fullName}
          </div>

          {profile.handicap != null && (
            <span className="inline-block mt-2 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md font-mono">
              HCP {profile.handicap}
            </span>
          )}

          {profile.home_course && (
            <div className="text-xs text-muted-foreground mt-2">⛳ {profile.home_course}</div>
          )}

          {profile.state && (
            <div className="text-xs text-muted-foreground mt-1">📍 {profile.state}</div>
          )}

          {/* Friend action */}
          <div className="mt-4">
            {friendStatus === "accepted" ? (
              <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold">
                <Check size={14} /> Friends
              </div>
            ) : friendStatus === "pending_sent" ? (
              <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-semibold">
                <Clock size={14} /> Request Sent
              </div>
            ) : friendStatus === "pending_received" ? (
              <button onClick={() => navigate("/inbox")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold border-none cursor-pointer hover:opacity-90 transition-opacity">
                <MessageCircle size={14} /> Respond to Request
              </button>
            ) : (
              <button onClick={handleAddFriend} disabled={sending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50">
                <UserPlus size={14} /> {sending ? "Sending..." : "Add Friend"}
              </button>
            )}
          </div>
        </div>

        {/* Recent Rounds */}
        {rounds.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Rounds
            </div>
            <div className="flex flex-col gap-2">
              {rounds.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-base">⛳</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{r.course}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.game_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
