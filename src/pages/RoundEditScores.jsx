import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadRound, loadRoundEvents, updateRoundScoresAndSettlements, updatePlayerScores } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { replayRound, getTeamsForHole } from "@/lib/gameEngines";

const FONT = "'DM Sans', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";
const PLAYER_COLORS = ["#2D5016", "#3B82F6", "#DC2626", "#F59E0B"];

export default function RoundEditScores() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roundId = params.get("id");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbRound, setDbRound] = useState(null);
  const [dbPlayers, setDbPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [originalScores, setOriginalScores] = useState({});
  const [editedScores, setEditedScores] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { hole, playerId }
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roundId) return;
    (async () => {
      try {
        // loadRound now throws RoundLoadError instead of returning null;
        // propagate to the catch below so the error UI renders consistently.
        const data = await loadRound(roundId);
        setDbRound(data.round);
        setDbPlayers(data.players);

        const evts = await loadRoundEvents(roundId);
        setEvents(evts);

        // Build scores from round_players.hole_scores
        const scores = {};
        data.players.forEach(p => {
          if (p.hole_scores && typeof p.hole_scores === "object") {
            Object.entries(p.hole_scores).forEach(([hole, score]) => {
              if (!scores[hole]) scores[hole] = {};
              scores[hole][p.id] = score;
            });
          }
        });
        setOriginalScores(JSON.parse(JSON.stringify(scores)));
        setEditedScores(JSON.parse(JSON.stringify(scores)));
        setLoading(false);
      } catch (err) {
        setError(err.message || "Failed to load round");
        setLoading(false);
      }
    })();
  }, [roundId]);

  // Build derived player/settings objects from DB data
  const derivedPlayers = useMemo(() => {
    if (!dbRound || !dbPlayers.length) return [];
    return dbPlayers.map((p, i) => ({
      id: p.id,
      userId: p.user_id || null,
      name: p.guest_name || dbRound.course_details?.playerConfig?.[i]?.name || `Player ${i + 1}`,
      handicap: dbRound.course_details?.playerConfig?.[i]?.handicap ?? 12,
      cart: dbRound.course_details?.playerConfig?.[i]?.cart || (i < 2 ? "A" : "B"),
      position: dbRound.course_details?.playerConfig?.[i]?.position || (i % 2 === 0 ? "driver" : "rider"),
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    }));
  }, [dbRound, dbPlayers]);

  const settings = useMemo(() => {
    if (!dbRound) return null;
    const cd = dbRound.course_details || {};
    const mechanics = cd.mechanics || [];
    const ms = cd.mechanicSettings || {};
    return {
      hammer: mechanics.includes("hammer"),
      hammerInitiator: ms.hammer?.initiator || "Either team",
      hammerMaxDepth: "∞",
      crybaby: mechanics.includes("crybaby"),
      crybabHoles: ms.crybaby?.holes || 3,
      crybabHammerRule: "Only crybaby hammers",
      birdieBonus: mechanics.includes("birdie_bonus"),
      birdieMultiplier: parseInt(ms.birdie_bonus?.multiplier || "2"),
      pops: mechanics.includes("pops"),
      noPopsParThree: false,
      carryOverCap: ms.carry_overs?.cap ?? "∞",
      handicapPercent: ms.pops?.handicapPercent || 100,
      presses: mechanics.includes("presses"),
      pressType: ms.presses?.autoPress || "Optional (must request)",
    };
  }, [dbRound]);

  const pars = dbRound?.course_details?.pars || [];
  const handicaps = dbRound?.course_details?.handicaps || [];
  const holeValue = dbRound?.course_details?.holeValue ?? 5;
  const gameMode = dbRound?.game_type || "skins";
  const isWolf = gameMode === "wolf";
  const isSolo = gameMode === "solo";
  const canRecalcMoney = !isWolf && !isSolo;

  // Reconstruct hammer history from game_state or events
  const hammerHistory = useMemo(() => {
    if (!dbRound) return [];
    const saved = dbRound.course_details?.game_state?.hammerHistory;
    if (saved && saved.length > 0) return saved;

    // Fallback: reconstruct from round_events
    const history = [];
    for (let h = 1; h <= 18; h++) {
      const hammersOnHole = events.filter(e => e.event_type === "hammer" && e.hole_number === h);
      const foldOnHole = events.find(e => e.event_type === "hammer_fold" && e.hole_number === h);
      // For fold winner, check which team won from the team_win event
      let foldWinnerTeamId = null;
      if (foldOnHole) {
        const winEvent = events.find(e => e.event_type === "team_win" && e.hole_number === h);
        if (winEvent?.event_data?.winnerName) {
          // Map team name back to A/B using teams for this hole
          const teams = getTeamsForHole(gameMode, h, derivedPlayers);
          if (teams) {
            foldWinnerTeamId = teams.teamA.name === winEvent.event_data.winnerName ? "A" : "B";
          }
        }
      }
      history.push({
        hole: h,
        hammerDepth: hammersOnHole.length,
        folded: !!foldOnHole,
        foldWinnerTeamId,
      });
    }
    return history;
  }, [dbRound, events, derivedPlayers, gameMode]);

  // Live replay: recalculate money on every score change
  const previewResult = useMemo(() => {
    if (!dbRound || !settings || !derivedPlayers.length || !canRecalcMoney) return null;
    const holes = [];
    for (let h = 1; h <= 18; h++) {
      const hh = hammerHistory.find(x => x.hole === h);
      const holeScores = editedScores[String(h)] || {};
      // Skip holes without scores
      if (!Object.keys(holeScores).length) continue;
      holes.push({
        holeNumber: h,
        scores: holeScores,
        hammerDepth: hh?.hammerDepth || 0,
        folded: hh?.folded || false,
        foldWinnerTeamId: hh?.foldWinnerTeamId || undefined,
      });
    }
    if (holes.length === 0) return null;
    try {
      return replayRound(gameMode, derivedPlayers, pars, handicaps, holeValue, settings, holes);
    } catch {
      return null;
    }
  }, [editedScores, dbRound, settings, derivedPlayers, hammerHistory, gameMode, pars, handicaps, holeValue, canRecalcMoney]);

  // Original totals from game_state
  const originalTotals = dbRound?.course_details?.game_state?.totals || {};

  const hasChanges = JSON.stringify(originalScores) !== JSON.stringify(editedScores);

  function handleScoreEdit(hole, playerId, newScore) {
    const clamped = Math.max(1, Math.min(15, newScore));
    setEditedScores(prev => ({
      ...prev,
      [String(hole)]: { ...prev[String(hole)], [playerId]: clamped },
    }));
  }

  async function handleSave() {
    if (!roundId || !dbRound) return;
    setSaving(true);
    try {
      const newTotals = previewResult?.totals || {};

      // Build player updates
      const playerUpdates = derivedPlayers.map(p => {
        const holeScores = {};
        for (let h = 1; h <= 18; h++) {
          if (editedScores[String(h)]?.[p.id] != null) {
            holeScores[String(h)] = editedScores[String(h)][p.id];
          }
        }
        return {
          playerId: p.id,
          holeScores,
          totalScore: canRecalcMoney ? (newTotals[p.id] || 0) : Object.values(holeScores).reduce((s, v) => s + v, 0),
        };
      });

      // Build settlements
      const settlements = derivedPlayers.map(p => ({
        userId: p.userId || null,
        guestName: p.userId ? null : p.name,
        amount: newTotals[p.id] || 0,
      }));

      if (canRecalcMoney) {
        await updateRoundScoresAndSettlements(roundId, playerUpdates, settlements);
      } else {
        // Wolf/solo: just update scores, don't touch settlements
        for (const pu of playerUpdates) {
          await updatePlayerScores(pu.playerId, pu.holeScores, pu.totalScore);
        }
      }

      navigate(-1);
    } catch (err) {
      console.error("Failed to save edited scores:", err);
      setSaving(false);
    }
  }

  // --- RENDER ---

  if (loading) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#8B7355" }}>Loading scorecard...</div>
        </div>
      </div>
    );
  }

  if (error || !dbRound) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⛳</div>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 22, color: "#1E130A", marginBottom: 8 }}>Round Not Found</div>
          <div style={{ fontSize: 14, color: "#8B7355", lineHeight: 1.5, marginBottom: 28 }}>
            {error || "This round may have ended or the link is no longer valid."}
          </div>
          <button onClick={() => navigate(-1)} style={{ padding: "14px 24px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 15, fontWeight: 700, background: "#1E130A", color: "#FAF5EC" }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Access control
  if (user?.id !== dbRound.created_by) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 22, color: "#1E130A", marginBottom: 8 }}>Access Denied</div>
          <div style={{ fontSize: 14, color: "#8B7355", lineHeight: 1.5, marginBottom: 28 }}>
            Only the round creator can edit scores.
          </div>
          <button onClick={() => navigate(-1)} style={{ padding: "14px 24px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 15, fontWeight: 700, background: "#1E130A", color: "#FAF5EC" }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const totalHoles = pars.length || 18;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", fontFamily: FONT }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(245,239,224,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #DDD0BB", padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 20, color: "#1E130A", padding: 4,
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 18, color: "#1E130A" }}>Edit Scores</div>
          <div style={{ fontSize: 12, color: "#8B7355" }}>{dbRound.course} · {gameMode.replace(/_/g, " ")}</div>
        </div>
        <button
          onClick={() => hasChanges ? setShowConfirm(true) : null}
          disabled={!hasChanges || saving}
          style={{
            padding: "8px 16px", borderRadius: 10, border: "none", cursor: hasChanges ? "pointer" : "default",
            fontFamily: FONT, fontSize: 13, fontWeight: 700,
            background: hasChanges ? "#2D5016" : "#DDD0BB",
            color: hasChanges ? "#fff" : "#A8957B",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Wolf/Solo info banner */}
      {isWolf && (
        <div style={{ margin: "12px 16px", padding: "10px 14px", borderRadius: 12, background: "#FAF5EC", border: "1px solid #DDD0BB", fontSize: 13, color: "#8B7355", lineHeight: 1.4 }}>
          Wolf partner selections aren't recorded — only stroke scores will update. Money stays as-is.
        </div>
      )}
      {isSolo && (
        <div style={{ margin: "12px 16px", padding: "10px 14px", borderRadius: 12, background: "#FAF5EC", border: "1px solid #DDD0BB", fontSize: 13, color: "#8B7355", lineHeight: 1.4 }}>
          Solo round — updating stroke scores only.
        </div>
      )}

      {/* Scorecard Grid */}
      <div style={{ overflowX: "auto", padding: "12px 0" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: derivedPlayers.length > 2 ? 420 : 320 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #DDD0BB" }}>
              <th style={thStyle}>Hole</th>
              <th style={thStyle}>Par</th>
              {derivedPlayers.map((p, i) => (
                <th key={p.id} style={{ ...thStyle, color: PLAYER_COLORS[i % PLAYER_COLORS.length], maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalHoles }, (_, i) => {
              const hole = i + 1;
              const par = pars[i];
              return (
                <tr key={hole} style={{ borderBottom: "1px solid #EDE6D6" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#1E130A" }}>{hole}</td>
                  <td style={{ ...tdStyle, color: "#8B7355" }}>{par}</td>
                  {derivedPlayers.map(p => {
                    const score = editedScores[String(hole)]?.[p.id];
                    const orig = originalScores[String(hole)]?.[p.id];
                    const changed = score != null && orig != null && score !== orig;
                    const diff = score != null ? score - par : 0;
                    const isEditing = editingCell?.hole === hole && editingCell?.playerId === p.id;

                    if (isEditing) {
                      return (
                        <td key={p.id} style={{ ...tdStyle, padding: "4px 2px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                            <button onClick={() => handleScoreEdit(hole, p.id, (score || par) - 1)} style={stepBtn}>−</button>
                            <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, minWidth: 24, textAlign: "center", color: "#1E130A" }}>
                              {score ?? par}
                            </span>
                            <button onClick={() => handleScoreEdit(hole, p.id, (score || par) + 1)} style={stepBtn}>+</button>
                            <button onClick={() => setEditingCell(null)} style={{ ...stepBtn, background: "#2D5016", color: "#fff", fontSize: 11 }}>OK</button>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={p.id} style={{ ...tdStyle, padding: "4px 2px" }}>
                        <button
                          onClick={() => {
                            if (score == null) handleScoreEdit(hole, p.id, par);
                            setEditingCell({ hole, playerId: p.id });
                          }}
                          style={{
                            fontFamily: MONO, fontSize: 15, fontWeight: 700,
                            width: 36, height: 36, borderRadius: 8,
                            border: changed ? "2px solid #F59E0B" : "1px solid #DDD0BB",
                            background: changed ? "#FEF3C7" : score == null ? "#F5EFE0" : diff < 0 ? "#EEF5E5" : diff > 0 ? "#FEF2F2" : "#FAF5EC",
                            color: score == null ? "#A8957B" : diff < 0 ? "#2D5016" : diff > 0 ? "#DC2626" : "#1E130A",
                            cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {score ?? "–"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ borderTop: "2px solid #DDD0BB" }}>
              <td style={{ ...tdStyle, fontWeight: 800, color: "#1E130A" }}>TOT</td>
              <td style={{ ...tdStyle, fontWeight: 700, color: "#8B7355" }}>
                {pars.reduce((s, p) => s + p, 0)}
              </td>
              {derivedPlayers.map(p => {
                let total = 0;
                for (let h = 1; h <= totalHoles; h++) {
                  total += editedScores[String(h)]?.[p.id] || 0;
                }
                return (
                  <td key={p.id} style={{ ...tdStyle, fontWeight: 800 }}>
                    <span style={{ fontFamily: MONO, fontSize: 15, color: "#1E130A" }}>{total || "–"}</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Money Preview */}
      {canRecalcMoney && previewResult && hasChanges && (
        <div style={{ margin: "8px 16px 16px", padding: 16, borderRadius: 16, background: "#FAF5EC", border: "1px solid #DDD0BB" }}>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 16, color: "#1E130A", marginBottom: 12 }}>
            Updated Settlement
          </div>
          {derivedPlayers.map((p, i) => {
            const oldAmt = originalTotals[p.id] || 0;
            const newAmt = previewResult.totals[p.id] || 0;
            const changed = oldAmt !== newAmt;
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < derivedPlayers.length - 1 ? "1px solid #EDE6D6" : "none" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {changed && (
                    <span style={{ fontFamily: MONO, fontSize: 13, color: "#A8957B", textDecoration: "line-through" }}>
                      {oldAmt >= 0 ? "+" : ""}${oldAmt}
                    </span>
                  )}
                  <span style={{
                    fontFamily: MONO, fontSize: 15, fontWeight: 800,
                    color: newAmt > 0 ? "#2D5016" : newAmt < 0 ? "#DC2626" : "#1E130A",
                  }}>
                    {newAmt >= 0 ? "+" : ""}${newAmt}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom padding */}
      <div style={{ height: 40 }} />

      {/* Confirmation Modal */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "#FAF5EC", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%",
            border: "2px solid #DDD0BB", textAlign: "center",
          }}>
            <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 20, color: "#1E130A", marginBottom: 8 }}>
              Save Changes?
            </div>
            <div style={{ fontSize: 14, color: "#8B7355", lineHeight: 1.5, marginBottom: 20 }}>
              {canRecalcMoney
                ? "Scores and money will be recalculated based on your edits."
                : "Stroke scores will be updated."}
            </div>

            {/* Show changed holes summary */}
            {(() => {
              const changedHoles = [];
              for (let h = 1; h <= totalHoles; h++) {
                for (const p of derivedPlayers) {
                  const orig = originalScores[String(h)]?.[p.id];
                  const edited = editedScores[String(h)]?.[p.id];
                  if (orig != null && edited != null && orig !== edited) {
                    changedHoles.push({ hole: h, player: p.name.split(" ")[0], from: orig, to: edited });
                  }
                }
              }
              if (!changedHoles.length) return null;
              return (
                <div style={{ marginBottom: 16, textAlign: "left" }}>
                  {changedHoles.map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#1E130A", padding: "3px 0", fontFamily: MONO }}>
                      Hole {c.hole} · {c.player}: {c.from} → {c.to}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{
                flex: 1, padding: "14px", borderRadius: 14,
                border: "2px solid #DDD0BB", background: "#FAF5EC",
                fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#1E130A", cursor: "pointer",
              }}>
                Cancel
              </button>
              <button onClick={() => { setShowConfirm(false); handleSave(); }} style={{
                flex: 1, padding: "14px", borderRadius: 14,
                border: "none", background: "#2D5016",
                fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer",
              }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Style helpers ---
const thStyle = {
  padding: "8px 6px", textAlign: "center", fontSize: 12, fontWeight: 700,
  fontFamily: "'DM Sans', system-ui, sans-serif", color: "#8B7355",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "6px 4px", textAlign: "center", fontSize: 14,
  fontFamily: "'JetBrains Mono', monospace",
};

const stepBtn = {
  width: 26, height: 26, borderRadius: 6, border: "1px solid #DDD0BB",
  background: "#FAF5EC", cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 14, fontWeight: 700, color: "#1E130A",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
