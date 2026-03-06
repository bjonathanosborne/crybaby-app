import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

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

  const loadRounds = () => {
    supabase
      .from("rounds")
      .select("id, course, game_type, status, stakes, is_broadcast, created_at, created_by")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRounds((data as Round[]) ?? []);
        setLoading(false);
      });
  };

  useEffect(() => { loadRounds(); }, []);

  const statusColor = (s: string) => {
    if (s === "active") return "default";
    if (s === "complete") return "secondary";
    return "outline";
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from("rounds").update({ status }).eq("id", id);
    setRounds((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  };

  const deleteRound = async (id: string, course: string) => {
    if (!window.confirm(`Delete round at "${course || id}"? This cannot be undone.`)) return;
    await supabase.from("rounds").delete().eq("id", id);
    setRounds((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Rounds</h1>
        <Badge variant="secondary">{rounds.length} total</Badge>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
        <Table className="min-w-[580px]">
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Game Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stakes</TableHead>
              <TableHead>Broadcast</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : rounds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No rounds yet</TableCell>
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
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {r.status === "active" && (
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs px-2"
                          onClick={() => setStatus(r.id, "complete")}
                        >
                          Complete
                        </Button>
                      )}
                      {r.status === "complete" && (
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs px-2"
                          onClick={() => setStatus(r.id, "active")}
                        >
                          Reopen
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteRound(r.id, r.course)}
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
    </div>
  );
}
