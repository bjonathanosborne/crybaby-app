import { useState } from "react";

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const NOTIFICATION_TYPES = [
  { key: "group_activity",   emoji: "👥", title: "Group Activity",       desc: "New members joining your groups" },
  { key: "round_updates",    emoji: "⛳", title: "Round Updates",         desc: "Score updates and round completions" },
  { key: "friend_requests",  emoji: "🤝", title: "Friend Requests",       desc: "When someone sends you a friend request" },
  { key: "comments",         emoji: "💬", title: "Comments & Reactions",  desc: "Activity on your posts" },
];

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 48, height: 28, borderRadius: 14, border: "none",
        background: enabled ? "#2D5016" : "#CEC0AA",
        position: "relative", cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span style={{
        display: "block", width: 22, height: 22, borderRadius: 11,
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        position: "absolute", top: 3,
        left: enabled ? 23 : 3,
        transition: "left 0.2s",
      }} />
    </button>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.key, true]))
  );

  const toggle = (key: string) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F5EFE0", fontFamily: FONT, paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 16px" }}>
        <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 20, fontWeight: 400, color: "#2D5016", lineHeight: 1, textShadow: "0 1px 8px rgba(212, 175, 55, 0.35)" }}>
          Notification Settings
        </span>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{
          background: "#fff", borderRadius: 20, padding: "8px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {NOTIFICATION_TYPES.map((item, i) => (
            <div key={item.key} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 0",
              borderBottom: i < NOTIFICATION_TYPES.length - 1 ? "1px solid #F3F4F6" : "none",
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{item.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#A8957B", marginTop: 2 }}>{item.desc}</div>
              </div>
              <Toggle enabled={prefs[item.key]} onToggle={() => toggle(item.key)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
