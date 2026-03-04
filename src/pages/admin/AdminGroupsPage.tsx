import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, X } from "lucide-react";

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

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Groups</h1>
        <Badge variant="secondary">{groups.length} total</Badge>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Privacy</TableHead>
              <TableHead>Invite Code</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No groups yet</TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{g.name}</div>
                      {g.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{g.description}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{g.member_count}</TableCell>
                  <TableCell>
                    <Badge variant={g.privacy_level === "public" ? "secondary" : "outline"}>{g.privacy_level}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{g.invite_code}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(g.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteGroup(g.id, g.name)}
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
              <h2 className="text-lg font-bold">Edit Group</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditTarget(null); setEditForm(null); }}>
                <X size={15} />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <Input value={editForm.description} onChange={(e) => setEditForm((f) => f ? { ...f, description: e.target.value } : f)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Privacy</label>
                <select
                  value={editForm.privacy_level}
                  onChange={(e) => setEditForm((f) => f ? { ...f, privacy_level: e.target.value } : f)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="public">public</option>
                  <option value="private">private</option>
                  <option value="invite_only">invite_only</option>
                </select>
              </div>
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
