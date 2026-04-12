import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, X, UserPlus, Shield, ShieldOff, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadAllUserRoles, assignAdminRole, removeAdminRole, createInvite } from "@/lib/db";

const font = "'DM Sans', system-ui, sans-serif";

interface Profile {
  user_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  handicap: number | null;
  home_course: string | null;
  state: string;
  avatar_url: string | null;
  created_at: string;
}

interface EditForm {
  display_name: string;
  first_name: string;
  last_name: string;
  home_course: string;
  state: string;
  handicap: string;
}

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadProfiles = () => {
    supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, handicap, home_course, state, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setProfiles((data as Profile[]) ?? []);
        setLoading(false);
      });
  };

  const loadRoles = async () => {
    try {
      const roles = await loadAllUserRoles();
      setAdminUserIds(new Set(roles.filter(r => r.role === "admin").map(r => r.user_id)));
    } catch (e) {
      console.error("Failed to load roles:", e);
    }
  };

  useEffect(() => {
    loadProfiles();
    loadRoles();
  }, []);

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.display_name?.toLowerCase().includes(q) ||
      p.first_name?.toLowerCase().includes(q) ||
      p.last_name?.toLowerCase().includes(q) ||
      p.home_course?.toLowerCase().includes(q) ||
      p.state?.toLowerCase().includes(q)
    );
  });

  const openEdit = (p: Profile) => {
    setEditTarget(p);
    setEditForm({
      display_name: p.display_name ?? "",
      first_name: p.first_name ?? "",
      last_name: p.last_name ?? "",
      home_course: p.home_course ?? "",
      state: p.state ?? "",
      handicap: p.handicap != null ? String(p.handicap) : "",
    });
  };

  const saveEdit = async () => {
    if (!editTarget || !editForm) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      display_name: editForm.display_name.trim() || editTarget.display_name,
      first_name: editForm.first_name.trim() || null,
      last_name: editForm.last_name.trim() || null,
      home_course: editForm.home_course.trim() || null,
      state: editForm.state.trim() || null,
      handicap: editForm.handicap !== "" ? parseFloat(editForm.handicap) : null,
    };
    await supabase.from("profiles").update(updates).eq("user_id", editTarget.user_id);
    setSaving(false);
    setEditTarget(null);
    setEditForm(null);
    loadProfiles();
    toast({ title: "User updated" });
  };

  const deleteUser = async (userId: string, name: string) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await supabase.from("profiles").delete().eq("user_id", userId);
    setProfiles((prev) => prev.filter((p) => p.user_id !== userId));
    toast({ title: "User deleted" });
  };

  const toggleAdmin = async (userId: string) => {
    setRoleLoading(userId);
    try {
      if (adminUserIds.has(userId)) {
        await removeAdminRole(userId);
        setAdminUserIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
        toast({ title: "Admin role removed" });
      } else {
        await assignAdminRole(userId);
        setAdminUserIds(prev => new Set([...prev, userId]));
        toast({ title: "Admin role granted ✓" });
      }
    } catch (e: any) {
      toast({ title: "Failed to update role", description: e.message, variant: "destructive" });
    } finally {
      setRoleLoading(null);
    }
  };

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    try {
      const token = await createInvite();
      setInviteLink(`${window.location.origin}/invite/${token}`);
    } catch (e: any) {
      toast({ title: "Failed to create invite", description: e.message, variant: "destructive" });
    } finally {
      setInviteLoading(false);
    }
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Invite link copied!" });
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteLink(null);
    setCopied(false);
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: font, fontSize: 14,
    background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 10,
    padding: "10px 12px", outline: "none", width: "100%", boxSizing: "border-box",
    color: "#1E130A",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Pacifico', cursive", fontSize: 26, fontWeight: 400, color: "#1E130A", margin: 0 }}>
          Users
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, color: "#8B7355",
            background: "#EDE7D9", borderRadius: 8, padding: "4px 10px",
          }}>{profiles.length} total</span>
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10, border: "none",
              background: "#2D5016", color: "#fff",
              fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <UserPlus size={14} /> Invite User
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#A8957B" }} />
        <input
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, paddingLeft: 36 }}
        />
      </div>

      {/* Table */}
      <div style={{ background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 16, overflow: "hidden", overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid #DDD0BB" }}>
              {["User", "Location", "Home Course", "Handicap", "Role", "Joined", "Actions"].map(h => (
                <TableHead key={h} style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.05em", background: "#F0E9D8" }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} style={{ textAlign: "center", color: "#A8957B", padding: "32px", fontFamily: font }}>Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} style={{ textAlign: "center", color: "#A8957B", padding: "32px", fontFamily: font }}>No users found</TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const isAdmin = adminUserIds.has(p.user_id);
                return (
                  <TableRow key={p.user_id} style={{ borderBottom: "1px solid #EDE7D9" }}>
                    <TableCell>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 16,
                          background: "#DDD0BB", overflow: "hidden",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, color: "#8B7355",
                        }}>
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            (p.first_name?.[0] ?? p.display_name?.[0] ?? "?").toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "#1E130A", fontSize: 14 }}>
                            {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.display_name}
                          </div>
                          <div style={{ fontSize: 11, color: "#A8957B" }}>{p.display_name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={{ color: "#8B7355", fontSize: 13 }}>{p.state || "—"}</TableCell>
                    <TableCell style={{ color: "#8B7355", fontSize: 13 }}>{p.home_course || "—"}</TableCell>
                    <TableCell style={{ fontSize: 13, color: "#1E130A" }}>{p.handicap != null ? p.handicap : "—"}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                          background: "#2D501610", color: "#2D5016", border: "1px solid #2D501630",
                        }}>
                          <Shield size={9} /> Admin
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#A8957B" }}>User</span>
                      )}
                    </TableCell>
                    <TableCell style={{ fontSize: 12, color: "#A8957B" }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          onClick={() => openEdit(p)}
                          title="Edit user"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#8B7355" }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleAdmin(p.user_id)}
                          disabled={roleLoading === p.user_id}
                          title={isAdmin ? "Remove admin" : "Make admin"}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: isAdmin ? "#A8957B" : "#2D5016" }}
                        >
                          {isAdmin ? <ShieldOff size={13} /> : <Shield size={13} />}
                        </button>
                        <button
                          onClick={() => deleteUser(p.user_id, p.display_name ?? p.first_name ?? "user")}
                          title="Delete user"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#C0392B" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Modal */}
      {editTarget && editForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "#FAF5EC", borderRadius: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", width: "100%", maxWidth: 420, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Pacifico', cursive", fontSize: 20, fontWeight: 400, color: "#1E130A", margin: 0 }}>Edit User</h2>
              <button onClick={() => { setEditTarget(null); setEditForm(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#A8957B", padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(["display_name", "first_name", "last_name", "home_course", "state", "handicap"] as const).map((field) => (
                <div key={field}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "capitalize", display: "block", marginBottom: 4 }}>
                    {field.replace(/_/g, " ")}
                  </label>
                  <input
                    value={editForm[field]}
                    onChange={(e) => setEditForm((f) => f ? { ...f, [field]: e.target.value } : f)}
                    type={field === "handicap" ? "number" : "text"}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => { setEditTarget(null); setEditForm(null); }}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #DDD0BB", background: "#EDE7D9", color: "#8B7355", fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >Cancel</button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#2D5016", color: "#fff", fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "#FAF5EC", borderRadius: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", width: "100%", maxWidth: 420, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Pacifico', cursive", fontSize: 20, fontWeight: 400, color: "#1E130A", margin: 0 }}>Invite New User</h2>
              <button onClick={closeInviteModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#A8957B", padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: "#8B7355", marginBottom: 20, lineHeight: 1.5 }}>
              Generate a unique invite link. Share it with the new user — they'll follow it to create their profile and automatically become your friend.
            </p>
            {!inviteLink ? (
              <button
                onClick={handleCreateInvite}
                disabled={inviteLoading}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px", borderRadius: 12, border: "none",
                  background: "#2D5016", color: "#fff",
                  fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  opacity: inviteLoading ? 0.6 : 1,
                }}
              >
                <UserPlus size={15} />
                {inviteLoading ? "Generating…" : "Generate Invite Link"}
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 12, background: "#EDE7D9", border: "1px solid #DDD0BB" }}>
                  <span style={{ fontSize: 12, color: "#1E130A", flex: 1, wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>{inviteLink}</span>
                </div>
                <button
                  onClick={copyLink}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "12px", borderRadius: 12, border: "none",
                    background: "#2D5016", color: "#fff",
                    fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>
                <button
                  onClick={() => { setInviteLink(null); setCopied(false); }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12,
                    border: "1px solid #DDD0BB", background: "#EDE7D9",
                    color: "#8B7355", fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >Generate Another</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
