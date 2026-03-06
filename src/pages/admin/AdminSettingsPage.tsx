import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Trash2 } from "lucide-react";

interface AdminUser {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { display_name: string; first_name: string; last_name: string };
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .order("created_at", { ascending: true });

    if (data) {
      // Fetch profiles for each admin
      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]));
      setAdmins(
        data.map((d) => ({
          ...d,
          profile: profileMap.get(d.user_id) as AdminUser["profile"],
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const addAdmin = async () => {
    if (!newUserId.trim()) return;
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: newUserId.trim(), role: "admin" as any });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Admin added" });
      setNewUserId("");
      fetchAdmins();
    }
  };

  const removeAdmin = async (roleId: string, targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast({ title: "Can't remove yourself", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Admin removed" });
      fetchAdmins();
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl md:text-2xl font-bold text-foreground mb-4 md:mb-6">Settings</h1>

      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Admin Users</h2>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Paste user ID to add as admin..."
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            className="font-mono text-sm"
          />
          <Button onClick={addAdmin} size="sm">
            <UserPlus size={16} className="mr-1" />
            Add
          </Button>
        </div>

        <div className="overflow-x-auto">
        <Table className="min-w-[400px]">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-4">Loading...</TableCell>
              </TableRow>
            ) : admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-4">No admins configured</TableCell>
              </TableRow>
            ) : (
              admins.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {a.profile?.first_name && a.profile?.last_name
                          ? `${a.profile.first_name} ${a.profile.last_name}`
                          : a.profile?.display_name ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{a.user_id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge>{a.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(a.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {a.user_id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAdmin(a.id, a.user_id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">App Info</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>Your User ID: <code className="bg-muted px-2 py-1 rounded text-xs font-mono">{user?.id}</code></div>
        </div>
      </div>
    </div>
  );
}
