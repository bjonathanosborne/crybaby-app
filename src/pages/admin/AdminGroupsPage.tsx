import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, X } from "lucide-react";

const font = "'DM Sans', system-ui, sans-serif";

interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy_level: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
}

interface EditForm {
  name: string;
  description: string;
  privacy_level: string;
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const loadGroups = async () => {
    const { data: groupData } = await supabase
      .from("groups")
      .select("id, name, description, privacy_level, invite_code, created_at")
      .order("created_at", { ascending: false });

    if (groupData) {
      const counts = await Promise.all(
        groupData.map((g) =>
          supabase
            .from("group_members")
            .select("id", { count: "exact", head: true })
            .eq("group_id", g.id)
        )
      );
      setGroups(groupData.map((g, i) => ({ ...g, member_count: counts[i].count ?? 0 })));
    }
    setLoading(false);
  };

  useEffect(() => { loadGroups(); }, []);

  const openEdit = (g: Group) => {
    setEditTarget(g);
    setEditForm({ name: g.name, description: g.description ?? "", privacy_level: g.privacy_level });
  };

  const saveEdit = async () => {
    if (!editTarget || !editForm) return;
    setSaving(true);
    await supabase.from("groups").update({
      name: editForm.name.trim() || editTarget.name,
      description: editForm.description.trim() || null,
      privacy_level: editForm.privacy_level,
    }).eq("id", editTarget.id);
    setSaving(false);
    setEditTarget(null);
    setEditForm(null);
    loadGroups();
  };

  const deleteGroup = async (id: string, name: string) => {
    if (!window.confirm(`Delete group "${name}"? This cannot be undone.`)) return;
    await supabase.from("groups").delete().eq("id", id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const privacyStyle = (level: string): React.CSSProperties => {
    if (level === "public") return { background: "#2D501612", color: "#2D5016", border: "1px solid #2D501630" };
    return { background: "#EDE7D9", color: "#8B7355", border: "1px solid #DDD0BB" };
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: font, fontSize: 14,
    background: "#F5EFE0", border: "1px solid #DDD0BB", borderRadius: 10,
    padding: "10px 12px", outline: "none", width: "100%", boxSizing: "border-box",
    color: "#1E130A",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1000, fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Pacifico', cursive", fontSize: 26, fontWeight: 400, color: "#1E130A", margin: 0 }}>
          Groups
        </h1>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "#8B7355",
          background: "#EDE7D9", borderRadius: 8, padding: "4px 10px",
        }}>{groups.length} total</span>
      </div>

      <div style={{ background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 16, overflow: "hidden", overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid #DDD0BB" }}>
              {["Name", "Members", "Privacy", "Invite Code", "Created", "Actions"].map(h => (
                <TableHead key={h} style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.05em", background: "#F0E9D8" }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: "center", color: "#A8957B", padding: "32px", fontFamily: font }}>Loading…</TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} style={{ textAlign: "center", color: "#A8957B", padding: "32px", fontFamily: font }}>No groups yet</TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id} style={{ borderBottom: "1px solid #EDE7D9" }}>
                  <TableCell>
                    <div>
                      <div style={{ fontWeight: 600, color: "#1E130A", fontSize: 14 }}>{g.name}</div>
                      {g.description && (
                        <div style={{ fontSize: 11, color: "#A8957B", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.description}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell style={{ fontSize: 14, color: "#1E130A", fontWeight: 600 }}>{g.member_count}</TableCell>
                  <TableCell>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      textTransform: "capitalize", ...privacyStyle(g.privacy_level),
                    }}>{g.privacy_level}</span>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#8B7355" }}>{g.invite_code}</span>
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "#A8957B" }}>
                    {new Date(g.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        onClick={() => openEdit(g)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#8B7355" }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => deleteGroup(g.id, g.name)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#C0392B" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Modal */}
      {editTarget && editForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "#FAF5EC", borderRadius: 20, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", width: "100%", maxWidth: 420, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Pacifico', cursive", fontSize: 20, fontWeight: 400, color: "#1E130A", margin: 0 }}>Edit Group</h2>
              <button onClick={() => { setEditTarget(null); setEditForm(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#A8957B", padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", display: "block", marginBottom: 4 }}>Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", display: "block", marginBottom: 4 }}>Description</label>
                <input value={editForm.description} onChange={(e) => setEditForm((f) => f ? { ...f, description: e.target.value } : f)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", display: "block", marginBottom: 4 }}>Privacy</label>
                <select
                  value={editForm.privacy_level}
                  onChange={(e) => setEditForm((f) => f ? { ...f, privacy_level: e.target.value } : f)}
                  style={{ ...inputStyle, appearance: "none" as any, cursor: "pointer" }}
                >
                  <option value="public">public</option>
                  <option value="private">private</option>
                  <option value="invite_only">invite_only</option>
                </select>
              </div>
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
    </div>
  );
}
