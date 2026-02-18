import { useLocation, useNavigate } from "react-router-dom";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const tabs = [
  { key: "feed", path: "/feed", label: "Feed", icon: "🏠" },
  { key: "live", path: "/feed?tab=live", label: "Live", icon: "📡" },
  { key: "new", path: "/setup", label: "", icon: "+" },
  { key: "friends", path: "/friends", label: "Friends", icon: "👥" },
  { key: "profile", path: "/profile", label: "Profile", icon: "👤" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (tab) => {
    if (tab.key === "new") return location.pathname === "/setup";
    if (tab.key === "feed") return location.pathname === "/feed" && !location.search;
    if (tab.key === "live") return location.search.includes("tab=live");
    if (tab.key === "friends") return location.pathname === "/friends";
    if (tab.key === "profile") return location.pathname === "/profile";
    return false;
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
      borderTop: "1px solid #E5E7EB",
      paddingBottom: "max(8px, env(safe-area-inset-bottom))",
    }}>
      <div style={{ display: "flex", maxWidth: 420, width: "100%", margin: "0 auto", justifyContent: "space-around", alignItems: "center" }}>
        {tabs.map(tab => {
          if (tab.key === "new") {
            return (
              <button key={tab.key} onClick={() => navigate(tab.path)} style={{
                width: 48, height: 48, borderRadius: 24, border: "none", cursor: "pointer",
                background: "#16A34A", color: "#fff",
                fontSize: 24, fontWeight: 700, fontFamily: FONT,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(22,163,74,0.3)",
                marginTop: -8,
              }}>
                +
              </button>
            );
          }
          const active = isActive(tab);
          return (
            <button key={tab.key} onClick={() => navigate(tab.path)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              padding: "8px 4px", background: "none", border: "none", cursor: "pointer",
              gap: 2,
            }}>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{
                fontFamily: FONT, fontSize: 10, fontWeight: 600,
                color: active ? "#16A34A" : "#9CA3AF",
                transition: "color 0.2s ease",
              }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
