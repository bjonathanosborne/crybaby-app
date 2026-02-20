import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy_level: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data: groupData } = await supabase
        .from("groups")
        .select("id, name, description, privacy_level, invite_code, created_at")
        .order("created_at", { ascending: false });

      if (groupData) {
        // Get member counts
        const counts = await Promise.all(
          groupData.map((g) =>
            supabase
              .from("group_members")
              .select("id", { count: "exact", head: true })
              .eq("group_id", g.id)
          )
        );
        setGroups(
          groupData.map((g, i) => ({ ...g, member_count: counts[i].count ?? 0 }))
        );
      }
      setLoading(false);
    }
    fetch();
  }, []);

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No groups yet</TableCell>
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
