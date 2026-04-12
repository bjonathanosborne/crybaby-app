import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Layers, Shield, Activity } from "lucide-react";

const font = "'DM Sans', system-ui, sans-serif";

interface Stats {
  users: number;
  rounds: number;
  groups: number;
  activeRounds: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ users: 0, rounds: 0, groups: 0, activeRounds: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [usersRes, roundsRes, groupsRes, activeRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("rounds").select("id", { count: "exact", head: true }),
        supabase.from("groups").select("id", { count: "exact", head: true }),
        supabase.from("rounds").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      setStats({
        users: usersRes.count ?? 0,
        rounds: roundsRes.count ?? 0,
        groups: groupsRes.count ?? 0,
        activeRounds: activeRes.count ?? 0,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  const cards = [
    { label: "Total Users", value: stats.users, icon: Users, accent: "#2D5016", bg: "#2D501610" },
    { label: "Total Rounds", value: stats.rounds, icon: Layers, accent: "#1D6DA6", bg: "#1D6DA610" },
    { label: "Active Rounds", value: stats.activeRounds, icon: Activity, accent: "#C05C1A", bg: "#C05C1A10" },
    { label: "Groups", value: stats.groups, icon: Shield, accent: "#6B4FAA", bg: "#6B4FAA10" },
  ];

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, fontFamily: font }}>
      <h1 style={{
        fontFamily: "'Pacifico', cursive",
        fontSize: 26, fontWeight: 400,
        color: "#1E130A", marginBottom: 24,
        letterSpacing: "-0.01em",
      }}>Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 32 }}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{
              background: "#FAF5EC",
              border: "1px solid #DDD0BB",
              borderRadius: 16,
              padding: "20px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: card.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={17} color={card.accent} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#8B7355", letterSpacing: "0.01em" }}>
                  {card.label}
                </span>
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: "#1E130A", fontFamily: "'JetBrains Mono', monospace" }}>
                {loading ? "—" : card.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
