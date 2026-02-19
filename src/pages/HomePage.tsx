import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { loadProfile, loadMyRounds, loadFriends } from "@/lib/db";
import { Trophy, Users, Flame, ChevronRight, Plus, Loader2, Target, Clock, MapPin, BarChart3 } from "lucide-react";
import FriendSuggestionsModal from "@/components/FriendSuggestionsModal";
import { formatDistanceToNow } from "date-fns";

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [recentRounds, setRecentRounds] = useState<any[]>([]);
  const [stats, setStats] = useState({ rounds: 0, friends: 0 });
  const [loading, setLoading] = useState(true);
  const [showFriendSuggestions, setShowFriendSuggestions] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadProfile().then(setProfile),
      loadMyRounds(100).then(r => {
        setRecentRounds(r?.slice(0, 5) || []);
        setStats(s => ({ ...s, rounds: r?.length || 0 }));
      }),
      loadFriends().then(f => {
        const count = f?.length || 0;
        setStats(s => ({ ...s, friends: count }));
        // Show friend suggestions for users with no friends, once per session
        if (count === 0 && !sessionStorage.getItem("friend_suggestions_dismissed")) {
          setShowFriendSuggestions(true);
        }
      }),
    ]).finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {showFriendSuggestions && (
        <FriendSuggestionsModal
          onClose={() => {
            setShowFriendSuggestions(false);
            sessionStorage.setItem("friend_suggestions_dismissed", "true");
          }}
        />
      )}
      {/* Welcome section */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-sm text-muted-foreground font-medium">Welcome back,</p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight mt-0.5">
          {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Golfer"} 👋
        </h1>
      </div>

      {/* Quick stats */}
      <div className="px-4 grid grid-cols-3 gap-3 mb-5">
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target size={14} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">
            {profile?.handicap != null ? profile.handicap : "—"}
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Handicap</span>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Trophy size={14} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{stats.rounds}</div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rounds</span>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <Users size={14} className="text-accent-foreground" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{stats.friends}</div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Friends</span>
        </div>
      </div>

      {/* Recent rounds */}
      {recentRounds.length > 0 && (
        <div className="px-4 mb-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-3">Recent Rounds</h2>
          <div className="flex flex-col gap-2">
            {recentRounds.map((round) => (
              <button
                key={round.id}
                onClick={() => navigate(`/round/${round.id}`)}
                className="w-full p-3 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 transition-all flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{round.course || "Unknown Course"}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{round.game_type}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDistanceToNow(new Date(round.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  {round.status === "completed" ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">Done</span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground bg-accent px-2 py-0.5 rounded-full">Live</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-4 flex flex-col gap-3">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Quick Actions</h2>

        <button onClick={() => navigate("/setup")}
          className="w-full p-4 rounded-2xl bg-primary text-primary-foreground cursor-pointer border-none text-left hover:opacity-95 transition-opacity flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
            <Plus size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Start a Round</div>
            <div className="text-xs opacity-80">Set up a new game with your crew</div>
          </div>
          <ChevronRight size={18} className="opacity-60" />
        </button>

        <button onClick={() => navigate("/feed")}
          className="w-full p-4 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Flame size={20} className="text-accent-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">View Feed</div>
            <div className="text-xs text-muted-foreground">See what your crew is up to</div>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        <button onClick={() => navigate("/friends")}
          className="w-full p-4 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Users size={20} className="text-accent-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">Find Friends</div>
            <div className="text-xs text-muted-foreground">Invite your golf buddies</div>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>

        <button onClick={() => navigate("/stats")}
          className="w-full p-4 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <BarChart3 size={20} className="text-accent-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">My Stats</div>
            <div className="text-xs text-muted-foreground">Scoring trends, P&L, and win record</div>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
