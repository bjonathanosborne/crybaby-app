import { useState } from "react";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/feed");
  }, [user, navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a verification link. Click it to activate your account.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/feed");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#F7F7F5", fontFamily: FONT, padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src={crybabyLogo} alt="Crybaby" style={{ width: "70vw", maxWidth: 320, margin: "0 auto" }} />
          <p style={{
            color: "#1A1A1A", fontSize: 18, fontWeight: 700, marginTop: -109,
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #16A34A, #059669)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Golf's social scoring app
          </p>
        </div>

        {/* Google Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 12,
            border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer",
            fontFamily: FONT, fontSize: 15, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            marginBottom: 20, color: "#1F2937",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
        </div>

        {/* Email Form */}
        <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <input
              type="text" placeholder="Display Name" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} required
              style={inputStyle}
            />
          )}
          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required
            style={inputStyle}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6}
            style={inputStyle}
          />
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px 16px", borderRadius: 12,
            border: "none", background: "#16A34A", color: "#fff", cursor: "pointer",
            fontFamily: FONT, fontSize: 15, fontWeight: 700,
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#6B7280" }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            style={{
              background: "none", border: "none", color: "#16A34A",
              fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            }}
          >
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: "1px solid #E5E7EB", background: "#fff",
  fontFamily: "'SF Pro Display', -apple-system, sans-serif",
  fontSize: 15, outline: "none", boxSizing: "border-box",
};
