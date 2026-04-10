import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { updateProfile } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";

// ============================================================
// CRYBABY — Onboarding & Profile Setup
// Auth → GHIN Verification → Profile → Welcome
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

const AUSTIN_COURSES = [
  { id: "westlake", name: "Westlake Country Club", city: "Austin", type: "private" },
  { id: "austin_cc", name: "Austin Country Club", city: "Austin", type: "private" },
  { id: "spanish_oaks", name: "Spanish Oaks Golf Club", city: "Bee Cave", type: "private" },
  { id: "barton_fazio", name: "Barton Creek — Fazio Foothills", city: "Austin", type: "resort" },
  { id: "barton_crenshaw", name: "Barton Creek — Crenshaw Cliffside", city: "Austin", type: "resort" },
  { id: "barton_coore", name: "Barton Creek — Coore Crenshaw", city: "Austin", type: "resort" },
  { id: "barton_palmer", name: "Barton Creek — Palmer Lakeside", city: "Austin", type: "resort" },
  { id: "lions", name: "Lions Municipal Golf Course", city: "Austin", type: "public" },
  { id: "avery_ranch", name: "Avery Ranch Golf Club", city: "Austin", type: "public" },
  { id: "grey_rock", name: "Grey Rock Golf Club", city: "Austin", type: "semi-private" },
  { id: "falconhead", name: "Falconhead Golf Club", city: "Bee Cave", type: "semi-private" },
  { id: "wolfdancer", name: "Wolfdancer Golf Club", city: "Cedar Creek", type: "resort" },
  { id: "star_ranch", name: "Star Ranch Golf Club", city: "Round Rock", type: "public" },
  { id: "teravista", name: "Teravista Golf Club", city: "Round Rock", type: "public" },
  { id: "shadow_glen", name: "Shadow Glen Golf Club", city: "Manor", type: "public" },
  { id: "plum_creek", name: "Plum Creek Golf Course", city: "Kyle", type: "public" },
  { id: "crystal_falls", name: "Crystal Falls Golf Club", city: "Leander", type: "semi-private" },
];

const AVATAR_COLORS = [
  "#2D5016", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

// --- ANIMATED DOTS ---
function LoadingDots() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "" : d + ".");
    }, 400);
    return () => clearInterval(interval);
  }, []);
  return <span>{dots}</span>;
}

// ============================================================
// STEP: SPLASH
// ============================================================
function SplashScreen({ onContinue }) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    // 3-second loading screen
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#1E130A",
        transition: "opacity 0.8s ease",
        opacity: visible ? 1 : 0,
      }}>
        <img src={crybabyLogo} alt="Crybaby Golf" style={{
          width: "90vw", maxWidth: 600,
          transition: "transform 0.6s ease",
          transform: visible ? "scale(1)" : "scale(0.5)",
        }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#1E130A", padding: "40px 32px",
      transition: "opacity 0.8s ease",
      opacity: 1,
    }}>
      <img src={crybabyLogo} alt="Crybaby Golf" style={{
        width: "90vw", maxWidth: 600, marginBottom: 24,
      }} />
      <div style={{
        fontFamily: FONT, fontSize: 16, color: "rgba(255,255,255,0.5)",
        fontWeight: 500, marginBottom: 48, textAlign: "center", lineHeight: 1.5,
      }}>
        Golf gambling. Trash talk. Tears.
      </div>

      <button onClick={onContinue} style={{
        width: "100%", maxWidth: 320, padding: "18px 32px", borderRadius: 16,
        border: "none", cursor: "pointer",
        fontFamily: FONT, fontSize: 17, fontWeight: 700,
        background: "#2D5016", color: "#fff",
        boxShadow: "0 4px 20px rgba(45,80,22,0.4)",
        transition: "transform 0.15s ease",
      }}>
        Get Started
      </button>

      <div style={{
        fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.25)",
        marginTop: 24, textAlign: "center",
      }}>
        Already have an account? <span style={{ color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 600 }}>Sign in</span>
      </div>
    </div>
  );
}

