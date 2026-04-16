import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useMemo, useRef } from "react";
import { loadProfile, updateProfile, loadMyRounds, loadFriends, loadSettlements, uploadUserAvatar } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trophy, Users, Flame, ChevronRight, Plus, Loader2, Target, Clock, MapPin, BarChart3 } from "lucide-react";
import FriendSuggestionsModal from "@/components/FriendSuggestionsModal";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { AUSTIN_COURSES } from "@/data/constants";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

const MONO = "'SF Mono', 'JetBrains Mono', monospace";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid #DDD0BB", background: "#FAF5EC",
  fontFamily: "'Lato', -apple-system, sans-serif",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

type LedgerPeriod = "monthly" | "annual" | "all";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [recentRounds, setRecentRounds] = useState<any[]>([]);
  const [allRounds, setAllRounds] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [stats, setStats] = useState({ rounds: 0, friends: 0 });
  const [loading, setLoading] = useState(true);
  const [showFriendSuggestions, setShowFriendSuggestions] = useState(false);

  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: "", handicap: "", home_course: "", first_name: "", last_name: "", state: "", ghin: "" });
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCity, setNewCourseCity] = useState("");
  const [userCourses, setUserCourses] = useState<any[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [ledgerPeriod, setLedgerPeriod] = useState<LedgerPeriod>("monthly");

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadUserAvatar(file);
      setProfile((prev: any) => ({ ...prev, avatar_url: url }));
      toast({ title: "Avatar updated!" });
    } catch (err) {
      console.error(err);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const loadUserCourses = async () => {
    const { data } = await supabase.from("user_courses").select("*").order("name");
    setUserCourses(data || []);
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadProfile().then(p => {
        setProfile(p);
        if (p) setEditForm({
          display_name: p.display_name || "",
          handicap: p.handicap?.toString() || "",
          home_course: p.home_course || "",
          first_name: p.first_name || "",
          last_name: p.last_name || "",
          state: p.state || "",
          ghin: p.ghin || "",
        });
      }),
      loadMyRounds(100).then(r => {
        setAllRounds(r || []);
        setRecentRounds(r?.slice(0, 5) || []);
        setStats(s => ({ ...s, rounds: r?.length || 0 }));
      }),
      loadFriends().then(f => {
        const count = f?.length || 0;
        setStats(s => ({ ...s, friends: count }));
        if (count === 0 && !sessionStorage.getItem("friend_suggestions_dismissed")) {
          setShowFriendSuggestions(true);
        }
      }),
      loadSettlements().then(s => setSettlements(s || [])),
    ]).finally(() => setLoading(false));
    loadUserCourses();
  }, [user]);

  const completedRounds = allRounds.filter(r => r.status === "completed");

  const ledgerData = useMemo(() => {
    if (!settlements.length) return { total: 0, periods: [] };
    const total = settlements.reduce((sum, s) => sum + Number(s.amount), 0);
    const grouped: Record<string, { label: string; amount: number; rounds: any[] }> = {};
    settlements.forEach(s => {
      const date = parseISO(s.created_at);
      let key: string, label: string;
      if (ledgerPeriod === "monthly") { key = format(date, "yyyy-MM"); label = format(date, "MMMM yyyy"); }
      else if (ledgerPeriod === "annual") { key = format(date, "yyyy"); label = format(date, "yyyy"); }
      else { key = "all"; label = "All Time"; }
      if (!grouped[key]) grouped[key] = { label, amount: 0, rounds: [] };
      grouped[key].amount += Number(s.amount);
      grouped[key].rounds.push(s);
    });
    const periods = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
    return { total, periods };
  }, [settlements, ledgerPeriod]);

  const totalWinnings = ledgerData.total;

  const handleSaveProfile = async () => {
    try {
      const isComplete = !!(editForm.first_name?.trim() && editForm.last_name?.trim() && editForm.ghin?.trim());
      await updateProfile({
        display_name: editForm.display_name,
        handicap: editForm.handicap ? Number(editForm.handicap) : null,
        home_course: editForm.home_course || null,
        first_name: editForm.first_name || "",
        last_name: editForm.last_name || "",
        state: editForm.state || "",
        ghin: editForm.ghin || null,
        profile_completed: isComplete,
      });
      setProfile((prev: any) => ({ ...prev, ...editForm, handicap: editForm.handicap ? Number(editForm.handicap) : null }));
      setEditingProfile(false);
      toast({ title: "Profile saved!" });
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Golfer";

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

      {/* Profile Card */}
      <div className="mx-4 mt-5 bg-card rounded-2xl border border-border p-5 text-center">
        <div className="relative inline-block">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={fullName}
              className="w-[72px] h-[72px] rounded-full object-cover mx-auto block" />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[28px] font-bold mx-auto">
              {fullName[0]?.toUpperCase() || "?"}
            </div>
          )}
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          <button onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-[26px] h-[26px] rounded-full bg-foreground border-2 border-card text-card text-xs cursor-pointer flex items-center justify-center"
            style={{ opacity: uploadingAvatar ? 0.5 : 1 }}>
            {uploadingAvatar ? "…" : "📷"}
          </button>
        </div>

        {editingProfile ? (
          <div className="mt-4 flex flex-col gap-2.5 text-left">
            <div className="flex gap-2">
              <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First Name" style={{ ...inputStyle, flex: 1 }} />
              <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last Name" style={{ ...inputStyle, flex: 1 }} />
            </div>
            <input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Display Name" style={inputStyle} />
            <div className="flex gap-2">
              <input value={editForm.handicap} onChange={e => setEditForm(f => ({ ...f, handicap: e.target.value }))} placeholder="Handicap" type="number" style={{ ...inputStyle, flex: 1 }} />
              <input value={editForm.ghin} onChange={e => setEditForm(f => ({ ...f, ghin: e.target.value.replace(/\D/g, "") }))} placeholder="GHIN #" maxLength={10} style={{ ...inputStyle, flex: 1 }} />
            </div>
            {!showAddCourse ? (
              <select value={editForm.home_course}
                onChange={e => { if (e.target.value === "__add_new__") { setShowAddCourse(true); } else { setEditForm(f => ({ ...f, home_course: e.target.value })); } }}
                style={{ ...inputStyle, appearance: "none" }}>
                <option value="">Select Home Course / Club</option>
                {AUSTIN_COURSES.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
                {userCourses.map(c => (<option key={c.id} value={c.name}>{c.name} (User Added)</option>))}
                <option value="__add_new__">+ Add a Course / Club</option>
              </select>
            ) : (
              <div className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-muted">
                <span className="text-[11px] font-bold text-muted-foreground">Add New Course</span>
                <input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} placeholder="Course / Club Name" style={inputStyle} />
                <input value={newCourseCity} onChange={e => setNewCourseCity(e.target.value)} placeholder="City" style={inputStyle} />
                <div className="flex gap-2">
                  <button onClick={async () => {
                    if (!newCourseName.trim()) return;
                    const { data, error } = await supabase.from("user_courses").insert({ name: newCourseName.trim(), city: newCourseCity.trim(), state: editForm.state || "", created_by: user!.id }).select().single();
                    if (error) { toast({ title: "Error adding course", variant: "destructive" }); return; }
                    setUserCourses(prev => [...prev, data]);
                    setEditForm(f => ({ ...f, home_course: newCourseName.trim() }));
                    setNewCourseName(""); setNewCourseCity(""); setShowAddCourse(false);
                    toast({ title: "Course added!" });
                  }} className="flex-1 py-2 rounded-lg border-none bg-primary text-primary-foreground font-bold text-xs cursor-pointer">Add</button>
                  <button onClick={() => { setShowAddCourse(false); setNewCourseName(""); setNewCourseCity(""); }}
                    className="flex-1 py-2 rounded-lg border border-border bg-card text-muted-foreground font-semibold text-xs cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            <select value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} style={{ ...inputStyle, appearance: "none" }}>
              <option value="">Select State</option>
              {US_STATES.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
            <div className="flex gap-2">
              <button onClick={handleSaveProfile} className="flex-1 py-2.5 rounded-xl border-none bg-primary text-primary-foreground font-bold text-sm cursor-pointer">Save</button>
              <button onClick={() => { setEditingProfile(false); setShowAddCourse(false); }} className="flex-1 py-2.5 rounded-xl border border-border bg-card text-muted-foreground font-semibold text-sm cursor-pointer">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 text-xl font-extrabold text-foreground truncate px-2" title={fullName}>{fullName}</div>
            {profile?.handicap != null && (
              <span className="inline-block mt-1.5 text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-md" style={{ fontFamily: MONO }}>
                HCP {profile.handicap}
              </span>
            )}
            {profile?.home_course && <div className="text-xs text-muted-foreground mt-1.5">{profile.home_course}</div>}
            <div className="flex gap-2 justify-center mt-3">
              <button onClick={() => setEditingProfile(true)}
                className="px-4 py-2 rounded-xl border border-border bg-card text-muted-foreground text-xs font-semibold cursor-pointer hover:bg-muted transition-colors">
                Edit Profile
              </button>
              <button onClick={signOut}
                className="px-3 py-2 rounded-xl border border-border bg-card text-destructive text-xs font-semibold cursor-pointer hover:bg-destructive/10 transition-colors">
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Quick stats */}
      <div className="px-4 grid grid-cols-3 gap-3 mt-4 mb-5">
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target size={14} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{profile?.handicap != null ? profile.handicap : "—"}</div>
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

      {/* Quick actions */}
      <div className="px-4 flex flex-col gap-3 mb-5">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Quick Actions</h2>
        <button onClick={() => navigate("/setup")}
          className="w-full p-4 rounded-2xl bg-primary text-primary-foreground cursor-pointer border-none text-left hover:opacity-95 transition-opacity flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center"><Plus size={20} /></div>
          <div className="flex-1"><div className="text-sm font-bold">Start a Round</div><div className="text-xs opacity-80">Set up a new game with your crew</div></div>
          <ChevronRight size={18} className="opacity-60" />
        </button>
        <button onClick={() => navigate("/feed")}
          className="w-full p-4 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center"><Flame size={20} className="text-accent-foreground" /></div>
          <div className="flex-1"><div className="text-sm font-bold text-foreground">View Feed</div><div className="text-xs text-muted-foreground">See what your crew is up to</div></div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>
        <button onClick={() => navigate("/stats")}
          className="w-full p-4 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 hover:shadow-sm transition-all flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center"><BarChart3 size={20} className="text-accent-foreground" /></div>
          <div className="flex-1"><div className="text-sm font-bold text-foreground">My Stats</div><div className="text-xs text-muted-foreground">Scoring trends, P&L, and win record</div></div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>
      </div>

      {/* Recent rounds */}
      {recentRounds.length > 0 && (
        <div className="px-4 mb-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 mb-3">Recent Rounds</h2>
          <div className="flex flex-col gap-2">
            {recentRounds.map((round) => (
              <button key={round.id} onClick={() => navigate(`/round/${round.id}`)}
                className="w-full p-3 rounded-2xl bg-card border border-border cursor-pointer text-left hover:border-primary/30 transition-all flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0"><MapPin size={16} className="text-accent-foreground" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{round.course || "Unknown Course"}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{round.game_type}</span><span>·</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{formatDistanceToNow(new Date(round.created_at), { addSuffix: true })}</span>
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

      {/* P&L Ledger */}
      <div className="mx-4 mb-5 bg-card rounded-2xl border border-border p-5">
        <div className="flex justify-between items-center mb-3.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ledger</span>
          <div className="flex gap-1">
            {(["monthly", "annual", "all"] as LedgerPeriod[]).map(p => (
              <button key={p} onClick={() => setLedgerPeriod(p)}
                className={`px-2.5 py-1 rounded-md border-none cursor-pointer text-[11px] font-semibold transition-colors ${ledgerPeriod === p ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                {p === "monthly" ? "Mo" : p === "annual" ? "Yr" : "All"}
              </button>
            ))}
          </div>
        </div>
        {ledgerData.total !== 0 && (
          <div className={`text-center text-2xl font-extrabold mb-3 ${totalWinnings >= 0 ? "text-primary" : "text-destructive"}`} style={{ fontFamily: MONO }}>
            {totalWinnings >= 0 ? "+" : ""}${totalWinnings.toFixed(0)}
          </div>
        )}
        {ledgerData.periods.length === 0 ? (
          <div className="text-center py-5 text-sm text-muted-foreground">No settlement data yet. Complete a round to see your ledger.</div>
        ) : (
          ledgerData.periods.map((period, i) => (
            <div key={i} className={i < ledgerData.periods.length - 1 ? "mb-4" : ""}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-foreground">{period.label}</span>
                <span className={`text-[15px] font-extrabold ${period.amount >= 0 ? "text-primary" : "text-destructive"}`} style={{ fontFamily: MONO }}>
                  {period.amount >= 0 ? "+" : ""}${period.amount.toFixed(0)}
                </span>
              </div>
              {period.rounds.map((s: any, j: number) => (
                <div key={j} className="flex justify-between items-center p-2.5 bg-muted rounded-lg mb-1 text-xs">
                  <div>
                    <span className="font-semibold text-foreground">{s.rounds?.course || "Round"}</span>
                    {s.is_manual_adjustment && <span className="ml-1.5 text-[10px] text-accent-foreground font-bold">ADJUSTED</span>}
                    <div className="text-[10px] text-muted-foreground">{format(parseISO(s.created_at), "MMM d, yyyy")}{s.notes ? ` · ${s.notes}` : ""}</div>
                  </div>
                  <span className={`font-bold text-[13px] ${Number(s.amount) >= 0 ? "text-primary" : "text-destructive"}`} style={{ fontFamily: MONO }}>
                    {Number(s.amount) >= 0 ? "+" : ""}${Number(s.amount).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
