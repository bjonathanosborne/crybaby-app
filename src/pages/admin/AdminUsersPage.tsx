import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, X } from "lucide-react";

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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { loadProfiles(); }, []);

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
  };

  const deleteUser = async (userId: string, name: string) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    await supabase.from("profiles").delete().eq("user_id", userId);
    setProfiles((prev) => prev.filter((p) => p.user_id !== userId));
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <Badge variant="secondary">{profiles.length} total</Badge>
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
              <TableHead>Joined</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
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
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteUser(p.user_id, p.display_name ?? p.first_name ?? "user")}
                      >
                        <Trash2 size={13} />
                      </Button>
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
    </div>
  );
}
