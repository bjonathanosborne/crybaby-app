import { Outlet, NavLink, Navigate } from "react-router-dom";
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
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card flex flex-col shrink-0">
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

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
