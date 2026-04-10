import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function NotificationSettings() {
  const navigate = useNavigate();
  const { supported, permission, subscribe, unsubscribe } = usePushNotifications();
  const [loading, setLoading] = useState(false);

  const isEnabled = permission === "granted";
  const isDenied = permission === "denied";

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isEnabled) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F5EFE0", fontFamily: FONT, paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{
        padding: "52px 20px 20px", background: "#fff",
        borderBottom: "1px solid #DDD0BB",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 20, color: "#8B7355", padding: 0, lineHeight: 1,
          }}>←</button>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#1E130A" }}>
            Notification Settings
          </span>
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Push Notifications Card */}
        <div style={{
          background: "#fff", borderRadius: 20, padding: "20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#A8957B",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16,
          }}>
            Push Notifications
          </div>

          {/* Toggle Row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 0", borderBottom: "1px solid #F3F4F6",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>
                Browser Notifications
              </div>
              <div style={{ fontSize: 12, color: "#A8957B", marginTop: 2 }}>
                Get alerts even when the app isn't open
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={loading || !supported || isDenied}
              style={{
                width: 48, height: 28, borderRadius: 14, border: "none",
                background: isEnabled ? "#2D5016" : "#CEC0AA",
                position: "relative", cursor: loading || !supported || isDenied ? "not-allowed" : "pointer",
                transition: "background 0.2s", opacity: loading ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              <span style={{
                display: "block", width: 22, height: 22, borderRadius: 11,
                background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                position: "absolute", top: 3,
                left: isEnabled ? 23 : 3,
                transition: "left 0.2s",
              }} />
            </button>
          </div>

          {/* Status Info */}
          {!supported && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10,
              background: "#FEF3C7", fontSize: 12, color: "#92400E",
            }}>
              Push notifications are not supported in this browser. Try using Chrome or Edge on desktop, or add the app to your home screen on mobile.
            </div>
          )}

          {isDenied && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10,
              background: "#FEF2F2", fontSize: 12, color: "#DC2626",
            }}>
              Notifications are blocked. To enable them, update your browser's notification permissions for this site, then refresh the page.
            </div>
          )}

          {isEnabled && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10,
              background: "#EEF5E5", fontSize: 12, color: "#2D5016",
            }}>
              ✓ You'll receive push notifications for group activity, round updates, and friend requests.
            </div>
          )}
        </div>

        {/* Notification Types Info */}
        <div style={{
          background: "#fff", borderRadius: 20, padding: "20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#A8957B",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16,
          }}>
            What You'll Be Notified About
          </div>

          {[
            { emoji: "👥", title: "Group Activity", desc: "New members joining your groups" },
            { emoji: "⛳", title: "Round Updates", desc: "Score updates and round completions" },
            { emoji: "🤝", title: "Friend Requests", desc: "When someone sends you a friend request" },
            { emoji: "💬", title: "Comments & Reactions", desc: "Activity on your posts" },
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 0",
              borderBottom: i < 3 ? "1px solid #F3F4F6" : "none",
            }}>
              <span style={{ fontSize: 20 }}>{item.emoji}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1E130A" }}>{item.title}</div>
                <div style={{ fontSize: 11, color: "#A8957B" }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
