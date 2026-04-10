import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { Users, BarChart3, Settings, Shield, ChevronLeft, Layers } from "lucide-react";
import crybabyLogo from "@/assets/crybaby-logo.png";

const adminNav = [
  { path: "/admin", label: "Dashboard", icon: BarChart3, end: true },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/rounds", label: "Rounds", icon: Layers },
  { path: "/admin/groups", label: "Groups", icon: Shield },
  { path: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout() {
  const { isAdmin, loading } = useIsAdmin();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/profile" replace />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 border-r border-border bg-card flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <img src={crybabyLogo} alt="Crybaby" className="h-8" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">Admin</span>
        </div>

        <nav className="flex-1 py-2">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-primary bg-accent"
                      : "text-foreground hover:bg-accent/50"
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <NavLink
            to="/profile"
            className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
            Back to App
          </NavLink>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden flex flex-col shrink-0 bg-card border-b border-border sticky top-0 z-40"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Header row */}
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => navigate("/profile")}
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ChevronLeft size={18} />
            App
          </button>
          <div className="flex items-center gap-2">
            <img src={crybabyLogo} alt="Crybaby" className="h-7" />
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Admin</span>
          </div>
          <div className="w-14" />
        </div>

        {/* Horizontal tab strip */}
        <div className="flex overflow-x-auto scrollbar-none border-t border-border">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-4 py-2.5 text-[10px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 border-b-2 ${
                    isActive
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
