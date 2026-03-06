import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, X, UserPlus, Shield, ShieldOff, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { loadAllUserRoles, assignAdminRole, removeAdminRole, createInvite } from "@/lib/db";

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

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{profiles.length} total</Badge>
          <Button onClick={() => setShowInviteModal(true)} size="sm" className="gap-2">
            <UserPlus size={15} /> Invite User
          </Button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Home Course</TableHead>
              <TableHead>Handicap</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found</TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const isAdmin = adminUserIds.has(p.user_id);
                return (
                  <TableRow key={p.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-accent-foreground overflow-hidden">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (p.first_name?.[0] ?? p.display_name?.[0] ?? "?").toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.display_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{p.display_name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.state || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.home_course || "—"}</TableCell>
                    <TableCell>{p.handicap != null ? p.handicap : "—"}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                          <Shield size={10} /> Admin
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">User</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(p.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)} title="Edit user">
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => toggleAdmin(p.user_id)}
                          disabled={roleLoading === p.user_id}
                          title={isAdmin ? "Remove admin" : "Make admin"}
                        >
                          {isAdmin ? <ShieldOff size={13} className="text-muted-foreground" /> : <Shield size={13} className="text-primary" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteUser(p.user_id, p.display_name ?? p.first_name ?? "user")}
                          title="Delete user"
                        >
                          <Trash2 size={13} />
                        </Button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Edit User</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(null); setEditForm(null); }}>
                <X size={15} />
              </Button>
            </div>
            <div className="space-y-3">
              {(["display_name", "first_name", "last_name", "home_course", "state", "handicap"] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-muted-foreground capitalize mb-1 block">
                    {field.replace(/_/g, " ")}
                  </label>
                  <Input
                    value={editForm[field]}
                    onChange={(e) => setEditForm((f) => f ? { ...f, [field]: e.target.value } : f)}
                    type={field === "handicap" ? "number" : "text"}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => { setEditTarget(null); setEditForm(null); }}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Invite New User</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeInviteModal}>
                <X size={15} />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Generate a unique invite link. Share it with the new user — they'll follow it to create their profile and automatically become your friend.
            </p>

            {!inviteLink ? (
              <Button className="w-full" onClick={handleCreateInvite} disabled={inviteLoading}>
                <UserPlus size={15} className="mr-2" />
                {inviteLoading ? "Generating…" : "Generate Invite Link"}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-accent border border-border">
                  <span className="text-sm text-foreground flex-1 break-all font-mono">{inviteLink}</span>
                </div>
                <Button className="w-full gap-2" onClick={copyLink}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => { setInviteLink(null); setCopied(false); }}>
                  Generate Another
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
