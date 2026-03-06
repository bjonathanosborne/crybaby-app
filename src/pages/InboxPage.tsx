import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadNotifications, markNotificationRead, markAllNotificationsRead,
  acceptFriendRequest, removeFriendship, loadUserProfile,
} from "@/lib/db";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Inbox, UserPlus, Users, Bell, Check, X, Loader2, Radio } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

function profileName(profile: any) {
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  return full || profile?.display_name || "Unknown";
}

function UserAvatar({ profile, size = 36 }: { profile: any; size?: number }) {
  const name = profileName(profile);
  const initial = name[0]?.toUpperCase() || "?";
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full bg-primary flex items-center justify-center text-primary-foreground flex-shrink-0 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}

const ICON_MAP: Record<string, any> = {
  friend_request: UserPlus,
  group_join: Users,
  round_broadcast_started: Radio,
};

export default function InboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) return;
    try {
      const notifs = await loadNotifications(50);
      setNotifications(notifs);

      // Load sender profiles for friend requests
      const senderIds = new Set<string>();
      notifs.forEach((n: any) => {
        if (n.data?.sender_user_id) senderIds.add(n.data.sender_user_id);
      });
      const profileMap: Record<string, any> = {};
      for (const uid of senderIds) {
        if (!senderProfiles[uid]) {
          const prof = await loadUserProfile(uid);
          if (prof) profileMap[uid] = prof;
        }
      }
      setSenderProfiles(prev => ({ ...prev, ...profileMap }));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [user]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("inbox-notifications")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => { refresh(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleAcceptFriend = async (notif: any) => {
    const friendshipId = notif.data?.friendship_id;
    if (!friendshipId) return;
    setActing(notif.id);
    try {
      await acceptFriendRequest(friendshipId);
      await markNotificationRead(notif.id);
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, read: true, _accepted: true } : n)
      );
      toast({ title: "Friend request accepted! 🤝" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleDeclineFriend = async (notif: any) => {
    const friendshipId = notif.data?.friendship_id;
    if (!friendshipId) return;
    setActing(notif.id);
    try {
      await removeFriendship(friendshipId);
      await markNotificationRead(notif.id);
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, read: true, _declined: true } : n)
      );
      toast({ title: "Friend request declined" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleMarkRead = async (notif: any) => {
    if (notif.read) return;
    await markNotificationRead(notif.id);
    setNotifications(prev =>
      prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
    );
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast({ title: "All marked as read" });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-background pb-24 pt-6">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex justify-between items-center">
        <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Inbox</h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead}
            className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground cursor-pointer hover:border-primary/30 transition-colors">
            Mark all read
          </button>
        )}
      </div>

      <div className="px-4 flex flex-col gap-2 mt-2">
        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <Inbox size={40} className="mx-auto text-muted-foreground mb-3" />
            <div className="text-sm font-semibold text-muted-foreground">No notifications yet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Friend requests and updates will appear here
            </div>
          </div>
        ) : (
          notifications.map((notif) => {
            const isFriendRequest = notif.type === "friend_request";
            const isActioned = notif._accepted || notif._declined;
            const senderProfile = notif.data?.sender_user_id ? senderProfiles[notif.data.sender_user_id] : null;
            const IconComp = ICON_MAP[notif.type] || Bell;

            return (
              <div
                key={notif.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  notif.read ? "border-border bg-card" : "border-primary/20 bg-accent"
                } ${notif.type === "round_broadcast_started" ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (notif.type === "round_broadcast_started" && notif.data?.roundId) {
                    markNotificationRead(notif.id).catch(() => {});
                    navigate(`/watch?id=${notif.data.roundId}`);
                  } else if (!isFriendRequest) {
                    handleMarkRead(notif);
                  }
                }}
              >
                <div className="flex gap-3 items-start">
                  {/* Icon or avatar */}
                  {isFriendRequest && senderProfile ? (
                    <UserAvatar profile={senderProfile} size={40} />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <IconComp size={18} className="text-primary" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm leading-snug ${notif.read ? "font-medium text-foreground" : "font-bold text-foreground"}`}>
                      {notif.title}
                    </div>
                    {notif.body && notif.body !== "" && !isFriendRequest && (
                      <div className="text-xs text-muted-foreground mt-0.5">{notif.body}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(parseISO(notif.created_at), { addSuffix: true })}
                    </div>

                    {/* Friend request actions */}
                    {isFriendRequest && !isActioned && !notif.read && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAcceptFriend(notif); }}
                          disabled={acting === notif.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeclineFriend(notif); }}
                          disabled={acting === notif.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-muted-foreground text-xs font-semibold cursor-pointer hover:text-destructive hover:border-destructive/30 disabled:opacity-50 transition-colors"
                        >
                          <X size={14} /> Decline
                        </button>
                      </div>
                    )}

                    {/* Actioned state */}
                    {isFriendRequest && notif._accepted && (
                      <div className="mt-2 text-xs font-semibold text-primary">✓ Accepted</div>
                    )}
                    {isFriendRequest && notif._declined && (
                      <div className="mt-2 text-xs font-semibold text-muted-foreground">Declined</div>
                    )}
                    {isFriendRequest && notif.read && !isActioned && (
                      <div className="mt-2 text-xs text-muted-foreground italic">Already handled</div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!notif.read && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
