import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { findGroupByInviteCode, joinGroup } from "@/lib/db";
import { toast } from "@/hooks/use-toast";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function JoinGroupPage() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Redirect to auth, then back here
      navigate(`/auth?redirect=/join/${code}`);
      return;
    }
    if (!code) { setError("No invite code"); setLoading(false); return; }

    findGroupByInviteCode(code)
      .then(g => {
        if (g) setGroup(g);
        else setError("Invalid or expired invite code");
      })
      .catch(() => setError("Something went wrong"))
      .finally(() => setLoading(false));
  }, [code, user, authLoading]);

  const handleJoin = async () => {
    if (!group) return;
    setJoining(true);
    try {
      await joinGroup(group.id);
      toast({ title: "Welcome!", description: `You joined ${group.name}` });
      navigate("/groups");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F7F7F5", fontFamily: FONT, padding: 24,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "40px 28px", maxWidth: 380, width: "100%",
        textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      }}>
        {loading ? (
          <div style={{ color: "#9CA3AF", fontSize: 14 }}>Looking up invite...</div>
        ) : error ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1A1A", marginBottom: 8 }}>{error}</div>
            <button onClick={() => navigate("/groups")} style={{
              padding: "12px 24px", borderRadius: 12, border: "none",
              background: "#1A1A1A", color: "#fff", fontFamily: FONT,
              fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 12,
            }}>Go to Groups</button>
          </>
        ) : group ? (
          <>
            <div style={{
              width: 72, height: 72, borderRadius: 22, background: "#F0FDF4",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, margin: "0 auto 16px",
            }}>🏌️</div>
            <div style={{ fontSize: 14, color: "#9CA3AF", marginBottom: 4 }}>You've been invited to join</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginBottom: 6 }}>{group.name}</div>
            {group.description && (
              <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>{group.description}</div>
            )}
            <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 20 }}>
              {group.group_members?.[0]?.count || 0} members · {group.privacy_level}
            </div>
            <button onClick={handleJoin} disabled={joining} style={{
              width: "100%", padding: "16px", borderRadius: 14, border: "none",
              background: "#16A34A", color: "#fff", fontFamily: FONT,
              fontSize: 16, fontWeight: 700, cursor: "pointer",
              opacity: joining ? 0.6 : 1,
            }}>
              {joining ? "Joining..." : "Join Group"}
            </button>
            <button onClick={() => navigate("/groups")} style={{
              display: "block", margin: "12px auto 0", background: "none", border: "none",
              color: "#9CA3AF", fontFamily: FONT, fontSize: 13, cursor: "pointer",
            }}>Maybe later</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
