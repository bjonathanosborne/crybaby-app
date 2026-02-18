import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadGroups, createGroup, loadGroup, loadGroupMembers,
  joinGroup, leaveGroup, removeMember, loadGroupLeaderboard,
  searchProfiles, loadSettlements,
} from "@/lib/db";
import { format, parseISO } from "date-fns";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

type View = "list" | "create" | "detail";

export default function GroupsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("list");
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail view
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<Record<string, number>>({});
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);

  const loadAllGroups = async () => {
    setLoading(true);
    try {
      const data = await loadGroups();
      setGroups(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAllGroups(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const group = await createGroup(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setView("list");
      await loadAllGroups();
      // Auto-open the new group
      handleOpenGroup(group);
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const handleOpenGroup = async (group: any) => {
    setSelectedGroup(group);
    setView("detail");
    try {
      const m = await loadGroupMembers(group.id);
      setMembers(m);
      const me = m.find((mem: any) => mem.user_id === user?.id);
      setIsMember(!!me);
      setMyRole(me?.role || null);

      // Load leaderboard
      const memberIds = m.map((mem: any) => mem.user_id);
      if (memberIds.length > 0) {
        const lb = await loadGroupLeaderboard(memberIds);
        setLeaderboard(lb);
      }
    } catch (e) { console.error(e); }
  };

  const handleJoin = async () => {
    if (!selectedGroup) return;
    try {
      await joinGroup(selectedGroup.id);
      await handleOpenGroup(selectedGroup);
    } catch (e) { console.error(e); }
  };

  const handleLeave = async () => {
    if (!selectedGroup) return;
    try {
      await leaveGroup(selectedGroup.id);
      setIsMember(false);
      setMyRole(null);
      await handleOpenGroup(selectedGroup);
    } catch (e) { console.error(e); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await removeMember(selectedGroup.id, userId);
      await handleOpenGroup(selectedGroup);
    } catch (e) { console.error(e); }
  };

  const goBack = () => {
    setView("list");
    setSelectedGroup(null);
    setMembers([]);
    setLeaderboard({});
    loadAllGroups();
  };

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F7F7F5", fontFamily: FONT, paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{
        padding: "52px 20px 16px", background: "#fff",
        borderBottom: "1px solid #E5E7EB",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>
            {view === "create" ? "New Group" : view === "detail" ? (selectedGroup?.name || "Group") : "Groups"}
          </span>
          {view === "list" && (
            <button onClick={() => setView("create")} style={{
              padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 12, fontWeight: 700,
              background: "#1A1A1A", color: "#fff",
            }}>+ New Group</button>
          )}
          {(view === "create" || view === "detail") && (
            <button onClick={goBack} style={{
              padding: "8px 14px", borderRadius: 10, border: "1px solid #E5E7EB",
              background: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 600,
              color: "#6B7280", cursor: "pointer",
            }}>← Back</button>
          )}
        </div>
      </div>

      <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ==================== LIST VIEW ==================== */}
        {view === "list" && (
          <>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>Loading...</div>
            ) : groups.length === 0 ? (
              <div style={{
                background: "#fff", borderRadius: 20, padding: "40px 20px", textAlign: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#6B7280" }}>No groups yet</div>
                <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
                  Create a group and invite your golf buddies
                </div>
              </div>
            ) : (
              groups.map((g: any) => {
                const memberCount = g.group_members?.[0]?.count || 0;
                return (
                  <div key={g.id} onClick={() => handleOpenGroup(g)} style={{
                    background: "#fff", borderRadius: 16, padding: "16px 18px", cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #E5E7EB",
                    transition: "transform 0.1s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 14, background: "#F3F4F6",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 24,
                      }}>🏌️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                          {memberCount} member{memberCount !== 1 ? "s" : ""} · {g.privacy_level}
                        </div>
                        {g.description && (
                          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{g.description}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>→</span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ==================== CREATE VIEW ==================== */}
        {view === "create" && (
          <div style={{
            background: "#fff", borderRadius: 20, padding: "24px 20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>
                  Group Name *
                </label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Wednesday Crew" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>
                  Description
                </label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="What's this group about?" rows={3}
                  style={{ ...inputStyle, resize: "none" }} />
              </div>
              <button onClick={handleCreate} disabled={!newName.trim() || creating} style={{
                width: "100%", padding: "14px", borderRadius: 12, border: "none",
                background: newName.trim() ? "#16A34A" : "#D1D5DB",
                color: "#fff", fontFamily: FONT, fontSize: 15, fontWeight: 700,
                cursor: newName.trim() ? "pointer" : "not-allowed",
                opacity: creating ? 0.6 : 1,
              }}>
                {creating ? "Creating..." : "Create Group"}
              </button>
            </div>
          </div>
        )}

        {/* ==================== DETAIL VIEW ==================== */}
        {view === "detail" && selectedGroup && (
          <>
            {/* Group Info Card */}
            <div style={{
              background: "#fff", borderRadius: 20, padding: "24px 20px", textAlign: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 20, background: "#F3F4F6",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, margin: "0 auto",
              }}>🏌️</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", marginTop: 12 }}>
                {selectedGroup.name}
              </div>
              {selectedGroup.description && (
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>{selectedGroup.description}</div>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>
                    {members.length}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>Members</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#1A1A1A" }}>
                    {selectedGroup.privacy_level}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>Privacy</div>
                </div>
              </div>

              {/* Join/Leave */}
              <div style={{ marginTop: 16 }}>
                {isMember ? (
                  myRole !== "owner" ? (
                    <button onClick={handleLeave} style={{
                      padding: "10px 20px", borderRadius: 10, border: "1px solid #E5E7EB",
                      background: "#fff", color: "#DC2626", fontFamily: FONT,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>Leave Group</button>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "4px 12px", borderRadius: 6 }}>
                      Owner
                    </span>
                  )
                ) : (
                  <button onClick={handleJoin} style={{
                    padding: "10px 20px", borderRadius: 10, border: "none",
                    background: "#16A34A", color: "#fff", fontFamily: FONT,
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>Join Group</button>
                )}
              </div>
            </div>

            {/* Leaderboard */}
            <div style={{
              background: "#fff", borderRadius: 20, padding: "18px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                Leaderboard
              </div>
              {members.length === 0 ? (
                <div style={{ textAlign: "center", padding: 16, fontSize: 13, color: "#9CA3AF" }}>
                  No members yet
                </div>
              ) : (
                [...members]
                  .sort((a, b) => (leaderboard[b.user_id] || 0) - (leaderboard[a.user_id] || 0))
                  .map((m: any, i: number) => {
                    const amount = leaderboard[m.user_id] || 0;
                    const name = m.profile?.display_name || "Unknown";
                    return (
                      <div key={m.id} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 0",
                        borderBottom: i < members.length - 1 ? "1px solid #F3F4F6" : "none",
                      }}>
                        <span style={{
                          fontFamily: MONO, fontSize: 14, fontWeight: 800, width: 24, textAlign: "center",
                          color: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#B45309" : "#D1D5DB",
                        }}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </span>
                        <div style={{
                          width: 36, height: 36, borderRadius: 18,
                          background: i === 0 ? "#16A34A" : "#3B82F6",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT,
                        }}>{name[0].toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{name}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 1 }}>
                            {m.profile?.handicap != null && (
                              <span style={{ fontFamily: MONO, fontSize: 10, color: "#16A34A", fontWeight: 600 }}>
                                HCP {m.profile.handicap}
                              </span>
                            )}
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                              background: m.role === "owner" ? "#FEF3C7" : m.role === "admin" ? "#EEF2FF" : "#F3F4F6",
                              color: m.role === "owner" ? "#92400E" : m.role === "admin" ? "#4F46E5" : "#9CA3AF",
                            }}>{m.role}</span>
                          </div>
                        </div>
                        <span style={{
                          fontFamily: MONO, fontSize: 15, fontWeight: 800,
                          color: amount > 0 ? "#16A34A" : amount < 0 ? "#DC2626" : "#9CA3AF",
                        }}>
                          {amount >= 0 ? "+" : ""}${amount.toFixed(0)}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Members List */}
            <div style={{
              background: "#fff", borderRadius: 20, padding: "18px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                Members ({members.length})
              </div>
              {members.map((m: any, i: number) => {
                const name = m.profile?.display_name || "Unknown";
                const isOwnerOrAdmin = myRole === "owner" || myRole === "admin";
                const canRemove = isOwnerOrAdmin && m.user_id !== user?.id && m.role !== "owner";
                return (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0",
                    borderBottom: i < members.length - 1 ? "1px solid #F3F4F6" : "none",
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 18, background: "#6B7280",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT,
                    }}>{name[0].toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                        {name}
                        {m.user_id === user?.id && (
                          <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>(you)</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                        Joined {format(parseISO(m.joined_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                        background: m.role === "owner" ? "#FEF3C7" : m.role === "admin" ? "#EEF2FF" : "#F3F4F6",
                        color: m.role === "owner" ? "#92400E" : m.role === "admin" ? "#4F46E5" : "#9CA3AF",
                        textTransform: "uppercase",
                      }}>{m.role}</span>
                      {canRemove && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.user_id); }} style={{
                          padding: "4px 8px", borderRadius: 6, border: "1px solid #FCA5A5",
                          background: "#FEF2F2", color: "#DC2626", fontFamily: FONT,
                          fontSize: 10, fontWeight: 600, cursor: "pointer",
                        }}>Remove</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid #E5E7EB", background: "#fff",
  fontFamily: "'SF Pro Display', -apple-system, sans-serif",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
