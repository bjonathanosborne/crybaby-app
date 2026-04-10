import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadGroups, createGroup, loadGroup, loadGroupMembers,
  joinGroup, leaveGroup, removeMember, loadGroupLeaderboard,
  findGroupByInviteCode, regenerateInviteCode, loadMyGroups,
  uploadGroupAvatar,
} from "@/lib/db";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { useRef } from "react";

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";
const APP_URL = window.location.origin;

type View = "list" | "create" | "detail" | "join";

export default function GroupsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("list");
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [publicGroups, setPublicGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Join by code
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [foundGroup, setFoundGroup] = useState<any>(null);

  // Detail view
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<Record<string, number>>({});
  const [isMember, setIsMember] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const loadAll = async () => {
    setLoading(true);
    try {
      const [mine, all] = await Promise.all([loadMyGroups(), loadGroups()]);
      setMyGroups(mine || []);
      // Public groups the user hasn't joined
      const myIds = new Set((mine || []).map((g: any) => g.id));
      setPublicGroups((all || []).filter((g: any) => !myIds.has(g.id)));
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const group = await createGroup(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setView("list");
      await loadAll();
      handleOpenGroup(group);
    } catch { /* silent */ }
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
      const memberIds = m.map((mem: any) => mem.user_id);
      if (memberIds.length > 0) {
        const lb = await loadGroupLeaderboard(memberIds);
        setLeaderboard(lb);
      }
    } catch { /* silent */ }
  };

  const handleJoin = async (groupToJoin?: any) => {
    const g = groupToJoin || selectedGroup;
    if (!g) return;
    try {
      await joinGroup(g.id);
      toast({ title: "Joined!", description: `You're now a member of ${g.name}` });
      await handleOpenGroup(g);
      await loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleLeave = async () => {
    if (!selectedGroup) return;
    if (!window.confirm(`Leave "${selectedGroup.name}"?`)) return;
    try {
      await leaveGroup(selectedGroup.id);
      setIsMember(false);
      setMyRole(null);
      toast({ title: "Left group" });
      await loadAll();
      goBack();
    } catch { /* silent */ }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    try {
      await removeMember(selectedGroup.id, userId);
      await handleOpenGroup(selectedGroup);
    } catch { /* silent */ }
  };

  const handleLookupCode = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setFoundGroup(null);
    try {
      const group = await findGroupByInviteCode(joinCode.trim());
      if (group) {
        setFoundGroup(group);
      } else {
        toast({ title: "Not found", description: "No group matches that invite code.", variant: "destructive" });
      }
    } catch { /* silent */ }
    finally { setJoining(false); }
  };

  const getInviteLink = () => `${APP_URL}/join/${selectedGroup?.invite_code}`;

  const handleCopyInvite = async () => {
    if (!selectedGroup) return;
    try {
      await navigator.clipboard.writeText(getInviteLink());
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(selectedGroup.invite_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleShareInvite = async () => {
    if (!selectedGroup) return;
    const link = getInviteLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${selectedGroup.name} on Crybaby`,
          text: `Use code ${selectedGroup.invite_code} or tap the link to join my group!`,
          url: link,
        });
      } catch (e: any) {
        // User cancelled or share failed — ignore AbortError
        if (e.name !== "AbortError") {
          handleCopyInvite();
        }
      }
    } else {
      handleCopyInvite();
    }
  };

  const handleRegenCode = async () => {
    if (!selectedGroup) return;
    try {
      const updated = await regenerateInviteCode(selectedGroup.id);
      setSelectedGroup(updated);
      toast({ title: "Code regenerated" });
    } catch { /* silent */ }
  };

  const goBack = () => {
    setView("list");
    setSelectedGroup(null);
    setMembers([]);
    setLeaderboard({});
    setFoundGroup(null);
    setJoinCode("");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGroup) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadGroupAvatar(selectedGroup.id, file);
      setSelectedGroup((prev: any) => ({ ...prev, avatar_url: url }));
      // Update in lists too
      setMyGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, avatar_url: url } : g));
      setPublicGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, avatar_url: url } : g));
      toast({ title: "Avatar updated!" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24">
      {/* Page header */}
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
          {view === "create" ? "New Group" : view === "detail" ? (selectedGroup?.name || "Group") : view === "join" ? "Join Group" : "Groups"}
        </h1>
        {view === "list" && (
          <div className="flex gap-2">
            <button onClick={() => setView("join")}
              className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors">
              🔗 Join
            </button>
            <button onClick={() => setView("create")}
              className="px-3 py-2 rounded-xl border-none bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity">
              + New
            </button>
          </div>
        )}
        {view !== "list" && (
          <button onClick={goBack}
            className="px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold cursor-pointer hover:border-primary/30 transition-colors">
            ← Back
          </button>
        )}
      </div>

      <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ==================== JOIN BY CODE ==================== */}
        {view === "join" && (
          <>
            <div style={{
              background: "#fff", borderRadius: 20, padding: "24px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1E130A", marginBottom: 12 }}>
                Enter an invite code
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleLookupCode()}
                  placeholder="e.g. ABC123"
                  maxLength={8}
                  style={{
                    flex: 1, padding: "14px 16px", borderRadius: 12,
                    border: "1px solid #E5E7EB", background: "#FAF5EC",
                    fontFamily: MONO, fontSize: 18, fontWeight: 800,
                    textAlign: "center", letterSpacing: "0.15em",
                    outline: "none", textTransform: "uppercase",
                  }}
                />
                <button onClick={handleLookupCode} disabled={joining || !joinCode.trim()} style={{
                  padding: "14px 18px", borderRadius: 12, border: "none",
                  background: joinCode.trim() ? "#2D5016" : "#CEC0AA",
                  color: "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 700,
                  cursor: joinCode.trim() ? "pointer" : "not-allowed",
                }}>
                  {joining ? "..." : "Find"}
                </button>
              </div>
            </div>

            {foundGroup && (
              <div style={{
                background: "#fff", borderRadius: 20, padding: "20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {foundGroup.avatar_url ? (
                    <img src={foundGroup.avatar_url} alt={foundGroup.name}
                      style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover" }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 14, background: "#EEF5E5",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                    }}>🏌️</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1E130A" }}>{foundGroup.name}</div>
                    <div style={{ fontSize: 12, color: "#A8957B" }}>
                      {foundGroup.group_members?.[0]?.count || 0} members · {foundGroup.privacy_level}
                    </div>
                    {foundGroup.description && (
                      <div style={{ fontSize: 12, color: "#8B7355", marginTop: 2 }}>{foundGroup.description}</div>
                    )}
                  </div>
                </div>
                <button onClick={() => handleJoin(foundGroup)} style={{
                  width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: "none",
                  background: "#2D5016", color: "#fff", fontFamily: FONT,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>
                  Join {foundGroup.name}
                </button>
              </div>
            )}
          </>
        )}

        {/* ==================== LIST VIEW ==================== */}
        {view === "list" && (
          <>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#A8957B" }}>Loading...</div>
            ) : (
              <>
                {/* My Groups */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#8B7355", marginBottom: -8 }}>Your Groups</div>
                {myGroups.length === 0 ? (
                  <div style={{
                    background: "#fff", borderRadius: 20, padding: "32px 20px", textAlign: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#8B7355" }}>No groups yet</div>
                    <div style={{ fontSize: 12, color: "#A8957B", marginTop: 4 }}>
                      Create one or join with an invite code
                    </div>
                  </div>
                ) : (
                  myGroups.map((g: any) => (
                    <GroupCard key={g.id} group={g} onClick={() => handleOpenGroup(g)} />
                  ))
                )}

                {/* Public Groups */}
                {publicGroups.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#8B7355", marginTop: 8, marginBottom: -8 }}>Discover</div>
                    {publicGroups.map((g: any) => (
                      <GroupCard key={g.id} group={g} onClick={() => handleOpenGroup(g)} />
                    ))}
                  </>
                )}
              </>
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
                <label style={{ fontSize: 12, fontWeight: 700, color: "#8B7355", display: "block", marginBottom: 6 }}>
                  Group Name *
                </label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Wednesday Crew" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#8B7355", display: "block", marginBottom: 6 }}>
                  Description
                </label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="What's this group about?" rows={3}
                  style={{ ...inputStyle, resize: "none" }} />
              </div>
              <button onClick={handleCreate} disabled={!newName.trim() || creating} style={{
                width: "100%", padding: "14px", borderRadius: 12, border: "none",
                background: newName.trim() ? "#2D5016" : "#CEC0AA",
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
            {/* Group Info */}
            <div style={{
              background: "#fff", borderRadius: 20, padding: "24px 20px", textAlign: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                {selectedGroup.avatar_url ? (
                  <img src={selectedGroup.avatar_url} alt={selectedGroup.name}
                    style={{ width: 64, height: 64, borderRadius: 20, objectFit: "cover", display: "block", margin: "0 auto" }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: 20, background: "#EDE7D9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, margin: "0 auto",
                  }}>🏌️</div>
                )}
                {(myRole === "owner" || myRole === "admin") && (
                  <>
                    <input ref={avatarInputRef} type="file" accept="image/*"
                      onChange={handleAvatarUpload} style={{ display: "none" }} />
                    <button onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      style={{
                        position: "absolute", bottom: -4, right: -4,
                        width: 26, height: 26, borderRadius: 13,
                        background: "#1E130A", border: "2px solid #fff",
                        color: "#fff", fontSize: 12, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: uploadingAvatar ? 0.5 : 1,
                      }}>
                      {uploadingAvatar ? "…" : "📷"}
                    </button>
                  </>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1E130A", marginTop: 12 }}>
                {selectedGroup.name}
              </div>
              {selectedGroup.description && (
                <div style={{ fontSize: 13, color: "#8B7355", marginTop: 6 }}>{selectedGroup.description}</div>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 14 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800 }}>{members.length}</div>
                  <div style={{ fontSize: 11, color: "#A8957B" }}>Members</div>
                </div>
              </div>

              {/* Join/Leave */}
              <div style={{ marginTop: 14 }}>
                {isMember ? (
                  myRole !== "owner" ? (
                    <button onClick={handleLeave} style={{
                      padding: "8px 16px", borderRadius: 8, border: "1px solid #FCA5A5",
                      background: "#FEF2F2", color: "#DC2626", fontFamily: FONT,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>Leave Group</button>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#2D5016", background: "#EEF5E5", padding: "4px 12px", borderRadius: 6 }}>
                      Owner
                    </span>
                  )
                ) : (
                  <button onClick={() => handleJoin()} style={{
                    padding: "10px 20px", borderRadius: 10, border: "none",
                    background: "#2D5016", color: "#fff", fontFamily: FONT,
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>Join Group</button>
                )}
              </div>
            </div>

            {/* Invite Code Card */}
            {isMember && (
              <div style={{
                background: "#fff", borderRadius: 20, padding: "18px 20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  Invite Friends
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "14px 16px", background: "#FAF5EC", borderRadius: 14,
                  border: "1px dashed #D1D5DB",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#A8957B", marginBottom: 4 }}>Invite Code</div>
                    <div style={{
                      fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "#1E130A",
                      letterSpacing: "0.15em",
                    }}>
                      {selectedGroup.invite_code}
                    </div>
                  </div>
                  <button onClick={handleCopyInvite} style={{
                    padding: "10px 14px", borderRadius: 10, border: "none",
                    background: codeCopied ? "#2D5016" : "#1E130A",
                    color: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", transition: "background 0.2s",
                    whiteSpace: "nowrap",
                  }}>
                    {codeCopied ? "✓ Copied!" : "📋 Copy Link"}
                  </button>
                  <button onClick={handleShareInvite} style={{
                    padding: "10px 14px", borderRadius: 10, border: "none",
                    background: "#2563EB",
                    color: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", transition: "background 0.2s",
                    whiteSpace: "nowrap",
                  }}>
                    📤 Share
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#A8957B", marginTop: 8, textAlign: "center" }}>
                  Share this code or link so others can join
                </div>
                {(myRole === "owner" || myRole === "admin") && (
                  <button onClick={handleRegenCode} style={{
                    display: "block", margin: "10px auto 0", padding: "6px 12px",
                    borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff",
                    fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#A8957B",
                    cursor: "pointer",
                  }}>🔄 Regenerate code</button>
                )}
              </div>
            )}

            {/* Leaderboard */}
            <div style={{
              background: "#fff", borderRadius: 20, padding: "18px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                Leaderboard
              </div>
              {members.length === 0 ? (
                <div style={{ textAlign: "center", padding: 16, fontSize: 13, color: "#A8957B" }}>No members yet</div>
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
                          color: i === 0 ? "#F59E0B" : i === 1 ? "#A8957B" : i === 2 ? "#B45309" : "#CEC0AA",
                        }}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </span>
                        <div style={{
                          width: 36, height: 36, borderRadius: 18,
                          background: i === 0 ? "#2D5016" : "#3B82F6",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT,
                        }}>{name[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 1 }}>
                            {m.profile?.handicap != null && (
                              <span style={{ fontFamily: MONO, fontSize: 10, color: "#2D5016", fontWeight: 600 }}>
                                HCP {m.profile.handicap}
                              </span>
                            )}
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                              background: m.role === "owner" ? "#FEF3C7" : m.role === "admin" ? "#EEF2FF" : "#EDE7D9",
                              color: m.role === "owner" ? "#92400E" : m.role === "admin" ? "#4F46E5" : "#A8957B",
                            }}>{m.role}</span>
                          </div>
                        </div>
                        <span style={{
                          fontFamily: MONO, fontSize: 15, fontWeight: 800,
                          color: amount > 0 ? "#2D5016" : amount < 0 ? "#DC2626" : "#A8957B",
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
              <div style={{ fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
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
                      width: 36, height: 36, borderRadius: 18, background: "#8B7355",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT,
                    }}>{name[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1E130A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                        {m.user_id === user?.id && (
                          <span style={{ fontSize: 10, color: "#A8957B", marginLeft: 6 }}>(you)</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#A8957B" }}>
                        Joined {format(parseISO(m.joined_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                        background: m.role === "owner" ? "#FEF3C7" : m.role === "admin" ? "#EEF2FF" : "#EDE7D9",
                        color: m.role === "owner" ? "#92400E" : m.role === "admin" ? "#4F46E5" : "#A8957B",
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

function GroupCard({ group, onClick }: { group: any; onClick: () => void }) {
  const memberCount = group.group_members?.[0]?.count || 0;
  return (
    <div onClick={onClick} style={{
      background: "#fff", borderRadius: 16, padding: "16px 18px", cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #E5E7EB",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {group.avatar_url ? (
          <img src={group.avatar_url} alt={group.name}
            style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover" }} />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: "#EDE7D9",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          }}>🏌️</div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Lato', -apple-system, sans-serif",
            fontSize: 15, fontWeight: 700, color: "#1E130A",
          }}>{group.name}</div>
          <div style={{ fontSize: 12, color: "#A8957B" }}>
            {memberCount} member{memberCount !== 1 ? "s" : ""} · {group.privacy_level}
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#A8957B" }}>→</span>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid #E5E7EB", background: "#fff",
  fontFamily: "'Lato', -apple-system, sans-serif",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
