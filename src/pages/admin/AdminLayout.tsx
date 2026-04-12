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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5EFE0" }}>
        <div style={{ color: "#8B7355", fontFamily: "'DM Sans', system-ui, sans-serif" }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/profile" replace />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: "#F5EFE0" }}>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 flex-col shrink-0" style={{ background: "#FAF5EC", borderRight: "1px solid #DDD0BB" }}>
        {/* Logo + Admin badge */}
        <div className="p-4 flex items-center gap-2" style={{ borderBottom: "1px solid #DDD0BB" }}>
          <img src={crybabyLogo} alt="Crybaby" className="h-8" />
          <span style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 6,
            background: "#D4AF3718", color: "#B8860B",
            border: "1px solid #D4AF3740",
          }}>Admin</span>
        </div>

        <nav className="flex-1 py-2">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                style={({ isActive }) => ({
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 16px",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: 14, fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#2D5016" : "#8B7355",
                  background: isActive ? "#2D501612" : "transparent",
                  borderRight: isActive ? "3px solid #2D5016" : "3px solid transparent",
                  textDecoration: "none", transition: "all 0.15s ease",
                })}
              >
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div style={{ borderTop: "1px solid #DDD0BB", padding: "8px" }}>
          <button
            onClick={() => navigate("/profile")}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", width: "100%",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 13, color: "#A8957B", background: "none", border: "none",
              cursor: "pointer", borderRadius: 8, textAlign: "left",
            }}
            onMouseOver={e => (e.currentTarget.style.color = "#1E130A")}
            onMouseOut={e => (e.currentTarget.style.color = "#A8957B")}
          >
            <ChevronLeft size={15} />
            Back to App
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div
        className="md:hidden flex flex-col shrink-0 sticky top-0 z-40"
        style={{ background: "#FAF5EC", borderBottom: "1px solid #DDD0BB", paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => navigate("/profile")}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 13, color: "#8B7355", background: "none", border: "none", cursor: "pointer",
            }}
          >
            <ChevronLeft size={17} />
            App
          </button>
          <div className="flex items-center gap-2">
            <img src={crybabyLogo} alt="Crybaby" className="h-7" />
            <span style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 7px", borderRadius: 5,
              background: "#D4AF3718", color: "#B8860B",
              border: "1px solid #D4AF3740",
            }}>Admin</span>
          </div>
          <div className="w-14" />
        </div>

        {/* Horizontal tab strip */}
        <div className="flex overflow-x-auto" style={{ borderTop: "1px solid #DDD0BB" }}>
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                style={({ isActive }) => ({
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  padding: "10px 16px",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
                  whiteSpace: "nowrap", flexShrink: 0, textDecoration: "none",
                  color: isActive ? "#2D5016" : "#A8957B",
                  borderBottom: isActive ? "2px solid #2D5016" : "2px solid transparent",
                  transition: "all 0.15s ease",
                })}
              >
                <Icon size={15} />
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
