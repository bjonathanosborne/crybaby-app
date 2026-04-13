import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Trash2 } from "lucide-react";

const font = "'DM Sans', system-ui, sans-serif";

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

  const inputStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
    background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 10,
    padding: "10px 12px", outline: "none", flex: 1, boxSizing: "border-box",
    color: "#1E130A",
  };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 800, fontFamily: font }}>
      <h1 style={{ fontFamily: "'Pacifico', cursive", fontSize: 26, fontWeight: 400, color: "#1E130A", marginBottom: 24 }}>
        Settings
      </h1>

      {/* Admin Users card */}
      <div style={{ background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontFamily: "'Pacifico', cursive", fontSize: 18, fontWeight: 400, color: "#1E130A", marginBottom: 16, marginTop: 0 }}>
          Admin Users
        </h2>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <input
            placeholder="Paste user ID to add as admin…"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && addAdmin()}
          />
          <button
            onClick={addAdmin}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 16px", borderRadius: 10, border: "none",
              background: "#2D5016", color: "#fff",
              fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            <UserPlus size={14} /> Add
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <Table className="min-w-[400px]">
            <TableHeader>
              <TableRow style={{ borderBottom: "1px solid #DDD0BB" }}>
                {["User", "Role", "Added", ""].map((h, i) => (
                  <TableHead key={i} style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.05em", background: "#F0E9D8" }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} style={{ textAlign: "center", color: "#A8957B", padding: "24px", fontFamily: font }}>Loading…</TableCell>
                </TableRow>
              ) : admins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} style={{ textAlign: "center", color: "#A8957B", padding: "24px", fontFamily: font }}>No admins configured</TableCell>
                </TableRow>
              ) : (
                admins.map((a) => (
                  <TableRow key={a.id} style={{ borderBottom: "1px solid #EDE7D9" }}>
                    <TableCell>
                      <div>
                        <div style={{ fontWeight: 600, color: "#1E130A", fontSize: 14 }}>
                          {a.profile?.first_name && a.profile?.last_name
                            ? `${a.profile.first_name} ${a.profile.last_name}`
                            : a.profile?.display_name ?? "Unknown"}
                        </div>
                        <div style={{ fontSize: 11, color: "#A8957B", fontFamily: "'JetBrains Mono', monospace" }}>{a.user_id}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: "#2D501612", color: "#2D5016", border: "1px solid #2D501630",
                        textTransform: "capitalize",
                      }}>{a.role}</span>
                    </TableCell>
                    <TableCell style={{ fontSize: 12, color: "#A8957B" }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {a.user_id !== user?.id && (
                        <button
                          onClick={() => removeAdmin(a.id, a.user_id)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#C0392B" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* App Info card */}
      <div style={{ background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontFamily: "'Pacifico', cursive", fontSize: 18, fontWeight: 400, color: "#1E130A", marginBottom: 10, marginTop: 0 }}>
          App Info
        </h2>
        <div style={{ fontSize: 13, color: "#8B7355" }}>
          Your User ID:{" "}
          <code style={{ background: "#EDE7D9", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#1E130A" }}>
            {user?.id}
          </code>
        </div>
      </div>
    </div>
  );
}
