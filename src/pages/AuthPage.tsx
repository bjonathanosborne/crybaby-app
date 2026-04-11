import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { acceptInvite } from "@/lib/db";

export default function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const pendingToken = localStorage.getItem("pending_invite_token");
      if (pendingToken) {
        localStorage.removeItem("pending_invite_token");
        acceptInvite(pendingToken).catch(() => {});
      }
      navigate("/home", { replace: true });
    }
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
        navigate("/home");
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#F5EFE0" }}
    >
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="text-center mb-14">
          <div style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: 48,
            fontWeight: 400,
            color: "#2D5016",
            lineHeight: 1.15,
            textShadow: "0 1px 10px rgba(212, 175, 55, 0.4)",
          }}>
            Crybaby Golf
          </div>
          <p className="text-sm font-semibold tracking-wide text-muted-foreground mt-2">
            Golf's social scoring app
          </p>
          <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold tracking-widest uppercase border border-primary/20">
            Beta
          </span>
        </div>

        {/* Google Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full p-3 rounded-2xl border border-border bg-white cursor-pointer text-[15px] font-semibold flex items-center justify-center gap-2.5 mb-5 text-foreground hover:border-primary/40 hover:shadow-md transition-all duration-200 disabled:opacity-60 shadow-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Email Form */}
        <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              type="text" placeholder="Display Name" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} required
              className="w-full p-3 rounded-2xl border border-border bg-card text-[15px] text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
            />
          )}
          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required
            className="w-full p-3 rounded-2xl border border-border bg-card text-[15px] text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6}
            className="w-full p-3 rounded-2xl border border-border bg-card text-[15px] text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px 24px",
              borderRadius: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Pacifico', cursive",
              fontSize: 18,
              fontWeight: 400,
              background: "#2D5016",
              color: "#D4AF37",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.2s ease",
              minHeight: 44,
              boxShadow: "0 2px 12px rgba(45,80,22,0.25)",
              textShadow: "0 1px 6px rgba(212, 175, 55, 0.45)",
            }}
          >
            {loading ? (
              mode === "login" ? "Signing in…" : "Creating account…"
            ) : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center mt-5 text-[13px] text-muted-foreground">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="bg-transparent border-none text-primary font-semibold cursor-pointer hover:underline"
          >
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}
