import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Layers, Shield, Activity } from "lucide-react";

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
    { label: "Total Users", value: stats.users, icon: Users, color: "text-primary" },
    { label: "Total Rounds", value: stats.rounds, icon: Layers, color: "text-blue-500" },
    { label: "Active Rounds", value: stats.activeRounds, icon: Activity, color: "text-orange-500" },
    { label: "Groups", value: stats.groups, icon: Shield, color: "text-purple-500" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <Icon size={20} className={card.color} />
                <span className="text-sm text-muted-foreground">{card.label}</span>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {loading ? "—" : card.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
