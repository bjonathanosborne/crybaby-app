import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadProfile, loadMyRounds, loadSettlements, loadUserStats } from "@/lib/db";
import { format, parseISO, subMonths } from "date-fns";
import { Loader2, BarChart3 } from "lucide-react";
import { EagleIcon, BirdieIcon, ParFlagIcon, BogeyIcon } from "@/components/icons/CrybIcons";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart,
} from "recharts";

export default function StatsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [serverStats, setServerStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([
      loadProfile(),
      loadMyRounds(200),
      loadSettlements(),
      loadUserStats(),
    ]).then(([p, r, s, ss]) => {
      setProfile(p);
      setRounds(r || []);
      setSettlements(s || []);
      setServerStats(ss);
    }).finally(() => setLoading(false));
  }, [user]);

  const completed = useMemo(() =>
    rounds.filter(r => r.status === "completed").sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ), [rounds]);

  // ── Scoring data from round_players ──
  const scoringData = useMemo(() => {
    return completed.map(r => {
      const myPlayer = (r.round_players || []).find(
        (p: any) => p.user_id === user?.id
      );
      const totalScore = myPlayer?.total_score || 0;
      // hole_scores can be an array [4,5,3,...] or an object {"1":4,"2":5,...}
      const rawHS = myPlayer?.hole_scores;
      const holeScores: number[] = Array.isArray(rawHS)
        ? rawHS
        : rawHS && typeof rawHS === "object"
          ? Object.keys(rawHS).sort((a, b) => Number(a) - Number(b)).map(k => rawHS[k])
          : [];
      const holesPlayed = holeScores.filter((s: number) => s > 0).length;
      const pars = (r.course_details as any)?.pars || [];
      const totalPar = pars.slice(0, holesPlayed).reduce((sum: number, p: number) => sum + (p || 0), 0);
      const scoreToPar = holesPlayed > 0 ? totalScore - totalPar : null;
      return {
        date: format(parseISO(r.created_at), "MMM d"),
        fullDate: format(parseISO(r.created_at), "MMM d, yyyy"),
        course: r.course,
        totalScore,
        holesPlayed,
        scoreToPar,
        avgPerHole: holesPlayed > 0 ? +(totalScore / holesPlayed).toFixed(1) : null,
      };
    }).filter(d => d.holesPlayed > 0);
  }, [completed, user]);

  // ── P&L over time ──
  const plData = useMemo(() => {
    let cumulative = 0;
    return settlements
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(s => {
        cumulative += Number(s.amount);
        return {
          date: format(parseISO(s.created_at), "MMM d"),
          fullDate: format(parseISO(s.created_at), "MMM d, yyyy"),
          amount: Number(s.amount),
          cumulative: +cumulative.toFixed(0),
          course: (s as any).rounds?.course || "Round",
        };
      });
  }, [settlements]);

  // ── Monthly P&L for bar chart ──
  const monthlyPL = useMemo(() => {
    const map: Record<string, number> = {};
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const month = format(subMonths(new Date(), i), "yyyy-MM");
      map[month] = 0;
    }
    settlements.forEach(s => {
      const month = format(parseISO(s.created_at), "yyyy-MM");
      if (map[month] !== undefined) map[month] += Number(s.amount);
    });
    return Object.entries(map).map(([k, v]) => ({
      month: format(parseISO(k + "-01"), "MMM"),
      amount: +v.toFixed(0),
    }));
  }, [settlements]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    const totalPL = settlements.reduce((s, r) => s + Number(r.amount), 0);
    const wins = settlements.filter(s => Number(s.amount) > 0).length;
    const losses = settlements.filter(s => Number(s.amount) < 0).length;
    const avgScore = scoringData.length
      ? +(scoringData.reduce((s, d) => s + d.totalScore, 0) / scoringData.length).toFixed(1)
      : null;
    const avgToPar = scoringData.filter(d => d.scoreToPar !== null).length
      ? +(scoringData.filter(d => d.scoreToPar !== null).reduce((s, d) => s + d.scoreToPar!, 0) / scoringData.filter(d => d.scoreToPar !== null).length).toFixed(1)
      : null;
    const bestScore = scoringData.length
      ? Math.min(...scoringData.map(d => d.totalScore))
      : null;

    return { totalPL, wins, losses, avgScore, avgToPar, bestScore, roundsPlayed: completed.length };
  }, [settlements, scoringData, completed]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
        <div className="font-semibold text-foreground">{payload[0]?.payload?.fullDate || label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className="text-muted-foreground mt-0.5">
            {p.name}: <span className="font-bold text-foreground">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24 pt-6">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl text-primary tracking-tight">Stats</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.display_name || "Player"} · {stats.roundsPlayed} rounds
        </p>
      </div>

      <div className="px-4 flex flex-col gap-4 mt-2">
        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Handicap" value={profile?.handicap != null ? String(profile.handicap) : "—"} />
          <StatCard label="Best Score" value={stats.bestScore != null ? String(stats.bestScore) : "—"} />
          <StatCard label="Avg Score" value={stats.avgScore != null ? String(stats.avgScore) : "—"} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="Total P&L"
            value={`${stats.totalPL >= 0 ? "+" : ""}$${stats.totalPL.toFixed(0)}`}
            valueColor={stats.totalPL >= 0 ? "text-primary" : "text-destructive"}
          />
          <StatCard label="Wins" value={String(stats.wins)} valueColor="text-primary" />
          <StatCard label="Losses" value={String(stats.losses)} valueColor="text-destructive" />
        </div>

        {/* ── Bird Scores ── */}
        {serverStats && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Career Scorecard
            </div>
            <div className="grid grid-cols-4 gap-2">
              <BirdCard icon={EagleIcon} label="Eagles" value={serverStats.eagles ?? 0} />
              <BirdCard icon={BirdieIcon} label="Birdies" value={serverStats.birdies ?? 0} />
              <BirdCard icon={ParFlagIcon} label="Pars" value={serverStats.pars ?? 0} />
              <BirdCard icon={BogeyIcon} label="Bogeys" value={serverStats.bogeys ?? 0} />
            </div>
          </div>
        )}

        {/* ── Scoring Trend Chart ── */}
        {scoringData.length >= 2 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Scoring Trend
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={scoringData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="totalScore" name="Score"
                  stroke="hsl(var(--primary))" strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
            {stats.avgToPar !== null && (
              <div className="text-center mt-2 text-xs text-muted-foreground">
                Avg to par: <span className={`font-bold ${stats.avgToPar! <= 0 ? "text-primary" : "text-destructive"}`}>
                  {stats.avgToPar! > 0 ? "+" : ""}{stats.avgToPar}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Cumulative P&L Chart ── */}
        {plData.length >= 2 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Cumulative P&L
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={plData}>
                <defs>
                  <linearGradient id="plGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="cumulative" name="P&L"
                  stroke="hsl(var(--primary))" strokeWidth={2.5}
                  fill="url(#plGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Monthly P&L Bar Chart ── */}
        {monthlyPL.some(m => m.amount !== 0) && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Monthly P&L (Last 6 Months)
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyPL}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="amount" name="P&L" radius={[6, 6, 0, 0]}
                  fill="hsl(var(--primary))"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Win/Loss Record ── */}
        {(stats.wins > 0 || stats.losses > 0) && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Win / Loss Record
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="h-4 rounded-full bg-muted overflow-hidden flex">
                  {stats.wins > 0 && (
                    <div
                      className="h-full bg-primary rounded-l-full transition-all"
                      style={{ width: `${(stats.wins / (stats.wins + stats.losses)) * 100}%` }}
                    />
                  )}
                  {stats.losses > 0 && (
                    <div
                      className="h-full bg-destructive rounded-r-full transition-all"
                      style={{ width: `${(stats.losses / (stats.wins + stats.losses)) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="text-xs font-mono font-bold text-foreground whitespace-nowrap">
                {stats.wins}W – {stats.losses}L
              </div>
            </div>
            <div className="text-center mt-2 text-xs text-muted-foreground">
              Win rate: <span className="font-bold text-foreground">
                {((stats.wins / Math.max(stats.wins + stats.losses, 1)) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {completed.length === 0 && (
          <div className="text-center py-12">
            <BarChart3 size={40} className="mx-auto text-muted-foreground mb-3" />
            <div className="text-sm font-semibold text-muted-foreground">No completed rounds yet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Play some rounds to start tracking your stats
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-3 border border-border text-center">
      <div className={`text-lg font-extrabold font-mono ${valueColor || "text-foreground"}`}>{value}</div>
      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function BirdCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-xl p-2.5 text-center">
      <div className="flex justify-center mb-1">
        <Icon size={20} className="text-foreground" />
      </div>
      <div className="text-base font-extrabold font-mono text-foreground">{value}</div>
      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
