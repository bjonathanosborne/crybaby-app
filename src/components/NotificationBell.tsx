import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Settings } from "lucide-react";
import {
  loadNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/db";
import { formatDistanceToNow, parseISO } from "date-fns";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    if (!user) return;
    try {
      const [notifs, count] = await Promise.all([
        loadNotifications(),
        getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnread(count);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    navigate("/inbox");
  };

  const handleClick = async (notif: any) => {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setUnread((u) => Math.max(0, u - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    // Navigate based on type
    if (notif.data?.group_id) {
      navigate("/groups");
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (!user) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          fontSize: 18,
        }}
        aria-label="Notifications"
      >
        <Bell size={18} className="text-foreground" />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: "hsl(var(--destructive))",
              color: "hsl(var(--destructive-foreground))",
              fontSize: 10,
              fontWeight: 800,
              fontFamily: FONT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid hsl(var(--card))",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            width: 320,
            maxHeight: 420,
            overflowY: "auto",
            background: "hsl(var(--card))",
            borderRadius: 16,
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
            border: "1px solid hsl(var(--border))",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px 10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid hsl(var(--border))",
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "hsl(var(--foreground))",
                fontFamily: FONT,
              }}
            >
              Notifications
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "hsl(var(--muted-foreground))",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: FONT,
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate("/notifications/settings"); }}
                style={{
                  fontSize: 16,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                }}
                 aria-label="Notification settings"
               >
                 <Settings size={14} className="text-muted-foreground" />
               </button>
            </div>
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "hsl(var(--muted-foreground))",
                fontSize: 13,
                fontFamily: FONT,
              }}
            >
              No notifications yet
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                style={{
                  width: "100%",
                  display: "flex",
                  gap: 12,
                  padding: "12px 16px",
                  background: notif.read
                    ? "transparent"
                    : "hsl(var(--accent))",
                  border: "none",
                  borderBottom: "1px solid hsl(var(--border))",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: FONT,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "hsl(142 76% 36% / 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  <Bell size={16} className="text-primary" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: notif.read ? 500 : 700,
                      color: "hsl(var(--foreground))",
                      lineHeight: 1.3,
                    }}
                  >
                    {notif.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {formatDistanceToNow(parseISO(notif.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
                {!notif.read && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: "hsl(142 76% 36%)",
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
