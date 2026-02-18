import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadProfile, updateProfile, loadMyRounds, loadSettlements, uploadUserAvatar } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, startOfYear, parseISO } from "date-fns";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

type LedgerPeriod = "monthly" | "annual" | "all";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerPeriod, setLedgerPeriod] = useState<LedgerPeriod>("monthly");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ display_name: "", handicap: "", home_course: "", bio: "" });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!user) return;
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
        bio: p.bio || "",
      });
    }).finally(() => setLoading(false));
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
        bio: editForm.bio || null,
      });
      setProfile((prev: any) => ({ ...prev, ...editForm, handicap: editForm.handicap ? Number(editForm.handicap) : null }));
      setEditingProfile(false);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        Loading...
      </div>
    );
  }

  const completedRounds = rounds.filter(r => r.status === "completed");
  const totalWinnings = ledgerData.total;

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Page header */}
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Profile</h1>
        <button onClick={signOut}
          className="px-3 py-2 rounded-xl border border-border bg-card text-destructive text-xs font-semibold cursor-pointer hover:bg-destructive/10 transition-colors">
          Sign Out
        </button>
      </div>

      <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Profile Card */}
        <div style={{
          background: "#fff", borderRadius: 20, padding: "24px 20px", textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name}
                style={{ width: 72, height: 72, borderRadius: 36, objectFit: "cover", display: "block", margin: "0 auto" }} />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: 36, background: "#16A34A",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 28, fontWeight: 700, fontFamily: FONT,
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
                background: "#1A1A1A", border: "2px solid #fff",
                color: "#fff", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: uploadingAvatar ? 0.5 : 1,
              }}>
              {uploadingAvatar ? "…" : "📷"}
            </button>
          </div>

          {editingProfile ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="Display Name" style={inputStyle} />
              <input value={editForm.handicap} onChange={e => setEditForm(f => ({ ...f, handicap: e.target.value }))}
                placeholder="Handicap" type="number" style={inputStyle} />
              <input value={editForm.home_course} onChange={e => setEditForm(f => ({ ...f, home_course: e.target.value }))}
                placeholder="Home Course" style={inputStyle} />
              <textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Bio" rows={2} style={{ ...inputStyle, resize: "none" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSaveProfile} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: "none",
                  background: "#16A34A", color: "#fff", fontWeight: 700, fontFamily: FONT, cursor: "pointer",
                }}>Save</button>
                <button onClick={() => setEditingProfile(false)} style={{
                  flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E5E7EB",
                  background: "#fff", color: "#6B7280", fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginTop: 12 }}>
                {profile?.display_name || "Player"}
              </div>
              {profile?.handicap != null && (
                <span style={{
                  fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#16A34A",
                  background: "#F0FDF4", padding: "3px 10px", borderRadius: 6, display: "inline-block", marginTop: 6,
                }}>HCP {profile.handicap}</span>
              )}
              {profile?.home_course && (
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>{profile.home_course}</div>
              )}
              {profile?.bio && (
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6, fontStyle: "italic" }}>{profile.bio}</div>
              )}
              <button onClick={() => setEditingProfile(true)} style={{
                marginTop: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid #E5E7EB",
                background: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#6B7280", cursor: "pointer",
              }}>Edit Profile</button>
            </>
          )}
        </div>

        {/* Quick Stats */}
        <div style={{
          background: "#fff", borderRadius: 20, padding: "18px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Stats
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Rounds Played", value: completedRounds.length.toString() },
              { label: "Total P&L", value: `${totalWinnings >= 0 ? "+" : ""}$${totalWinnings.toFixed(0)}`, color: totalWinnings >= 0 ? "#16A34A" : "#DC2626" },
              { label: "Active Rounds", value: rounds.filter(r => r.status === "active").length.toString() },
              { label: "Avg Per Round", value: completedRounds.length ? `$${(totalWinnings / completedRounds.length).toFixed(0)}` : "$0" },
            ].map(s => (
              <div key={s.label} style={{ padding: "12px 14px", background: "#F9FAFB", borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: (s as any).color || "#1A1A1A" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ledger */}
        <div style={{
          background: "#fff", borderRadius: 20, padding: "18px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Ledger
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["monthly", "annual", "all"] as LedgerPeriod[]).map(p => (
                <button key={p} onClick={() => setLedgerPeriod(p)} style={{
                  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 11, fontWeight: 600,
                  background: ledgerPeriod === p ? "#1A1A1A" : "#F3F4F6",
                  color: ledgerPeriod === p ? "#fff" : "#9CA3AF",
                }}>{p === "monthly" ? "Mo" : p === "annual" ? "Yr" : "All"}</button>
              ))}
            </div>
          </div>

          {ledgerData.periods.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "#9CA3AF" }}>
              No settlement data yet. Complete a round to see your ledger.
            </div>
          ) : (
            ledgerData.periods.map((period, i) => (
              <div key={i} style={{ marginBottom: i < ledgerData.periods.length - 1 ? 16 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{period.label}</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 15, fontWeight: 800,
                    color: period.amount >= 0 ? "#16A34A" : "#DC2626",
                  }}>
                    {period.amount >= 0 ? "+" : ""}${period.amount.toFixed(0)}
                  </span>
                </div>
                {period.rounds.map((s: any, j: number) => (
                  <div key={j} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, marginBottom: 4,
                    fontSize: 12,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "#1A1A1A" }}>
                        {s.rounds?.course || "Round"}
                      </span>
                      {s.is_manual_adjustment && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>ADJUSTED</span>
                      )}
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                        {format(parseISO(s.created_at), "MMM d, yyyy")}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: MONO, fontWeight: 700, fontSize: 13,
                      color: Number(s.amount) >= 0 ? "#16A34A" : "#DC2626",
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
          background: "#fff", borderRadius: 20, padding: "18px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
            Round History
          </div>
          {rounds.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "#9CA3AF" }}>
              No rounds yet. Start one to see your history!
            </div>
          ) : (
            rounds.slice(0, 20).map((r: any) => (
              <div key={r.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: "1px solid #F3F4F6",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{r.course || "Unknown Course"}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {format(parseISO(r.created_at), "MMM d, yyyy")} · {r.game_type} · {r.round_players?.length || 0} players
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                  background: r.status === "completed" ? "#F0FDF4" : r.status === "active" ? "#FEF3C7" : "#F3F4F6",
                  color: r.status === "completed" ? "#16A34A" : r.status === "active" ? "#92400E" : "#9CA3AF",
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
  border: "1px solid #E5E7EB", background: "#fff",
  fontFamily: "'SF Pro Display', -apple-system, sans-serif",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