// ============================================================
// STEP: AUTH
// ============================================================
function AuthScreen({ onGoogleAuth, onEmailAuth }) {
  const [mode, setMode] = useState("choose"); // choose, email_signup, email_login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLogin, setIsLogin] = useState(false);

  if (mode === "choose") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        background: "#F5EFE0", padding: "0",
      }}>
        <div style={{
          background: "#1E130A", padding: "60px 32px 40px",
          borderRadius: "0 0 36px 36px", textAlign: "center",
        }}>
          <img src={crybabyLogo} alt="Crybaby Golf" style={{ height: 56, marginBottom: 12 }} />
          <div style={{
            fontFamily: FONT, fontSize: 28, fontWeight: 800, color: "#fff",
            letterSpacing: "-0.03em", marginBottom: 6,
          }}>Create Account</div>
          <div style={{
            fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.5)",
          }}>30 seconds. Then go find some pigeons.</div>
        </div>

        <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          {/* Google OAuth */}
          <button onClick={onGoogleAuth} style={{
            width: "100%", padding: "16px 20px", borderRadius: 14,
            border: "1px solid #DDD0BB", background: "#FAF5EC", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#1E130A",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Apple (placeholder) */}
          <button style={{
            width: "100%", padding: "16px 20px", borderRadius: 14,
            border: "1px solid #DDD0BB", background: "#FAF5EC", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#1E130A",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.12 4.54-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>

          <div style={{
            display: "flex", alignItems: "center", gap: 16, margin: "8px 0",
          }}>
            <div style={{ flex: 1, height: 1, background: "#DDD0BB" }} />
            <span style={{ fontFamily: FONT, fontSize: 12, color: "#A8957B" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#DDD0BB" }} />
          </div>

          {/* Email */}
          <button onClick={() => setMode("email_signup")} style={{
            width: "100%", padding: "16px 20px", borderRadius: 14,
            border: "none", background: "#1E130A", cursor: "pointer",
            fontFamily: FONT, fontSize: 15, fontWeight: 600, color: "#fff",
          }}>
            Sign up with Email
          </button>

          <div style={{
            fontFamily: FONT, fontSize: 12, color: "#A8957B", textAlign: "center", marginTop: 12,
          }}>
            Already have an account?{" "}
            <span onClick={() => setMode("email_login")} style={{ color: "#2D5016", fontWeight: 600, cursor: "pointer" }}>
              Sign in
            </span>
          </div>
        </div>

        <div style={{
          padding: "16px 24px 32px", textAlign: "center",
          fontFamily: FONT, fontSize: 11, color: "#A8957B", lineHeight: 1.5,
        }}>
          By continuing, you agree to Crybaby's Terms of Service and Privacy Policy. We don't sell your data. We just track how many times you get hammered.
        </div>
      </div>
    );
  }

  // Email form
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#F5EFE0",
    }}>
      <div style={{
        background: "#1E130A", padding: "60px 32px 32px",
        borderRadius: "0 0 36px 36px", textAlign: "center",
      }}>
        <img src={crybabyLogo} alt="Crybaby Golf" style={{ height: 48, marginBottom: 8 }} />
        <div style={{
          fontFamily: FONT, fontSize: 24, fontWeight: 800, color: "#fff",
          letterSpacing: "-0.03em",
        }}>{mode === "email_login" ? "Welcome Back" : "Create Account"}</div>
      </div>

      <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        {mode === "email_signup" && (
          <div>
            <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355", display: "block", marginBottom: 6 }}>
              Full Name
            </label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="What do people call you on the course?"
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                border: "1px solid #DDD0BB", fontFamily: FONT, fontSize: 15,
                background: "#FAF5EC", outline: "none", boxSizing: "border-box",
              }} />
          </div>
        )}

        <div>
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355", display: "block", marginBottom: 6 }}>
            Email
          </label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" type="email"
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: "1px solid #DDD0BB", fontFamily: FONT, fontSize: 15,
              background: "#FAF5EC", outline: "none", boxSizing: "border-box",
            }} />
        </div>

        <div>
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355", display: "block", marginBottom: 6 }}>
            Password
          </label>
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" type="password"
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: "1px solid #DDD0BB", fontFamily: FONT, fontSize: 15,
              background: "#FAF5EC", outline: "none", boxSizing: "border-box",
            }} />
        </div>

        <button
          onClick={() => onEmailAuth({ email, password, name })}
          disabled={!email || !password || (mode === "email_signup" && !name)}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            cursor: email && password ? "pointer" : "not-allowed",
            fontFamily: FONT, fontSize: 16, fontWeight: 700, marginTop: 8,
            background: email && password ? "#2D5016" : "#CEC0AA",
            color: email && password ? "#fff" : "#A8957B",
          }}
        >
          {mode === "email_login" ? "Sign In" : "Create Account"}
        </button>

        <button onClick={() => setMode("choose")} style={{
          fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#8B7355",
          background: "none", border: "none", cursor: "pointer", marginTop: 4,
        }}>← Back to options</button>
      </div>
    </div>
  );
}

