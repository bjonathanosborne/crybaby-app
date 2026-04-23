import { useState, useEffect, useMemo, useRef } from "react";
import { validateHandicapInput } from "@/lib/handicap";
import { validateProfileNames, nameErrorMessage } from "@/lib/profileNameValidation";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadProfile, updateProfile, loadMyRounds, loadSettlements, uploadUserAvatar, loadFriends, loadUserProfile } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import CourseSearch from "@/components/CourseSearch";
import { ChevronRight } from "lucide-react";
import ProfileRoundsList from "@/components/profile/ProfileRoundsList";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: "", handicap: "", home_course: "", first_name: "", last_name: "", state: "", ghin: "",
    handicap_visible_to_friends: true,
    rounds_visible_to_friends: true,
  });
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
        handicap_visible_to_friends: p.handicap_visible_to_friends !== false,
        rounds_visible_to_friends: p.rounds_visible_to_friends !== false,
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

  // Quick total for the Stats card below; the new ProfileRoundsList owns
  // the cumulative-with-filter display.
  const totalWinnings = useMemo(
    () => settlements.reduce((sum, s) => sum + Number(s.amount), 0),
    [settlements],
  );

  // Inline handicap validation — recomputed on every keystroke. Drives the
  // red error line, the aria-invalid attribute, and the save-button guard.
  const handicapValidation = useMemo(
    () => validateHandicapInput(editForm.handicap),
    [editForm.handicap],
  );

  // PR #23 D1: shared name-validation so ProfilePage's edit gate matches
  // ProfileCompletionPage. Names must be >= 2 chars after trim; empty is
  // allowed and just leaves profile_completed as its current value.
  const nameValidation = useMemo(
    () => validateProfileNames(editForm.first_name, editForm.last_name),
    [editForm.first_name, editForm.last_name],
  );

  const handleSaveProfile = async () => {
    if (!handicapValidation.ok) {
      toast({ title: "Fix handicap first", description: handicapValidation.reason, variant: "destructive" });
      return;
    }
    // PR #23 D1: explicit name-length gate. Previously any non-empty
    // name passed profile_completed → profiles with "T"/"B" became
    // invisible to search. Now single-letter saves are rejected at
    // the client boundary + the save is blocked.
    if (editForm.first_name?.trim() || editForm.last_name?.trim()) {
      // User is trying to set names — enforce the min-length rule.
      if (!nameValidation.ok) {
        const firstMsg = nameErrorMessage(nameValidation.firstNameError);
        const lastMsg = nameErrorMessage(nameValidation.lastNameError);
        toast({
          title: "Fix name first",
          description: firstMsg || lastMsg || "Enter your first and last name.",
          variant: "destructive",
        });
        return;
      }
    }
    try {
      // Profile_completed requires BOTH names to pass the stricter gate
      // AND ghin to be present. Partial/single-letter names no longer
      // flip the flag to true.
      const isComplete = nameValidation.ok && !!editForm.ghin?.trim();
      await updateProfile({
        display_name: editForm.display_name,
        handicap: handicapValidation.kind === "valid" ? handicapValidation.value : null,
        home_course: editForm.home_course || null,
        first_name: editForm.first_name || "",
        last_name: editForm.last_name || "",
        state: editForm.state || "",
        ghin: editForm.ghin || null,
        handicap_visible_to_friends: editForm.handicap_visible_to_friends,
        rounds_visible_to_friends: editForm.rounds_visible_to_friends,
        profile_completed: isComplete,
      });
      setProfile((prev: any) => ({
        ...prev,
        ...editForm,
        handicap: handicapValidation.kind === "valid" ? handicapValidation.value : null,
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
          <div className="w-[96px] h-[96px] rounded-full bg-muted" />
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

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Page header */}
      <div className="px-5 pt-5 pb-4 flex justify-between items-center">
        <h1 className="text-3xl text-primary tracking-tight">Profile</h1>
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
                style={{ width: 96, height: 96, borderRadius: 48, objectFit: "cover", display: "block", margin: "0 auto" }} />
            ) : (
              <div className="bg-primary text-primary-foreground" style={{
                width: 96, height: 96, borderRadius: 48,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, fontWeight: 700,
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

              {/* Handicap — full-width row. Validation + helper copy live inline
                  below the input so the user sees format guidance without
                  having to submit first. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <input
                  data-testid="profile-handicap-input"
                  value={editForm.handicap}
                  onChange={e => setEditForm(f => ({ ...f, handicap: e.target.value }))}
                  placeholder="Handicap"
                  type="number"
                  inputMode="decimal"
                  min={-5}
                  max={54}
                  step={0.1}
                  aria-invalid={!handicapValidation.ok}
                  aria-describedby="profile-handicap-help"
                  style={{
                    ...inputStyle,
                    borderColor: !handicapValidation.ok ? "#DC2626" : (inputStyle.border as string | undefined)?.match(/#[0-9A-Fa-f]{6}/)?.[0] ?? "#DDD0BB",
                  }}
                />
                {!handicapValidation.ok && (
                  <span
                    data-testid="profile-handicap-error"
                    role="alert"
                    style={{ fontSize: 11, color: "#DC2626", marginTop: 2 }}
                  >
                    {handicapValidation.reason}
                  </span>
                )}
                <span
                  id="profile-handicap-help"
                  data-testid="profile-handicap-help"
                  style={{ fontSize: 11, color: "#8B7355", marginTop: 2, lineHeight: 1.4 }}
                >
                  Enter your current handicap index. Find yours at ghin.com — automatic GHIN lookup is coming soon.
                </span>
              </div>

              {/* Handicap privacy toggle — surfaced directly under the handicap
                  input (not buried after GHIN) so "show my handicap" visually
                  attaches to the handicap it's controlling. Affects passive
                  browsing only; active-round visibility is always on. */}
              <label
                data-testid="handicap-visibility-toggle"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px", borderRadius: 10,
                  border: "1px solid #DDD0BB", background: "#FAF5EC",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={editForm.handicap_visible_to_friends}
                  onChange={e => setEditForm(f => ({ ...f, handicap_visible_to_friends: e.target.checked }))}
                  style={{ marginTop: 2, accentColor: "#2D5016" }}
                  aria-describedby="handicap-visibility-help"
                />
                <span style={{ fontSize: 13, color: "#1E130A", lineHeight: 1.4 }}>
                  Show my handicap on friends' profiles and leaderboards
                  <span
                    id="handicap-visibility-help"
                    style={{ display: "block", fontSize: 11, color: "#8B7355", marginTop: 2 }}
                  >
                    Players in your active rounds see it either way.
                  </span>
                </span>
              </label>

              {/* GHIN — standalone row. 6-8 digits; non-digits stripped on input. */}
              <input
                data-testid="profile-ghin-input"
                value={editForm.ghin}
                onChange={e => setEditForm(f => ({ ...f, ghin: e.target.value.replace(/\D/g, "") }))}
                placeholder="GHIN # (6–8 digits)"
                maxLength={10}
                style={inputStyle}
              />

              {/* Rounds privacy toggle — mirrors handicap. Rounds you SHARED with
                  a viewer are always visible to them regardless; this flag only
                  hides rounds you played without the viewer. */}
              <label
                data-testid="rounds-visibility-toggle"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px", borderRadius: 10,
                  border: "1px solid #DDD0BB", background: "#FAF5EC",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={editForm.rounds_visible_to_friends}
                  onChange={e => setEditForm(f => ({ ...f, rounds_visible_to_friends: e.target.checked }))}
                  style={{ marginTop: 2, accentColor: "#2D5016" }}
                  aria-describedby="rounds-visibility-help"
                />
                <span style={{ fontSize: 13, color: "#1E130A", lineHeight: 1.4 }}>
                  Show my rounds to other users
                  <span
                    id="rounds-visibility-help"
                    style={{ display: "block", fontSize: 11, color: "#8B7355", marginTop: 2 }}
                  >
                    Rounds you played with someone else are always visible to them.
                  </span>
                </span>
              </label>

              {/* Home Course Search */}
              <CourseSearch
                value={editForm.home_course || undefined}
                onSelect={c => setEditForm(f => ({ ...f, home_course: c.name }))}
                placeholder="Search for your home course…"
                onAddManually={() => setShowAddCourse(true)}
              />
              {showAddCourse && (
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
                <button
                  onClick={handleSaveProfile}
                  disabled={!handicapValidation.ok}
                  data-testid="profile-save-button"
                  style={{
                    flex: 1, padding: 10, borderRadius: 10, border: "none",
                    background: handicapValidation.ok ? "#2D5016" : "#A8957B",
                    color: "#fff", fontWeight: 700, fontFamily: "inherit",
                    cursor: handicapValidation.ok ? "pointer" : "not-allowed",
                  }}
                >
                  Save
                </button>
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

        {/* Rounds list — cumulative P&L header + date filter + recent/month/year
            hierarchy. Supersedes the old Ledger + Round History cards. */}
        {user && (
          <ProfileRoundsList
            targetUserId={user.id}
            viewerUserId={user.id}
          />
        )}
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
