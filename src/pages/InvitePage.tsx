import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getInvite } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const font = "'Lato', -apple-system, BlinkMacSystemFont, sans-serif";

  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    getInvite(token)
      .then((data) => {
        if (!data) setInvalid(true);
        else setInvite(data);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  // If already logged in, just accept the invite and redirect to friends
  useEffect(() => {
    if (user && token) {
      localStorage.setItem("pending_invite_token", token);
      navigate("/friends", { replace: true });
    }
  }, [user, token, navigate]);

  const handleJoin = () => {
    if (token) localStorage.setItem("pending_invite_token", token);
    navigate("/auth");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1a0f", fontFamily: font }}>
        <div style={{ color: "#fff", fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  if (invalid) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f1a0f", fontFamily: font, padding: 32 }}>
        <img src={crybabyLogo} alt="Crybaby" style={{ height: 100, marginBottom: 24 }} />
        <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Invite not found</div>
        <div style={{ color: "#9ca3af", fontSize: 15, textAlign: "center" }}>This invite link is invalid or has expired.</div>
        <button onClick={() => navigate("/auth")} style={{ marginTop: 32, background: "#fff", color: "#0f1a0f", border: "none", borderRadius: 14, padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Sign in anyway
        </button>
      </div>
    );
  }

  const inviterName = invite?.profiles?.display_name || "Someone";

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(160deg, #0f1a0f 0%, #1a3a1a 60%, #0f2010 100%)",
      fontFamily: font,
      padding: 32,
      textAlign: "center",
    }}>
      {/* Logo */}
      <img src={crybabyLogo} alt="Crybaby" style={{ height: 110, marginBottom: 8 }} />

      {/* Invite message */}
      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 8, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
        You're invited 🏌️
      </div>
      <div style={{ fontSize: 17, color: "#a3c4a3", marginBottom: 6 }}>
        <strong style={{ color: "#fff" }}>{inviterName}</strong> wants you to join them on
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#6ee76e", marginBottom: 32, letterSpacing: "-0.01em" }}>
        Crybaby Golf
      </div>

      {/* What it is */}
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 24px", marginBottom: 32, maxWidth: 340, width: "100%" }}>
        <div style={{ color: "#e5e7eb", fontSize: 14, lineHeight: 1.7 }}>
          ⛳ Track live scores with friends<br />
          💰 Play games & settle bets<br />
          📊 See who's actually good
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleJoin}
        style={{
          width: "100%",
          maxWidth: 340,
          background: "#fff",
          color: "#0f1a0f",
          border: "none",
          borderRadius: 16,
          padding: "16px 32px",
          fontSize: 17,
          fontWeight: 800,
          cursor: "pointer",
          letterSpacing: "-0.01em",
          marginBottom: 14,
        }}
      >
        Create your profile
      </button>
      <button
        onClick={() => navigate("/auth")}
        style={{ background: "transparent", color: "#9ca3af", border: "none", fontSize: 14, cursor: "pointer", padding: 8 }}
      >
        Already have an account? Sign in
      </button>
    </div>
  );
}