// ============================================================
// STEP: GHIN VERIFICATION
// ============================================================
function GHINScreen({ userName, onVerified, onSkip }) {
  const [ghin, setGhin] = useState("");
  const [status, setStatus] = useState("idle"); // idle, checking, verified, not_found
  const [handicap, setHandicap] = useState(null);
  const [scoringHistory, setScoringHistory] = useState([]);
  const [trialCount, setTrialCount] = useState(0);
  const [manualHandicap, setManualHandicap] = useState("");

  const checkGHIN = () => {
    if (ghin.length < 7) return;
    setStatus("checking");
    // GHIN API integration coming soon — for now, show manual entry
    setTimeout(() => {
      setTrialCount(prev => prev + 1);
      setStatus("not_found");
    }, 1500);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#F5EFE0",
    }}>
      <div style={{
        background: "#1E130A", padding: "60px 32px 32px",
        borderRadius: "0 0 36px 36px", textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
        <div style={{
          fontFamily: FONT, fontSize: 24, fontWeight: 800, color: "#fff",
          letterSpacing: "-0.03em", marginBottom: 4,
        }}>Verify Your Handicap</div>
        <div style={{
          fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.5)",
        }}>No sandbaggers allowed, {userName}.</div>
      </div>

      <div style={{ padding: "28px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* GHIN Input */}
        <div>
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#8B7355", display: "block", marginBottom: 6 }}>
            GHIN Number
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={ghin}
              onChange={e => {
                setGhin(e.target.value.replace(/\D/g, ""));
                if (status !== "idle") setStatus("idle");
              }}
              placeholder="Enter 7-digit GHIN number"
              maxLength={10}
              style={{
                flex: 1, padding: "14px 16px", borderRadius: 12,
                border: status === "verified" ? "2px solid #2D5016" : "1px solid #DDD0BB",
                fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: "0.08em",
                background: "#FAF5EC", outline: "none", boxSizing: "border-box",
                transition: "border 0.2s ease",
              }}
            />
            <button
              onClick={checkGHIN}
              disabled={ghin.length < 7 || status === "checking"}
              style={{
                padding: "14px 20px", borderRadius: 12, border: "none",
                cursor: ghin.length >= 7 && status !== "checking" ? "pointer" : "not-allowed",
                fontFamily: FONT, fontSize: 14, fontWeight: 700,
                background: ghin.length >= 7 ? "#1E130A" : "#CEC0AA",
                color: ghin.length >= 7 ? "#fff" : "#A8957B",
                minWidth: 80,
              }}
            >
              {status === "checking" ? <LoadingDots /> : "Verify"}
            </button>
          </div>
        </div>

        {/* Checking State */}
        {status === "checking" && (
          <div style={{
            padding: "20px", background: "#FAF5EC", borderRadius: 16, textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355" }}>
              Pulling your handicap from GHIN<LoadingDots />
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#A8957B", marginTop: 4, fontStyle: "italic" }}>
              Let's see what we're working with.
            </div>
          </div>
        )}

        {/* Verified State */}
        {status === "verified" && (
          <div style={{
            background: "#FAF5EC", borderRadius: 20, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <div style={{
              background: "#EEF5E5", padding: "20px", textAlign: "center",
              borderBottom: "1px solid #DCFCE7",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A3009" }}>
                  GHIN Verified
                </span>
              </div>
              <div style={{
                fontFamily: MONO, fontSize: 48, fontWeight: 900, color: "#2D5016",
                letterSpacing: "-0.03em",
              }}>
                {handicap}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#1A3009" }}>
                Handicap Index
              </div>
            </div>

            {/* Recent Scores */}
            <div style={{ padding: "16px 18px" }}>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Recent Scores
              </div>
              {scoringHistory.map((s, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0",
                  borderBottom: i < scoringHistory.length - 1 ? "1px solid #F3F4F6" : "none",
                }}>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1E130A" }}>{s.course}</div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: "#A8957B" }}>{s.date}</div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: "#1E130A" }}>{s.score}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "#8B7355" }}>diff {s.diff}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              padding: "12px 18px 16px",
              fontFamily: FONT, fontSize: 12, color: "#1A3009", fontStyle: "italic",
              background: "#EEF5E5", borderTop: "1px solid #DCFCE7",
            }}>
              💬 "A {handicap} handicap. The pigeons won't know what hit 'em."
            </div>
          </div>
        )}

        {/* Not Found / Coming Soon State */}
        {status === "not_found" && (
          <div style={{
            padding: "20px", background: "#FEF3C7", borderRadius: 16, textAlign: "center",
            border: "1px solid #FDE68A",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚧</div>
            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>
              GHIN Verification Coming Soon
            </div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
              Automatic handicap lookup isn't available yet. Enter your handicap manually below to get started.
            </div>
          </div>
        )}

        {/* Don't have GHIN / Manual entry */}
        {(status === "idle" || status === "not_found") && (
          <div style={{
            background: "#FAF5EC", borderRadius: 16, padding: "18px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1E130A", marginBottom: 8 }}>
              Don't have a GHIN number?
            </div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: "#8B7355", lineHeight: 1.5, marginBottom: 14 }}>
              You can enter your handicap manually for your first 3 rounds. After that, a verified GHIN number is required. No sandbagging on our watch.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={manualHandicap}
                onChange={e => setManualHandicap(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Enter handicap"
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: 10,
                  border: "1px solid #DDD0BB", fontFamily: MONO, fontSize: 16, fontWeight: 600,
                  background: "#FAF5EC", outline: "none", boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => {
                  if (manualHandicap) {
                    onSkip(parseFloat(manualHandicap));
                  }
                }}
                disabled={!manualHandicap}
                style={{
                  padding: "12px 18px", borderRadius: 10, border: "none",
                  cursor: manualHandicap ? "pointer" : "not-allowed",
                  fontFamily: FONT, fontSize: 13, fontWeight: 700,
                  background: manualHandicap ? "#F59E0B" : "#CEC0AA",
                  color: manualHandicap ? "#fff" : "#A8957B",
                }}
              >
                Use for 3 rounds
              </button>
            </div>
            <div style={{
              marginTop: 10, padding: "8px 12px", background: "#FEF3C7", borderRadius: 8,
              fontFamily: FONT, fontSize: 11, color: "#92400E",
            }}>
              ⚠️ Unverified handicaps will show without the ✅ badge. Other players can see this.
            </div>
          </div>
        )}

        {/* Continue button */}
        {status === "verified" && (
          <button onClick={() => onVerified(ghin, handicap)} style={{
            width: "100%", padding: "18px", borderRadius: 14, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 16, fontWeight: 700,
            background: "#2D5016", color: "#fff",
            boxShadow: "0 4px 12px rgba(45,80,22,0.25)",
          }}>
            Looks right — Continue →
          </button>
        )}

        {status !== "verified" && (
          <div style={{
            textAlign: "center", fontFamily: FONT, fontSize: 12, color: "#A8957B",
            marginTop: 8,
          }}>
            Need a GHIN?{" "}
            <span style={{ color: "#2D5016", fontWeight: 600, cursor: "pointer" }}>
              Get one at USGA.org →
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP: PROFILE SETUP
// ============================================================
function ProfileSetupScreen({ userName, handicap, ghinVerified, onComplete }) {
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarImage, setAvatarImage] = useState(null);
  const [homeCourse, setHomeCourse] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [city, setCity] = useState("Austin, TX");
  const fileInputRef = useRef(null);

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAvatarImage(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredCourses = AUSTIN_COURSES.filter(c =>
    c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
    c.city.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const selectedCourse = AUSTIN_COURSES.find(c => c.id === homeCourse);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#F5EFE0",
    }}>
      <div style={{
        background: "#1E130A", padding: "60px 32px 32px",
        borderRadius: "0 0 36px 36px", textAlign: "center",
      }}>
        {/* Avatar preview — tappable for upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: 88, height: 88, borderRadius: 44,
            background: avatarImage ? "transparent" : avatarColor,
            backgroundImage: avatarImage ? `url(${avatarImage})` : "none",
            backgroundSize: "cover", backgroundPosition: "center",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 4px", fontSize: 32, fontWeight: 800, color: "#fff",
            fontFamily: FONT, border: "3px solid rgba(255,255,255,0.2)",
            cursor: "pointer", position: "relative",
            transition: "transform 0.15s ease",
          }}
        >
          {!avatarImage && (userName?.[0]?.toUpperCase() || "?")}
          {/* Camera overlay */}
          <div style={{
            position: "absolute", bottom: -2, right: -2,
            width: 28, height: 28, borderRadius: 14,
            background: "#2D5016", border: "2px solid #1E130A",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}>
            📷
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarUpload}
          style={{ display: "none" }}
        />
        <div style={{
          fontFamily: FONT, fontSize: 11, color: "rgba(255,255,255,0.4)",
          marginBottom: 10, cursor: "pointer",
        }} onClick={() => fileInputRef.current?.click()}>
          Tap to upload photo
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#fff",
          letterSpacing: "-0.02em", marginBottom: 2,
        }}>{userName}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "#2D5016" }}>
            HCP {handicap}
          </span>
          {ghinVerified && (
            <span style={{ fontFamily: FONT, fontSize: 11, color: "#2D5016" }}>✅</span>
          )}
        </div>
      </div>

      <div style={{ padding: "28px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Avatar Color — only show if no uploaded image */}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {avatarImage ? "Avatar Color (backup)" : "Pick Your Color"}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {AVATAR_COLORS.map(color => (
              <button key={color} onClick={() => { setAvatarColor(color); }} style={{
                width: 40, height: 40, borderRadius: 20, background: color,
                border: avatarColor === color && !avatarImage ? "3px solid #1E130A" : "3px solid transparent",
                cursor: "pointer", transition: "all 0.15s ease",
                transform: avatarColor === color && !avatarImage ? "scale(1.1)" : "scale(1)",
                boxShadow: avatarColor === color && !avatarImage ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                opacity: avatarImage ? 0.5 : 1,
              }} />
            ))}
            {avatarImage && (
              <button onClick={() => setAvatarImage(null)} style={{
                fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#DC2626",
                background: "#FEF2F2", border: "none", borderRadius: 8,
                padding: "8px 12px", cursor: "pointer", marginLeft: 4,
              }}>
                Remove photo
              </button>
            )}
          </div>
        </div>

        {/* Home Course */}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Home Course
          </div>
          <div style={{ position: "relative" }}>
            <input
              value={courseSearch}
              onChange={e => { setCourseSearch(e.target.value); setHomeCourse(null); }}
              placeholder="Search courses..."
              style={{
                width: "100%", padding: "14px 16px 14px 40px", borderRadius: 12,
                border: "1px solid #DDD0BB", fontFamily: FONT, fontSize: 14,
                background: "#FAF5EC", outline: "none", boxSizing: "border-box",
              }}
            />
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
          </div>

          {selectedCourse && !courseSearch && (
            <div style={{
              marginTop: 8, padding: "12px 14px", background: "#EEF5E5", borderRadius: 12,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              border: "1px solid #DCFCE7",
            }}>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{selectedCourse.name}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: "#8B7355" }}>{selectedCourse.city}</div>
              </div>
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#2D5016" }}>✓ Selected</span>
            </div>
          )}

          {courseSearch && (
            <div style={{
              marginTop: 6, background: "#FAF5EC", borderRadius: 14, overflow: "hidden",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)", border: "1px solid #DDD0BB",
              maxHeight: 220, overflowY: "auto",
            }}>
              {filteredCourses.map(c => (
                <button key={c.id} onClick={() => { setHomeCourse(c.id); setCourseSearch(""); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 16px", border: "none",
                    background: "transparent", cursor: "pointer", borderBottom: "1px solid #F3F4F6",
                    fontFamily: FONT,
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{c.name}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: "#A8957B" }}>{c.city}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                      background: "#EDE7D9", color: "#8B7355", textTransform: "uppercase",
                    }}>{c.type}</span>
                  </div>
                </button>
              ))}
              {filteredCourses.length === 0 && (
                <div style={{ padding: "16px", textAlign: "center", fontFamily: FONT, fontSize: 13, color: "#A8957B" }}>
                  No courses found. You can add yours later.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Location */}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            City
          </div>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Austin, TX"
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: "1px solid #DDD0BB", fontFamily: FONT, fontSize: 14,
              background: "#FAF5EC", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Complete */}
        <button
          onClick={() => onComplete({ avatarColor, homeCourse, city })}
          style={{
            width: "100%", padding: "18px", borderRadius: 14, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 16, fontWeight: 700, marginTop: 8,
            background: "#1E130A", color: "#fff",
          }}
        >
          Let's Go →
        </button>
      </div>
    </div>
  );
}

// ============================================================
// STEP: WELCOME
// ============================================================
function WelcomeScreen({ userName, handicap, ghinVerified, homeCourse, onStart, onBrowseFeed }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 100); }, []);
  const course = AUSTIN_COURSES.find(c => c.id === homeCourse);

  const tips = [
    { icon: "🏌️", title: "Start a Round", desc: "Pick your game, add your crew, set the stakes." },
    { icon: "🔨", title: "Throw Hammers", desc: "Double the hole value mid-play. Accept or fold." },
    { icon: "📡", title: "Go Live", desc: "Friends can spectate and talk trash in real-time." },
    { icon: "🍼", title: "Avoid the Crybaby", desc: "Finish last and you're wearing the title." },
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: "#F5EFE0",
      opacity: visible ? 1 : 0, transition: "opacity 0.6s ease",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #2D5016 0%, #1A3009 100%)",
        padding: "60px 32px 36px", borderRadius: "0 0 36px 36px", textAlign: "center",
      }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <div style={{
          fontFamily: FONT, fontSize: 26, fontWeight: 800, color: "#fff",
          letterSpacing: "-0.03em", marginBottom: 6,
        }}>
          You're In, {userName}
        </div>
        <div style={{
          fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.5,
        }}>
          HCP {handicap} {ghinVerified ? "✅" : "⚠️ unverified"}
          {course ? ` · ${course.name}` : ""}
        </div>
      </div>

      <div style={{ padding: "28px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{
          fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#1E130A", marginBottom: 4,
        }}>
          Here's how it works
        </div>

        {tips.map((tip, i) => (
          <div key={i} style={{
            display: "flex", gap: 14, alignItems: "center",
            padding: "14px 16px", background: "#FAF5EC", borderRadius: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(10px)",
            transition: `all 0.4s ease ${0.2 + i * 0.1}s`,
          }}>
            <span style={{ fontSize: 28 }}>{tip.icon}</span>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1E130A" }}>{tip.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#8B7355", marginTop: 2 }}>{tip.desc}</div>
            </div>
          </div>
        ))}

        <div style={{
          marginTop: 8, padding: "14px 16px", background: "#FEF3C7", borderRadius: 14,
          fontFamily: FONT, fontSize: 13, color: "#92400E", fontStyle: "italic",
          borderLeft: "3px solid #F59E0B",
        }}>
          💬 "14 days free. Full access. No credit card. After that, $5.99/mo to keep the trash talk flowing. Now go find some pigeons."
        </div>

        <button onClick={onStart} style={{
          width: "100%", padding: "18px", borderRadius: 14, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 17, fontWeight: 700, marginTop: 8,
          background: "#1E130A", color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          Start Your First Round 🏌️
        </button>

        <button onClick={onBrowseFeed} style={{
          fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#8B7355",
          background: "none", border: "none", cursor: "pointer",
        }}>
          Browse the feed first →
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT — ONBOARDING FLOW
// ============================================================
export default function CrybabOnboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState("splash");

  // If user is already logged in, redirect to feed (they've already onboarded)
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/feed", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Must be called before any early returns to satisfy React hook rules
  useEffect(() => {
    if (step === "done") {
      // Save profile data to DB
      const saveProfile = async () => {
        try {
          await updateProfile({
            display_name: userData.name || user?.email || "",
            handicap: userData.handicap,
            ghin: userData.ghin,
            ghin_verified: userData.ghinVerified,
            home_course: userData.homeCourse,
          });
        } catch (e) { console.error("Profile save error:", e); }
      };
      saveProfile();
      navigate("/feed");
    }
  }, [step, navigate]);

  const [userData, setUserData] = useState({
    name: "",
    email: "",
    ghin: "",
    handicap: null,
    ghinVerified: false,
    avatarColor: AVATAR_COLORS[0],
    homeCourse: null,
    city: "",
  });

  if (step === "splash") {
    return <SplashScreen onContinue={() => {
      if (user) {
        setUserData(prev => ({ ...prev, name: user.user_metadata?.display_name || user.email || "", email: user.email || "" }));
        setStep("ghin");
      } else {
        navigate("/auth");
      }
    }} />;
  }

  if (step === "auth") {
    // Redirect to real auth page
    navigate("/auth");
    return null;
  }

  if (step === "ghin") {
    return (
      <GHINScreen
        userName={userData.name}
        onVerified={(ghin, handicap) => {
          setUserData(prev => ({ ...prev, ghin, handicap, ghinVerified: true }));
          setStep("profile");
        }}
        onSkip={(handicap) => {
          setUserData(prev => ({ ...prev, handicap, ghinVerified: false }));
          setStep("profile");
        }}
      />
    );
  }

  if (step === "profile") {
    return (
      <ProfileSetupScreen
        userName={userData.name}
        handicap={userData.handicap}
        ghinVerified={userData.ghinVerified}
        onComplete={({ avatarColor, homeCourse, city }) => {
          setUserData(prev => ({ ...prev, avatarColor, homeCourse, city }));
          setStep("welcome");
        }}
      />
    );
  }

  if (step === "welcome") {
    return (
      <WelcomeScreen
        userName={userData.name}
        handicap={userData.handicap}
        ghinVerified={userData.ghinVerified}
        homeCourse={userData.homeCourse}
        onStart={() => setStep("done")}
        onBrowseFeed={() => navigate("/feed")}
      />
    );
  }

  return null;
}
