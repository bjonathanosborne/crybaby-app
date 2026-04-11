import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadProfile, updateProfile, loadMyRounds, loadSettlements, uploadUserAvatar, loadFriends, loadUserProfile } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, startOfYear, parseISO } from "date-fns";
import { AUSTIN_COURSES } from "@/data/constants";
import { ChevronDown, Plus, ChevronRight } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

const MONO = "'JetBrains Mono', 'SF Mono', monospace";

type LedgerPeriod = "monthly" | "annual" | "all";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerPeriod, setLedgerPeriod] = useState<LedgerPeriod>("monthly");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: "", handicap: "", home_course: "", first_name: "", last_name: "", state: "", ghin: "" });
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCity, setNewCourseCity] = useState("");
  const [userCourses, setUserCourses] = useState<any[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [friendProfiles, setFriendProfiles] = useState<any[]>([]);

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
    } catch {
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
    if (!user) { setLoading(false); return; }
    Promise.all([
      loadProfile(),
      loadMyRounds(50),
      loadSettlements(),
    ]).then(([p, r, s]) => {
      setProfile(p);
      setRounds(r || []);
      setSettlements(s || []);
      if (p) setEditForm({
        display_name: p.display_name || "",
        handicap: p.handicap?.toString() || "",
        home_course: p.home_course || "",
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        state: p.state || "",
        ghin: p.ghin || "",
      });
    }).catch(() => {
      toast({ title: "Failed to load profile", description: "Please refresh and try again.", variant: "destructive" });
    }).finally(() => setLoading(false));
    loadUserCourses();

    // Load friend profiles for the friends strip
    loadFriends().then(async (friendships) => {
      const friendIds = friendships.map((f: any) =>
        f.user_id_a === user!.id ? f.user_id_b : f.user_id_a
      );
      const profiles = await Promise.all(friendIds.slice(0, 20).map((id: string) => loadUserProfile(id)));
      setFriendProfiles(profiles.filter(Boolean));
    }).catch(() => {/* silent */});
  }, [user]);

  // Ledger calculations
  const ledgerData = useMemo(() => {
    if (!settlements.length) return { total: 0, periods: [] };
    const total = settlements.reduce((sum, s) => sum + Number(s.amount), 0);

    const grouped: Record<string, { label: string; amount: number; rounds: any[] }> = {};
    settlements.forEach(s => {
      const date = parseISO(s.created_at);
      let key: string, label: string;
      if (ledgerPeriod === "monthly") {
        key = format(date, "yyyy-MM");
        label = format(date, "MMMM yyyy");
      } else if (ledgerPeriod === "annual") {
        key = format(date, "yyyy");
        label = format(date, "yyyy");
      } else {
        key = "all";
        label = "All Time";
      }
      if (!grouped[key]) grouped[key] = { label, amount: 0, rounds: [] };
      grouped[key].amount += Number(s.amount);
      grouped[key].rounds.push(s);
    });

    const periods = Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);

    return { total, periods };
  }, [settlements, ledgerPeriod]);

  const handleSaveProfile = async () => {
    try {
      await updateProfile({
        display_name: editForm.display_name,
        handicap: editForm.handicap ? Number(editForm.handicap) : null,
        home_course: editForm.home_course || null,
        first_name: editForm.first_name || "",
        last_name: editForm.last_name || "",
        state: editForm.state || "",
        ghin: editForm.ghin || null,
      });
      setProfile((prev: any) => ({
        ...prev,
        ...editForm,
        handicap: editForm.handicap ? Number(editForm.handicap) : null,
      }));
      setEditingProfile(false);
      toast({ title: "Profile saved!" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="max-w-[420px] mx-auto px-4 pt-4 flex flex-col gap-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex justify-between items-center pb-2">
          <div className="h-7 w-20 bg-muted rounded-lg" />
          <div className="h-8 w-16 bg-muted rounded-xl" />
        </div>
        {/* Profile card skeleton */}
        <div className="bg-card rounded-2xl p-6 flex flex-col items-center gap-3 shadow-sm">
          <div className="w-[72px] h-[72px] rounded-full bg-muted" />
          <div className="h-5 w-32 bg-muted rounded-md" />
          <div className="h-4 w-24 bg-muted rounded-md" />
          <div className="flex gap-8 mt-2">
            <div className="h-10 w-16 bg-muted rounded-lg" />
            <div className="h-10 w-16 bg-muted rounded-lg" />
            <div className="h-10 w-16 bg-muted rounded-lg" />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="bg-card rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="h-4 w-24 bg-muted rounded-md" />
          <div className="h-4 w-full bg-muted rounded-md" />
          <div className="h-4 w-3/4 bg-muted rounded-md" />
        </div>
      </div>
    );
  }

  const completedRounds = rounds.filter(r => r.status === "completed");
  const totalWinnings = ledgerData.total;

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Page header */}
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <h1 className="text-2xl text-primary tracking-tight">Profile</h1>
        <button onClick={signOut}
          className="px-3 py-2 rounded-xl border border-border bg-card text-destructive text-xs font-semibold cursor-pointer hover:bg-destructive/10 transition-colors">
          Sign Out
        </button>
      </div>

      <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Profile Card */}
        <div className="bg-card rounded-2xl shadow-sm" style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name}
                style={{ width: 72, height: 72, borderRadius: 36, objectFit: "cover", display: "block", margin: "0 auto" }} />
            ) : (
              <div className="bg-primary text-primary-foreground" style={{
                width: 72, height: 72, borderRadius: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 700,
                margin: "0 auto",
              }}>
                {(profile?.display_name || "?")[0].toUpperCase()}
              </div>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*"
              onChange={handleAvatarUpload} style={{ display: "none" }} />
            <button onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                position: "absolute", bottom: -4, right: -4,
                width: 26, height: 26, borderRadius: 13,
                background: "var(--foreground)", border: "2px solid var(--background)",
                color: "#fff", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: uploadingAvatar ? 0.5 : 1,
              }}>
              {uploadingAvatar ? "…" : "📷"}
            </button>
          </div>

          {editingProfile ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First Name" style={{ ...inputStyle, flex: 1 }} />
                <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last Name" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="Display Name" style={inputStyle} />
              <div style={{ display: "flex", gap: 8 }}>
                <input value={editForm.handicap} onChange={e => setEditForm(f => ({ ...f, handicap: e.target.value }))}
                  placeholder="Handicap" type="number" style={{ ...inputStyle, flex: 1 }} />
                <div style={{ flex: 1, position: "relative" }}>
                  <input value={editForm.ghin} disabled
                    placeholder="GHIN #" style={{ ...inputStyle, flex: 1, opacity: 0.5, cursor: "not-allowed", background: "#EDE7D9" }} />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontWeight: 700, color: "#A8957B", textTransform: "uppercase" }}>Coming Soon</span>
                </div>
              </div>

              {/* Home Course Dropdown */}
              {!showAddCourse ? (
                <select
                  value={editForm.home_course}
                  onChange={e => {
                    if (e.target.value === "__add_new__") {
                      setShowAddCourse(true);
                    } else {
                      setEditForm(f => ({ ...f, home_course: e.target.value }));
                    }
                  }}
                  style={{ ...inputStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                >
                  <option value="">Select Home Course / Club</option>
                  {AUSTIN_COURSES.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  {userCourses.map(c => (
                    <option key={c.id} value={c.name}>{c.name} (User Added)</option>
                  ))}
                  <option value="__add_new__">+ Add a Course / Club</option>
                </select>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, border: "1px solid #DDD0BB", background: "#FAF5EC" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8B7355" }}>Add New Course</span>
                  <input value={newCourseName} onChange={e => setNewCourseName(e.target.value)}
                    placeholder="Course / Club Name" style={inputStyle} />
                  <input value={newCourseCity} onChange={e => setNewCourseCity(e.target.value)}
                    placeholder="City" style={inputStyle} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={async () => {
                      if (!newCourseName.trim()) return;
                      const { data, error } = await supabase.from("user_courses").insert({
                        name: newCourseName.trim(),
                        city: newCourseCity.trim(),
                        state: editForm.state || "",
                        created_by: user!.id,
                      }).select().single();
                      if (error) { toast({ title: "Error adding course", variant: "destructive" }); return; }
                      setUserCourses(prev => [...prev, data]);
                      setEditForm(f => ({ ...f, home_course: newCourseName.trim() }));
                      setNewCourseName("");
                      setNewCourseCity("");
                      setShowAddCourse(false);
                      toast({ title: "Course added!" });
                    }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#2D5016", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      Add
                    </button>
                    <button onClick={() => { setShowAddCourse(false); setNewCourseName(""); setNewCourseCity(""); }}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #DDD0BB", background: "#FAF5EC", color: "#8B7355", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* State Dropdown */}
              <select
                value={editForm.state}
                onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))}
                style={{ ...inputStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
              >
                <option value="">Select State</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSaveProfile} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: "none",
                  background: "#2D5016", color: "#fff", fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                }}>Save</button>
                <button onClick={() => { setEditingProfile(false); setShowAddCourse(false); }} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: "1px solid #DDD0BB",
                  background: "#FAF5EC", color: "#8B7355", fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {(() => {
                const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Player";
                return (
                  <div style={{ fontFamily: "'Pacifico', cursive", fontSize: fullName.length > 20 ? 16 : 22, fontWeight: 400, color: "#2D5016", marginTop: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", padding: "0 8px", textShadow: "0 1px 8px rgba(212, 175, 55, 0.35)" }}
                    title={fullName}>
                    {fullName}
                  </div>
                );
              })()}
              {profile?.handicap != null && (
                <span style={{
                  fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#2D5016",
                  background: "#F0FDF4", padding: "3px 10px", borderRadius: 6, display: "inline-block", marginTop: 6,
                }}>HCP {profile.handicap}</span>
              )}
              {profile?.home_course && (
                <div style={{ fontSize: 12, color: "#A8957B", marginTop: 6 }}>{profile.home_course}</div>
              )}
              <button onClick={() => setEditingProfile(true)} style={{
                marginTop: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid #DDD0BB",
                background: "#FAF5EC", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#8B7355", cursor: "pointer",
              }}>Edit Profile</button>
            </>
          )}
        </div>

        {/* Friends Strip */}
        {friendProfiles.length > 0 && (
          <div style={{ background: "hsl(var(--card))", borderRadius: 20, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016" }}>
                Friends ({friendProfiles.length})
              </span>
              <button onClick={() => navigate("/friends")}
                style={{ fontSize: 12, fontWeight: 600, color: "#2D5016", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
                All <ChevronRight size={14} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
              {friendProfiles.map((fp: any) => {
                const name = [fp.first_name, fp.last_name].filter(Boolean).join(" ") || fp.display_name || "Player";
                const initial = name[0]?.toUpperCase() || "?";
                return (
                  <button key={fp.user_id} onClick={() => navigate(`/profile/${fp.user_id}`)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", flexShrink: 0, minWidth: 56 }}>
                    {fp.avatar_url ? (
                      <img src={fp.avatar_url} alt={name}
                        style={{ width: 48, height: 48, borderRadius: 24, objectFit: "cover" }} />
                    ) : (
                      <div className="bg-primary text-primary-foreground" style={{ width: 48, height: 48, borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>
                        {initial}
                      </div>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#8B7355", textAlign: "center", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fp.first_name || fp.display_name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div style={{
          background: "hsl(var(--card))", borderRadius: 20, padding: "18px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 14 }}>
            Stats
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Rounds Played", value: completedRounds.length.toString() },
              { label: "Total P&L", value: `${totalWinnings >= 0 ? "+" : ""}$${totalWinnings.toFixed(0)}`, color: totalWinnings >= 0 ? "#2D5016" : "#DC2626" },
              { label: "Active Rounds", value: rounds.filter(r => r.status === "active").length.toString() },
              { label: "Avg Per Round", value: completedRounds.length ? `$${(totalWinnings / completedRounds.length).toFixed(0)}` : "$0" },
            ].map(s => (
              <div key={s.label} style={{ padding: "12px 14px", background: "hsl(var(--muted))", borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: (s as any).color || "#1E130A" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#A8957B", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/stats")} style={{
            width: "100%", marginTop: 14, padding: "10px 0", borderRadius: 10,
            border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontFamily: "inherit",
            fontSize: 13, fontWeight: 700, color: "#2D5016", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            View Full Stats Dashboard
          </button>
        </div>

        {/* Ledger */}
        <div style={{
          background: "hsl(var(--card))", borderRadius: 20, padding: "18px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016" }}>
              Ledger
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["monthly", "annual", "all"] as LedgerPeriod[]).map(p => (
                <button key={p} onClick={() => setLedgerPeriod(p)} style={{
                  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                  background: ledgerPeriod === p ? "#1E130A" : "#EDE7D9",
                  color: ledgerPeriod === p ? "#fff" : "#A8957B",
                }}>{p === "monthly" ? "Mo" : p === "annual" ? "Yr" : "All"}</button>
              ))}
            </div>
          </div>

          {ledgerData.periods.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "#A8957B" }}>
              No settlement data yet. Complete a round to see your ledger.
            </div>
          ) : (
            ledgerData.periods.map((period, i) => (
              <div key={i} style={{ marginBottom: i < ledgerData.periods.length - 1 ? 16 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1E130A" }}>{period.label}</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 15, fontWeight: 800,
                    color: period.amount >= 0 ? "#2D5016" : "#DC2626",
                  }}>
                    {period.amount >= 0 ? "+" : ""}${period.amount.toFixed(0)}
                  </span>
                </div>
                {period.rounds.map((s: any, j: number) => (
                  <div key={j} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "hsl(var(--muted))", borderRadius: 8, marginBottom: 4,
                    fontSize: 12,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "#1E130A" }}>
                        {s.rounds?.course || "Round"}
                      </span>
                      {s.is_manual_adjustment && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>ADJUSTED</span>
                      )}
                      <div style={{ fontSize: 10, color: "#A8957B" }}>
                        {format(parseISO(s.created_at), "MMM d, yyyy")}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: MONO, fontWeight: 700, fontSize: 13,
                      color: Number(s.amount) >= 0 ? "#2D5016" : "#DC2626",
                    }}>
                      {Number(s.amount) >= 0 ? "+" : ""}${Number(s.amount).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Round History */}
        <div style={{
          background: "hsl(var(--card))", borderRadius: 20, padding: "18px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 14 }}>
            Round History
          </div>
          {rounds.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontFamily: "'Pacifico', cursive", fontSize: 16, fontWeight: 400, color: "#2D5016" }}>
              No rounds yet
            </div>
          ) : (
            rounds.slice(0, 20).map((r: any) => (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: "1px solid #F3F4F6",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{r.course || "Unknown Course"}</div>
                  <div style={{ fontSize: 11, color: "#A8957B" }}>
                    {format(parseISO(r.created_at), "MMM d, yyyy")} · {r.game_type} · {r.round_players?.length || 0} players
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                  background: r.status === "completed" ? "#F0FDF4" : r.status === "active" ? "#FEF3C7" : "#EDE7D9",
                  color: r.status === "completed" ? "#2D5016" : r.status === "active" ? "#92400E" : "#A8957B",
                }}>
                  {r.status === "completed" ? "✓ Done" : r.status === "active" ? "● Live" : r.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid #DDD0BB", background: "#FAF5EC",
  fontFamily: "'Lato', -apple-system, sans-serif",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
