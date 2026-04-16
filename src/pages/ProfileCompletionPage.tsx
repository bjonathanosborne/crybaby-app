import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadProfile, updateProfile } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid #DDD0BB",
  fontFamily: FONT,
  fontSize: 15,
  background: "#FAF5EC",
  outline: "none",
  boxSizing: "border-box" as const,
};

export default function ProfileCompletionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ghin, setGhin] = useState("");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadProfile().then((p) => {
      if (!p) { setLoading(false); return; }
      // If already completed, redirect to home
      if (p.profile_completed) {
        navigate("/home", { replace: true });
        return;
      }
      // Pre-fill existing values
      if (p.first_name) setFirstName(p.first_name);
      if (p.last_name) setLastName(p.last_name);
      if (p.ghin) setGhin(p.ghin);
      // Try to split display_name for Google OAuth users
      if (!p.first_name && !p.last_name && p.display_name) {
        const parts = p.display_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          setFirstName(parts[0]);
          setLastName(parts.slice(1).join(" "));
        } else if (parts.length === 1) {
          setFirstName(parts[0]);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, navigate]);

  const canSubmit = firstName.trim() && lastName.trim() && ghin.trim();

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ghin: ghin.trim(),
        display_name: `${firstName.trim()} ${lastName.trim()}`,
        profile_completed: true,
      });
      navigate("/home", { replace: true });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F5EFE0", fontFamily: FONT,
      }}>
        <div style={{ fontSize: 14, color: "#8B7355" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#F5EFE0",
    }}>
      {/* Header */}
      <div style={{
        background: "#1E130A", padding: "60px 32px 36px",
        borderRadius: "0 0 36px 36px", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⛳</div>
        <div style={{
          fontFamily: "'Pacifico', cursive", fontSize: 26, fontWeight: 400,
          color: "#fff", marginBottom: 6,
        }}>
          Complete Your Profile
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.5)",
        }}>
          We need a few details before you hit the course.
        </div>
      </div>

      {/* Form */}
      <div style={{
        padding: "32px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div>
          <label style={{
            fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355",
            display: "block", marginBottom: 6,
          }}>
            First Name
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{
            fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355",
            display: "block", marginBottom: 6,
          }}>
            Last Name
          </label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{
            fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355",
            display: "block", marginBottom: 6,
          }}>
            GHIN Number
          </label>
          <input
            value={ghin}
            onChange={(e) => setGhin(e.target.value.replace(/\D/g, ""))}
            placeholder="7-digit GHIN number"
            maxLength={10}
            style={{ ...inputStyle, fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: "0.08em" }}
          />
          <div style={{
            marginTop: 8, fontFamily: FONT, fontSize: 12, color: "#A8957B",
          }}>
            Need a GHIN?{" "}
            <a
              href="https://www.usga.org/content/usga/home-page/handicapping/handicap-index.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2D5016", fontWeight: 600, textDecoration: "none" }}
            >
              Get one at USGA.org →
            </a>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSubmit || saving}
          style={{
            width: "100%", padding: "18px", borderRadius: 14, border: "none",
            cursor: canSubmit && !saving ? "pointer" : "not-allowed",
            fontFamily: FONT, fontSize: 16, fontWeight: 700, marginTop: 12,
            background: canSubmit ? "#2D5016" : "#CEC0AA",
            color: canSubmit ? "#fff" : "#A8957B",
            boxShadow: canSubmit ? "0 4px 12px rgba(45,80,22,0.25)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          {saving ? "Saving..." : "Continue →"}
        </button>
      </div>
    </div>
  );
}
