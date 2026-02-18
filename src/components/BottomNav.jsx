import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Plus, UsersRound, User } from "lucide-react";

const tabs = [
  { key: "feed", path: "/feed", label: "Feed", icon: Home },
  { key: "friends", path: "/friends", label: "Friends", icon: Users },
  { key: "new", path: "/setup", label: "", icon: Plus },
  { key: "groups", path: "/groups", label: "Groups", icon: UsersRound },
  { key: "profile", path: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (tab) => {
    if (tab.key === "new") return location.pathname === "/setup";
    if (tab.key === "feed") return location.pathname === "/feed" && !location.search;
    return location.pathname === tab.path;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      <div className="flex max-w-[420px] w-full mx-auto items-center justify-around">
        {tabs.map(tab => {
          const Icon = tab.icon;
          if (tab.key === "new") {
            return (
              <button key={tab.key} onClick={() => navigate(tab.path)}
                className="flex items-center justify-center w-12 h-12 -mt-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200 hover:scale-105 active:scale-95 border-none cursor-pointer">
                <Icon size={22} strokeWidth={2.5} />
              </button>
            );
          }
          const active = isActive(tab);
          return (
            <button key={tab.key} onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center py-2.5 px-1 bg-transparent border-none cursor-pointer gap-1 group">
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.5}
                className={`transition-all duration-200 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
              />
              <span className={`text-[10px] font-semibold tracking-wide transition-colors duration-200 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
