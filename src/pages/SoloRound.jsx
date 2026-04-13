import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import CourseSearch from "@/components/CourseSearch";
import { ChevronLeft } from "lucide-react";

const font = "'DM Sans', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'SF Mono', monospace";

// Score vs par label + color
function scorePill(diff) {
  if (diff <= -2) return { label: "Eagle", bg: "#1A5C2A", color: "#fff" };
  if (diff === -1) return { label: "Birdie", bg: "#2D5016", color: "#fff" };
  if (diff === 0)  return { label: "Par",    bg: "#EDE7D9", color: "#8B7355" };
  if (diff === 1)  return { label: "Bogey",  bg: "#F5EFE0", color: "#A8957B" };
  if (diff === 2)  return { label: "Double", bg: "#FEF0E7", color: "#C05C1A" };
  return              { label: `+${diff}`,   bg: "#FEE2E2", color: "#B91C1C" };
}

function totalDisplay(totalDiff) {
  if (totalDiff < 0) return { text: `${totalDiff}`, color: "#2D5016" };
  if (totalDiff === 0) return { text: "E", color: "#8B7355" };
  return { text: `+${totalDiff}`, color: "#C05C1A" };
}

export default function SoloRound() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Phase A state ──
  const [course, setCourse] = useState(null);
  const [selectedTee, setSelectedTee] = useState(null);
  const [phase, setPhase] = useState("setup"); // "setup" | "scorecard"

  // ── Phase B state ──
  const [scores, setScores] = useState([]);
  const [saving, setSaving] = useState(false);

  // Derived
  const holes = course?.pars?.length ?? 18;
  const totalStrokes = scores.reduce((a, b) => a + b, 0);
  const totalPar = course ? course.pars.slice(0, scores.length).reduce((a, b) => a + b, 0) : 0;
  const totalDiff = totalStrokes - totalPar;

  function startScorecard() {
    setScores(course.pars.map(p => p)); // initialise each hole to par
    setPhase("scorecard");
  }

  function adjust(holeIdx, delta) {
    setScores(prev => {
      const next = [...prev];
      next[holeIdx] = Math.max(1, next[holeIdx] + delta);
      return next;
    });
  }

  async function finishRound() {
    if (!user || !course) return;
    setSaving(true);
    try {
      await supabase.from("rounds").insert({
        created_by: user.id,
        game_type: "solo",
        course: course.name,
        course_details: {
          city: course.city ?? "",
          state: course.state ?? "",
          pars: course.pars,
          handicaps: course.handicaps,
          selectedTee,
          tees: course.tees,
          scores,
          totalStrokes,
          totalDiff,
          holes,
        },
        stakes: null,
        status: "complete",
        scorekeeper_mode: false,
        is_broadcast: false,
      });
      navigate("/feed");
    } catch (err) {
      console.error("Failed to save solo round:", err);
      setSaving(false);
    }
  }

  // ── SETUP PHASE ──
  if (phase === "setup") {
    return (
      <div style={{
        maxWidth: 420, margin: "0 auto", minHeight: "100vh",
        background: "#F5EFE0", fontFamily: font,
        paddingBottom: 120, paddingTop: 12,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 8px" }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#8B7355", padding: 4, borderRadius: 8 }}
          >
            <ChevronLeft size={22} />
          </button>
          <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 22, color: "#2D5016", lineHeight: 1 }}>
            Keep Score
          </span>
        </div>

        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Course search */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#8B7355", marginBottom: 8, letterSpacing: "0.02em" }}>
              SELECT COURSE
            </div>
            <CourseSearch
              value={course?.name}
              onSelect={c => { setCourse(c); setSelectedTee(null); }}
              placeholder="Search for a course…"
            />
          </div>

          {/* Tee selector */}
          {course && course.tees?.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#8B7355", marginBottom: 10, letterSpacing: "0.02em" }}>
                SELECT TEES
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {course.tees.map(tee => (
                  <button
                    key={tee.name}
                    onClick={() => setSelectedTee(tee.name)}
                    style={{
                      flex: 1, padding: "12px 10px", borderRadius: 12,
                      cursor: "pointer",
                      background: selectedTee === tee.name ? "#2D5016" : "#FAF5EC",
                      color: selectedTee === tee.name ? "#fff" : "#1E130A",
                      border: selectedTee === tee.name ? "none" : "1px solid #DDD0BB",
                      boxShadow: selectedTee === tee.name ? "0 2px 8px rgba(45,80,22,0.2)" : "0 1px 3px rgba(0,0,0,0.06)",
                      transition: "all 0.18s ease",
                    }}
                  >
                    <div style={{ fontFamily: font, fontSize: 14, fontWeight: 700 }}>{tee.name}</div>
                    <div style={{ fontFamily: mono, fontSize: 11, marginTop: 3, opacity: 0.75 }}>
                      {tee.yardage ? `${tee.yardage}y` : ""}
                    </div>
                    {tee.slope && tee.rating && (
                      <div style={{ fontFamily: mono, fontSize: 10, marginTop: 1, opacity: 0.55 }}>
                        {tee.slope} / {tee.rating}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No tees fallback — course with no tee data */}
          {course && (!course.tees || course.tees.length === 0) && (
            <div style={{
              padding: "12px 14px", borderRadius: 12,
              background: "#FAF5EC", border: "1px solid #DDD0BB",
              fontSize: 13, color: "#8B7355",
            }}>
              ⛳ {course.name} · {course.holes ?? 18} holes
            </div>
          )}
        </div>

        {/* Start button — fixed bottom */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, padding: "16px 16px 32px", background: "linear-gradient(to top, #F5EFE0 70%, transparent)" }}>
          <button
            onClick={startScorecard}
            disabled={!course || (course.tees?.length > 0 && !selectedTee)}
            style={{
              width: "100%", padding: "16px", borderRadius: 16, border: "none",
              background: (!course || (course.tees?.length > 0 && !selectedTee)) ? "#DDD0BB" : "#2D5016",
              color: (!course || (course.tees?.length > 0 && !selectedTee)) ? "#A8957B" : "#fff",
              fontFamily: "'Pacifico', cursive", fontSize: 18,
              cursor: (!course || (course.tees?.length > 0 && !selectedTee)) ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow: (!course || (course.tees?.length > 0 && !selectedTee)) ? "none" : "0 4px 16px rgba(45,80,22,0.25)",
            }}
          >
            Start Scorecard →
          </button>
        </div>
      </div>
    );
  }

  // ── SCORECARD PHASE ──
  const frontNine = course.pars.slice(0, 9);
  const backNine  = course.pars.slice(9);
  const frontScore = scores.slice(0, 9).reduce((a, b) => a + b, 0);
  const frontPar   = frontNine.reduce((a, b) => a + b, 0);
  const backScore  = scores.slice(9).reduce((a, b) => a + b, 0);
  const backPar    = backNine.reduce((a, b) => a + b, 0);

  const tot = totalDisplay(totalDiff);

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F5EFE0", fontFamily: font,
      paddingBottom: 140,
    }}>

      {/* Sticky header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "#FAF5EC", borderBottom: "1px solid #DDD0BB",
        padding: "14px 16px 12px",
        paddingTop: "max(14px, env(safe-area-inset-top, 14px))",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => setPhase("setup")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#8B7355", padding: 4, borderRadius: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}
          >
            <ChevronLeft size={17} /> Course
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: "#8B7355", letterSpacing: "0.02em" }}>
              {course.name}
              {selectedTee && <span style={{ opacity: 0.7 }}> · {selectedTee}</span>}
            </div>
          </div>
          {/* Running total */}
          <div style={{
            fontFamily: "'Pacifico', cursive", fontSize: 24, color: tot.color, lineHeight: 1,
          }}>
            {tot.text}
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Section label helper */}
        {[
          { label: "Front 9", startIdx: 0, pars: frontNine, sectionScore: frontScore, sectionPar: frontPar },
          ...(holes > 9 ? [{ label: "Back 9", startIdx: 9, pars: backNine, sectionScore: backScore, sectionPar: backPar }] : []),
        ].map(({ label, startIdx, pars, sectionScore, sectionPar }) => (
          <div key={label}>
            {/* Section header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingLeft: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8B7355", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
              <span style={{ fontFamily: mono, fontSize: 12, color: "#8B7355" }}>
                {sectionScore} <span style={{ opacity: 0.5 }}>/ {sectionPar} par</span>
              </span>
            </div>

            {/* Hole cards */}
            {pars.map((par, i) => {
              const holeIdx = startIdx + i;
              const score   = scores[holeIdx] ?? par;
              const diff    = score - par;
              const hcp     = course.handicaps?.[holeIdx];
              const pill    = scorePill(diff);

              return (
                <div key={holeIdx} style={{
                  background: "#FAF5EC", borderRadius: 14,
                  border: "1px solid #DDD0BB",
                  padding: "12px 14px",
                  display: "flex", alignItems: "center",
                  marginBottom: 6,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                  {/* Hole number + meta */}
                  <div style={{ width: 44, flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "#1E130A", lineHeight: 1 }}>
                      {holeIdx + 1}
                    </div>
                    <div style={{ fontSize: 10, color: "#A8957B", marginTop: 2 }}>
                      par {par}{hcp ? ` · H${hcp}` : ""}
                    </div>
                  </div>

                  {/* Score pill */}
                  <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      background: pill.bg, color: pill.color,
                      letterSpacing: "0.02em",
                    }}>{pill.label}</span>
                  </div>

                  {/* +/- controls */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <button
                      onClick={() => adjust(holeIdx, -1)}
                      style={{
                        width: 38, height: 38, borderRadius: "10px 0 0 10px",
                        border: "1px solid #DDD0BB", borderRight: "none",
                        background: "#EDE7D9", cursor: "pointer",
                        fontSize: 20, fontWeight: 300, color: "#2D5016",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >−</button>
                    <div style={{
                      width: 46, height: 38,
                      border: "1px solid #DDD0BB",
                      background: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: mono, fontSize: 20, fontWeight: 700, color: "#1E130A",
                    }}>{score}</div>
                    <button
                      onClick={() => adjust(holeIdx, +1)}
                      style={{
                        width: 38, height: 38, borderRadius: "0 10px 10px 0",
                        border: "1px solid #DDD0BB", borderLeft: "none",
                        background: "#EDE7D9", cursor: "pointer",
                        fontSize: 20, fontWeight: 300, color: "#2D5016",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Totals summary card */}
        <div style={{
          background: "#2D5016", borderRadius: 16, padding: "16px 18px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 4,
          boxShadow: "0 4px 16px rgba(45,80,22,0.2)",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em", marginBottom: 4 }}>
              TOTAL
            </div>
            <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: "#fff" }}>
              {totalStrokes}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em", marginBottom: 4 }}>
              TO PAR
            </div>
            <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 32, color: "#D4AF37", lineHeight: 1 }}>
              {tot.text}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky finish button */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 420,
        padding: "16px 16px 32px",
        background: "linear-gradient(to top, #F5EFE0 70%, transparent)",
      }}>
        <button
          onClick={finishRound}
          disabled={saving}
          style={{
            width: "100%", padding: "16px", borderRadius: 16, border: "none",
            background: saving ? "#DDD0BB" : "#D4AF37",
            color: saving ? "#A8957B" : "#1E130A",
            fontFamily: "'Pacifico', cursive", fontSize: 18,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "0 4px 16px rgba(212,175,55,0.35)",
            transition: "all 0.2s ease",
          }}
        >
          {saving ? "Saving…" : "Finish Round ⛳"}
        </button>
      </div>
    </div>
  );
}
