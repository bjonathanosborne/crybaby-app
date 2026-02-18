import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { loadProfile, loadMyRounds, loadFriends } from "@/lib/db";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { Trophy, Users, Flame, ChevronRight, Plus, Loader2 } from "lucide-react";

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ rounds: 0, friends: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadProfile().then(setProfile),
      loadMyRounds(100).then(r => setStats(s => ({ ...s, rounds: r?.length || 0 }))),
      loadFriends().then(f => setStats(s => ({ ...s, friends: f?.length || 0 }))),
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
      {/* Welcome section */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-sm text-muted-foreground font-medium">Welcome back,</p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight mt-0.5">
          {profile?.display_name || "Golfer"} 👋
        </h1>
      </div>

      {/* Quick stats */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Trophy size={16} className="text-primary" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rounds</span>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{stats.rounds}</div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Users size={16} className="text-accent-foreground" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Friends</span>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{stats.friends}</div>
        </div>
      </div>

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
      </div>
    </div>
  );
}
