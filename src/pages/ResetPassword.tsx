import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setIsRecovery(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated!" });
      navigate("/feed");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <p>Invalid recovery link.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 24 }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Set New Password</h2>
        <input
          type="password" placeholder="New password" value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={6}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 15, boxSizing: "border-box" }}
        />
        <button type="submit" disabled={loading} style={{
          padding: "12px 16px", borderRadius: 12, border: "none",
          background: "#2D5016", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
        }}>
          {loading ? "..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
