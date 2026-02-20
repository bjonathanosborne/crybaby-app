import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Round {
  id: string;
  course: string;
  game_type: string;
  status: string;
  stakes: string | null;
  is_broadcast: boolean;
  created_at: string;
  created_by: string;
}

export default function AdminRoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("rounds")
      .select("id, course, game_type, status, stakes, is_broadcast, created_at, created_by")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRounds((data as Round[]) ?? []);
        setLoading(false);
      });
  }, []);

  const statusColor = (s: string) => {
    if (s === "active") return "default";
    if (s === "complete") return "secondary";
    return "outline";
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Rounds</h1>
        <Badge variant="secondary">{rounds.length} total</Badge>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Game Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stakes</TableHead>
              <TableHead>Broadcast</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : rounds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No rounds yet</TableCell>
              </TableRow>
            ) : (
              rounds.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.course || "—"}</TableCell>
                  <TableCell>{r.game_type}</TableCell>
                  <TableCell>
                    <Badge variant={statusColor(r.status)}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.stakes || "—"}</TableCell>
                  <TableCell>{r.is_broadcast ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
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
