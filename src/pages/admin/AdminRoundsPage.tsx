import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";

const font = "'DM Sans', system-ui, sans-serif";

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

  const statusStyle = (s: string): React.CSSProperties => {
    if (s === "active") return { background: "#2D501612", color: "#2D5016", border: "1px solid #2D501630" };
    if (s === "complete") return { background: "#EDE7D9", color: "#8B7355", border: "1px solid #DDD0BB" };
    return { background: "#F5EFE0", color: "#A8957B", border: "1px solid #DDD0BB" };
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
    <div style={{ padding: "24px 20px", maxWidth: 1100, fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Pacifico', cursive", fontSize: 26, fontWeight: 400, color: "#1E130A", margin: 0 }}>
          Rounds
        </h1>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "#8B7355",
          background: "#EDE7D9", borderRadius: 8, padding: "4px 10px",
        }}>{rounds.length} total</span>
      </div>

      <div style={{ background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 16, overflow: "hidden", overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <Table className="min-w-[580px]">
          <TableHeader>
            <TableRow style={{ borderBottom: "1px solid #DDD0BB" }}>
              {["Course", "Game Type", "Status", "Stakes", "Broadcast", "Created", "Actions"].map(h => (
                <TableHead key={h} style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: "#8B7355", textTransform: "uppercase", letterSpacing: "0.05em", background: "#F0E9D8" }}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} style={{ textAlign: "center", color: "#A8957B", padding: "32px", fontFamily: font }}>Loading…</TableCell>
              </TableRow>
            ) : rounds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} style={{ textAlign: "center", color: "#A8957B", padding: "32px", fontFamily: font }}>No rounds yet</TableCell>
              </TableRow>
            ) : (
              rounds.map((r) => (
                <TableRow key={r.id} style={{ borderBottom: "1px solid #EDE7D9" }}>
                  <TableCell style={{ fontWeight: 600, color: "#1E130A", fontSize: 14 }}>{r.course || "—"}</TableCell>
                  <TableCell style={{ fontSize: 13, color: "#8B7355" }}>{r.game_type}</TableCell>
                  <TableCell>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      textTransform: "capitalize", ...statusStyle(r.status),
                    }}>{r.status}</span>
                  </TableCell>
                  <TableCell style={{ fontSize: 13, color: "#8B7355" }}>{r.stakes || "—"}</TableCell>
                  <TableCell style={{ fontSize: 13, color: r.is_broadcast ? "#2D5016" : "#A8957B" }}>{r.is_broadcast ? "Yes" : "No"}</TableCell>
                  <TableCell style={{ fontSize: 12, color: "#A8957B" }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {r.status === "active" && (
                        <button
                          onClick={() => setStatus(r.id, "complete")}
                          style={{
                            padding: "4px 10px", borderRadius: 8,
                            border: "1px solid #DDD0BB", background: "#EDE7D9",
                            color: "#8B7355", fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}
                        >Complete</button>
                      )}
                      {r.status === "complete" && (
                        <button
                          onClick={() => setStatus(r.id, "active")}
                          style={{
                            padding: "4px 10px", borderRadius: 8,
                            border: "1px solid #2D501630", background: "#2D501612",
                            color: "#2D5016", fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}
                        >Reopen</button>
                      )}
                      <button
                        onClick={() => deleteRound(r.id, r.course)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, color: "#C0392B" }}
                      >
                        <Trash2 size={13} />
                      </button>
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
