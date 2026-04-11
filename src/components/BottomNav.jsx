import { useLocation, useNavigate } from "react-router-dom";

// Golf-themed SVG icons
function FeedIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* Flag on green — golf feed */}
      <path d="M5 21V4" />
      <path d="M5 4l10 3.5L5 11" />
      <circle cx="17" cy="18" r="3" strokeWidth={active ? 2 : 1.3} />
    </svg>
  );
}

function FriendsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* Two golfers */}
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <path d="M5 21v-2a4 4 0 014-4h0" />
      <path d="M13 21v-2a4 4 0 014-4h0" />
    </svg>
  );
}

function NewRoundIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      {/* Golf tee with plus */}
      <circle cx="12" cy="7" r="4" />
      <line x1="12" y1="11" x2="12" y2="20" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </svg>
  );
}

function GroupsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* Three people — group */}
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-1.5a5 5 0 015-5h2a5 5 0 015 5V21" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M21 21v-1a3.5 3.5 0 00-3-3.46" />
    </svg>
  );
}

function ProfileIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 21v-1a6 6 0 0112 0v1" />
    </svg>
  );
}

const tabs = [
  { key: "feed", path: "/feed", label: "Feed", Icon: FeedIcon },
  { key: "friends", path: "/friends", label: "Friends", Icon: FriendsIcon },
  { key: "new", path: "/setup", label: "", Icon: NewRoundIcon },
  { key: "groups", path: "/groups", label: "Groups", Icon: GroupsIcon },
  { key: "profile", path: "/profile", label: "Profile", Icon: ProfileIcon },
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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      <div className="flex max-w-[420px] w-full mx-auto items-center justify-around">
        {tabs.map(tab => {
          const { Icon } = tab;
          if (tab.key === "new") {
            return (
              <button key={tab.key} onClick={() => navigate(tab.path)}
                className="flex items-center justify-center w-12 h-12 -mt-3 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200 hover:scale-105 active:scale-95 border-none cursor-pointer">
                <Icon active={false} />
              </button>
            );
          }
          const active = isActive(tab);
          return (
            <button key={tab.key} onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center py-2.5 px-1 bg-transparent border-none cursor-pointer gap-1 group">
              <span className={`transition-all duration-200 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                <Icon active={active} />
              </span>
              <span className={`transition-colors duration-200 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                style={{ fontFamily: "'Pacifico', cursive", fontSize: 11, fontWeight: 400 }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
