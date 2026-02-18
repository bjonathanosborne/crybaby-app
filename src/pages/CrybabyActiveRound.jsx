import { useState, useEffect, useRef, useCallback } from "react";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loadRound, updatePlayerScores, completeRound, createPost, saveAICommentary, insertSettlements, createRoundEvent } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import RoundLiveFeed from "@/components/RoundLiveFeed";

// ============================================================
// CRYBABY — Active Round / Score Entry
// Core scoring interface — one scorekeeper, hole-by-hole
// ============================================================

const FONT = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

const PLAYER_COLORS = ["#16A34A", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899"];

// --- TEAM LOGIC ---
function getTeams(holeNumber, players) {
  const drivers = players.filter(p => p.position === "driver");
  const riders = players.filter(p => p.position === "rider");
  const cartA = players.filter(p => p.cart === "A");
  const cartB = players.filter(p => p.cart === "B");

  if (holeNumber <= 5) {
    // Drivers vs Riders
    return {
      teamA: { name: "Drivers", players: drivers, color: "#16A34A" },
      teamB: { name: "Riders", players: riders, color: "#8B5CF6" },
    };
  } else if (holeNumber <= 10) {
    // Others (cross-cart)
    const othersA = [
      players.find(p => p.cart === "A" && p.position === "driver"),
      players.find(p => p.cart === "B" && p.position === "rider"),
    ].filter(Boolean);
    const othersB = [
      players.find(p => p.cart === "B" && p.position === "driver"),
      players.find(p => p.cart === "A" && p.position === "rider"),
    ].filter(Boolean);
    return {
      teamA: { name: "Others 1", players: othersA, color: "#F59E0B" },
      teamB: { name: "Others 2", players: othersB, color: "#EC4899" },
    };
  } else if (holeNumber <= 15) {
    // Carts
    return {
      teamA: { name: "Cart A", players: cartA, color: "#3B82F6" },
      teamB: { name: "Cart B", players: cartB, color: "#DC2626" },
    };
  } else {
    // Crybaby holes — teams set dynamically
    return null;
  }
}

function getStrokesOnHole(playerHandicap, lowestHandicap, holeHandicapRank) {
  const diff = playerHandicap - lowestHandicap;
  if (diff <= 0) return 0;
  if (diff >= 18 + holeHandicapRank) return 2;
  if (diff >= holeHandicapRank) return 1;
  return 0;
}

// --- COMMENTATOR ---
const QUIPS = {
  birdie: [
    "{player} just cashed a gross birdie. The pot doubles. 💰",
    "Gross birdie from {player}. No net nonsense — that's a real one. Hole value doubled.",
    "{player} going low. Gross birdie doubles the pot — somebody's wallet just got lighter.",
  ],
  birdie_negated: [
    "{player} made a gross birdie, but the other team covered with a net birdie. Forced push. 🛡️",
    "Gross birdie from {player} — but the net birdie says nah. Push. Nobody wins.",
    "Net birdie cancels the gross birdie. Hole is a push. The pot lives to fight another hole.",
  ],
  eagle: [
    "EAGLE. {player} just made it rain. 🦅",
    "{player} with the eagle. That hole just became everybody's problem.",
  ],
  bogey_or_worse: [
    "{player} carded a {score}. Moving on.",
    "A {scoreWord} from {player}. The group chat will hear about this.",
    "{player} with the {scoreWord}. We don't talk about this hole.",
  ],
  push: [
    "Push. Nobody wins. The pot grows. 🤝",
    "Tied up. Carry-over building. Things are about to get spicy.",
    "All square. The tension is palpable. Or maybe that's just the humidity.",
  ],
  team_win: [
    "{team} takes the hole. ${amount} changes hands.",
    "${amount} to {team}. Clean.",
    "{team} cashes in. {losingTeam} looking at the scorecard like it's in a different language.",
  ],
  hammer_thrown: [
    "🔨 HAMMER. {team} just doubled it. Accept or fold?",
    "The hammer drops. {team} smells blood.",
    "🔨 {team} brings the hammer. This hole is now worth ${amount}.",
  ],
  hammer_back: [
    "🔨 HAMMER BACK. Oh, it's on now.",
    "They hammered back! This hole just got reckless.",
    "Hammer returned. The hole value is getting stupid. ${amount} on the line.",
  ],
  hammer_back_deep: [
    "Another hammer back. This hole costs more than the green fee. ${amount}.",
    "These two teams have chosen violence. ${amount} on a single hole.",
    "At this point, somebody's paying for dinner. ${amount} and climbing.",
  ],
  hammer_accepted: [
    "Accepted. This hole just got expensive. 🔥",
    "They took the hammer. Brave or stupid — we'll find out in a minute.",
    "Hammer accepted. The stakes have doubled. Let's see who blinks.",
  ],
  hammer_folded: [
    "🐔 Folded. {team} concedes. Probably the smart play.",
    "They folded. Discretion is the better part of not losing more money.",
    "{team} folds. The chicken emoji writes itself.",
  ],
  big_swing: [
    "That's a ${amount} swing. Someone just felt that in their chest.",
    "${amount} just moved. This is why we play.",
  ],
  crybaby_designated: [
    "🍼 {player} is the crybaby. Down ${amount}. Time for redemption — or humiliation.",
    "Ladies and gentlemen, your crybaby: {player}. Currently holding the bag at -${amount}.",
  ],
};

function getQuip(type, vars = {}) {
  const options = QUIPS[type] || ["..."];
  let quip = options[Math.floor(Math.random() * options.length)];
  Object.entries(vars).forEach(([k, v]) => {
    quip = quip.replace(new RegExp(`{${k}}`, "g"), v);
  });
  return quip;
}

function getScoreWord(score, par) {
  const diff = score - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double bogey";
  return "triple+";
}

// --- COMPONENTS ---

function HoleHeader({ holeNumber, par, handicap, yardage, phase }) {
  const phaseLabels = { drivers: "Drivers", others: "Others", carts: "Carts", crybaby: "Crybaby" };
  const phaseColors = { drivers: "#16A34A", others: "#F59E0B", carts: "#3B82F6", crybaby: "#DC2626" };
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 20px", background: "#fff", borderBottom: "1px solid #F3F4F6",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: "#1A1A1A",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#fff",
        }}>{holeNumber}</div>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Par {par}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#9CA3AF" }}>HCP {handicap}</span>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
            background: phaseColors[phase] + "14",
            color: phaseColors[phase],
            fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {phaseLabels[phase]}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#9CA3AF" }}>
          {holeNumber}/18
        </div>
      </div>
    </div>
  );
}

function TeamBanner({ teams, holeValue, hammerDepth }) {
  if (!teams) return null;
  const effectiveValue = holeValue * Math.pow(2, hammerDepth);
  return (
    <div style={{
      display: "flex", gap: 8, padding: "12px 20px",
    }}>
      <div style={{
        flex: 1, padding: "10px 14px", borderRadius: 12,
        background: teams.teamA.color + "10",
        borderLeft: `3px solid ${teams.teamA.color}`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: teams.teamA.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {teams.teamA.name}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#1A1A1A", fontWeight: 500, marginTop: 3 }}>
          {teams.teamA.players.map(p => p.name).join(" & ")}
        </div>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minWidth: 56,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>HOLE</div>
        <div style={{
          fontFamily: MONO, fontSize: hammerDepth >= 3 ? 16 : 18, fontWeight: 800,
          color: hammerDepth >= 3 ? "#7F1D1D" : hammerDepth >= 2 ? "#DC2626" : hammerDepth >= 1 ? "#F59E0B" : "#1A1A1A",
          transition: "all 0.3s ease",
        }}>
          ${effectiveValue}
        </div>
        {hammerDepth > 0 && (
          <div style={{
            fontSize: 9, fontWeight: 700,
            color: hammerDepth >= 3 ? "#7F1D1D" : hammerDepth >= 2 ? "#DC2626" : "#F59E0B",
          }}>
            {"🔨".repeat(Math.min(hammerDepth, 4))} ×{Math.pow(2, hammerDepth)}
          </div>
        )}
      </div>
      <div style={{
        flex: 1, padding: "10px 14px", borderRadius: 12,
        background: teams.teamB.color + "10",
        borderRight: `3px solid ${teams.teamB.color}`,
        textAlign: "right",
      }}>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: teams.teamB.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {teams.teamB.name}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#1A1A1A", fontWeight: 500, marginTop: 3 }}>
          {teams.teamB.players.map(p => p.name).join(" & ")}
        </div>
      </div>
    </div>
  );
}

function ScoreInput({ player, par, score, strokes, onScoreChange }) {
  const netScore = score !== null ? score - strokes : null;
  const diff = netScore !== null ? netScore - par : null;
  const diffColor = diff === null ? "#9CA3AF" : diff < 0 ? "#16A34A" : diff > 0 ? "#DC2626" : "#1A1A1A";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "#fff", borderRadius: 14,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18, background: player.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT, flexShrink: 0,
      }}>{player.name[0]}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{player.name}</span>
          {strokes > 0 && (
            <span style={{
              fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
              background: "#EEF2FF", color: "#4F46E5",
            }}>
              {strokes === 1 ? "•" : "••"}
            </span>
          )}
        </div>
        {netScore !== null && score !== netScore && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
            gross {score} → net {netScore}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => onScoreChange(player.id, Math.max(1, (score || par) - 1))}
          style={{
            width: 40, height: 40, borderRadius: 12, border: "none",
            background: "#F3F4F6", cursor: "pointer",
            fontSize: 20, fontWeight: 600, color: "#6B7280",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >−</button>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: score !== null ? (diff < 0 ? "#F0FDF4" : diff > 0 ? "#FEF2F2" : "#F9FAFB") : "#F9FAFB",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 22, fontWeight: 800, color: diffColor,
          border: score !== null ? `2px solid ${diffColor}20` : "2px solid #E5E7EB",
          transition: "all 0.2s ease",
        }}>
          {score !== null ? score : "–"}
        </div>
        <button
          onClick={() => onScoreChange(player.id, (score || par) + 1)}
          style={{
            width: 40, height: 40, borderRadius: 12, border: "none",
            background: "#F3F4F6", cursor: "pointer",
            fontSize: 20, fontWeight: 600, color: "#6B7280",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >+</button>
      </div>
    </div>
  );
}

function Leaderboard({ players, totals, currentCrybaby }) {
  const sorted = [...players].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
  return (
    <div style={{
      background: "#fff", borderRadius: 16, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        padding: "12px 16px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Standings
        </span>
        <span style={{ fontFamily: FONT, fontSize: 11, color: "#9CA3AF" }}>
          P&L
        </span>
      </div>
      {sorted.map((player, i) => {
        const amount = totals[player.id] || 0;
        const isCrybaby = currentCrybaby === player.id;
        return (
          <div key={player.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
            borderBottom: i < sorted.length - 1 ? "1px solid #F9FAFB" : "none",
            background: isCrybaby ? "#FEF2F2" : "transparent",
          }}>
            <span style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#D1D5DB",
              width: 18, textAlign: "center",
            }}>{i + 1}</span>
            <div style={{
              width: 28, height: 28, borderRadius: 14, background: player.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: FONT,
            }}>{player.name[0]}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{player.name}</span>
              {isCrybaby && <span style={{ marginLeft: 6, fontSize: 12 }}>🍼</span>}
            </div>
            <span style={{
              fontFamily: MONO, fontSize: 15, fontWeight: 800,
              color: amount > 0 ? "#16A34A" : amount < 0 ? "#DC2626" : "#9CA3AF",
            }}>
              {amount >= 0 ? "+" : ""}${amount}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HammerModal({ teams, currentValue, hammerDepth, lastHammerBy, onThrow, onAccept, onFold }) {
  // If no hammer thrown yet, show team selection for who throws
  // If hammer is pending (just thrown), show accept/fold for the OTHER team
  const isPending = lastHammerBy !== null;
  const throwingTeam = isPending ? (lastHammerBy === "A" ? teams.teamA : teams.teamB) : null;
  const receivingTeam = isPending ? (lastHammerBy === "A" ? teams.teamB : teams.teamA) : null;
  const isHammerBack = hammerDepth > 0 && isPending;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "32px 28px", maxWidth: 360, width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{"🔨".repeat(Math.min(hammerDepth + 1, 5))}</div>
        <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1A1A1A", marginBottom: 4 }}>
          {hammerDepth === 0 ? "HAMMER" : hammerDepth === 1 ? "HAMMER BACK" : `HAMMER ${"BACK ".repeat(Math.min(hammerDepth, 3))}`.trim()}
        </div>

        {!isPending ? (
          <>
            {/* Who's throwing? */}
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#6B7280", marginBottom: 20 }}>
              Which team is throwing the hammer?
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button onClick={() => onThrow("A")} style={{
                flex: 1, padding: "16px 12px", borderRadius: 14, border: "none", cursor: "pointer",
                background: teams.teamA.color + "14", fontFamily: FONT,
                transition: "all 0.15s ease",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: teams.teamA.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {teams.teamA.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginTop: 4 }}>
                  {teams.teamA.players.map(p => p.name).join(" & ")}
                </div>
              </button>
              <button onClick={() => onThrow("B")} style={{
                flex: 1, padding: "16px 12px", borderRadius: 14, border: "none", cursor: "pointer",
                background: teams.teamB.color + "14", fontFamily: FONT,
                transition: "all 0.15s ease",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: teams.teamB.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {teams.teamB.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginTop: 4 }}>
                  {teams.teamB.players.map(p => p.name).join(" & ")}
                </div>
              </button>
            </div>
            <button onClick={onFold} style={{
              width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 13, fontWeight: 600,
              background: "#F3F4F6", color: "#9CA3AF",
            }}>Cancel</button>
          </>
        ) : (
          <>
            {/* Accept / Fold / Hammer Back */}
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#6B7280", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: throwingTeam.color }}>{throwingTeam.name}</span> {isHammerBack ? "hammered back!" : "threw the hammer!"}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#6B7280", marginBottom: 20 }}>
              Hole value {isHammerBack ? "doubles again" : "doubles"} to <span style={{ fontFamily: MONO, fontWeight: 800, color: "#F59E0B" }}>${currentValue * 2}</span>
            </div>
            <div style={{
              padding: "12px 16px", background: "#FEF3C7", borderRadius: 12, marginBottom: 24,
              fontFamily: FONT, fontSize: 13, color: "#92400E", fontStyle: "italic",
              textAlign: "left", borderLeft: "3px solid #F59E0B",
            }}>
              💬 "{receivingTeam.name} — the hammer's on the table. What's it gonna be?"
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onFold()} style={{
                flex: 1, padding: "16px", borderRadius: 14, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 15, fontWeight: 700,
                background: "#F3F4F6", color: "#6B7280",
              }}>
                🐔 Fold
              </button>
              <button onClick={() => onAccept()} style={{
                flex: 1, padding: "16px", borderRadius: 14, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 15, fontWeight: 700,
                background: "#F59E0B", color: "#fff",
              }}>
                Accept 🔥
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HoleResultCard({ result, onDismiss }) {
  if (!result) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "28px 24px", maxWidth: 360, width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {result.push ? "🤝" : "🏆"}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: "#1A1A1A", marginBottom: 4 }}>
          {result.push ? "Push" : `${result.winnerName} Win`}
        </div>
        {!result.push && (
          <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 800, color: "#16A34A", marginBottom: 4 }}>
            ${result.amount}
          </div>
        )}
        {result.carryOver > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#F59E0B", fontWeight: 700, marginBottom: 8 }}>
            ➡️ ${result.carryOver} carries to next hole
          </div>
        )}
        <div style={{
          padding: "12px 16px", background: "#F7F7F5", borderRadius: 12, marginBottom: 4,
          textAlign: "left",
        }}>
          {result.playerResults.map(pr => (
            <div key={pr.id} style={{
              display: "flex", justifyContent: "space-between", padding: "4px 0",
              fontFamily: FONT, fontSize: 13,
            }}>
              <span style={{ color: "#6B7280" }}>{pr.name}</span>
              <span style={{
                fontFamily: MONO, fontWeight: 700,
                color: pr.amount > 0 ? "#16A34A" : pr.amount < 0 ? "#DC2626" : "#9CA3AF",
              }}>
                {pr.amount >= 0 ? "+" : ""}${pr.amount}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          padding: "10px 14px", background: "#F0FDF4", borderRadius: 10, marginBottom: 20, marginTop: 12,
          fontFamily: FONT, fontSize: 13, color: "#166534", fontStyle: "italic",
          borderLeft: "3px solid #16A34A",
          textAlign: "left",
        }}>
          💬 {result.quip}
        </div>
        <button onClick={onDismiss} style={{
          width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 15, fontWeight: 700,
          background: "#1A1A1A", color: "#fff",
        }}>
          Next Hole →
        </button>
      </div>
    </div>
  );
}

function CrybabSetupModal({ players, totals, onConfirm }) {
  const sorted = [...players].sort((a, b) => (totals[a.id] || 0) - (totals[b.id] || 0));
  const crybaby = sorted[0];
  const crybabAmount = Math.abs(totals[crybaby.id] || 0);
  const maxBet = crybabAmount <= 20 ? crybabAmount : Math.floor(crybabAmount / 2);
  const [bet, setBet] = useState(maxBet);
  const [partner, setPartner] = useState(null);
  const others = players.filter(p => p.id !== crybaby.id);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "28px 24px", maxWidth: 380, width: "100%",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🍼</div>
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1A1A1A" }}>
            Crybaby Time
          </div>
          <div style={{ fontFamily: FONT, fontSize: 14, color: "#6B7280", marginTop: 4 }}>
            {crybaby.name} is down <span style={{ fontFamily: MONO, fontWeight: 800, color: "#DC2626" }}>${crybabAmount}</span>
          </div>
        </div>

        <div style={{
          padding: "12px 16px", background: "#FEF2F2", borderRadius: 12, marginBottom: 16,
          fontFamily: FONT, fontSize: 13, color: "#991B1B", fontStyle: "italic",
          borderLeft: "3px solid #DC2626",
        }}>
          💬 "Ladies and gentlemen, your crybaby: {crybaby.name}. Currently holding the bag at -${crybabAmount}."
        </div>

        {/* Bet Amount */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Crybaby Bet (max ${maxBet})
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <button onClick={() => setBet(Math.max(1, bet - 1))} style={{
              width: 40, height: 40, borderRadius: 12, border: "none", background: "#F3F4F6",
              cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#6B7280",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>−</button>
            <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 800, color: "#DC2626", minWidth: 80, textAlign: "center" }}>
              ${bet}
            </div>
            <button onClick={() => setBet(Math.min(maxBet, bet + 1))} style={{
              width: 40, height: 40, borderRadius: 12, border: "none", background: "#DC2626",
              cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>+</button>
          </div>
        </div>

        {/* Partner Selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Choose Partner
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {others.map(p => (
              <button key={p.id} onClick={() => setPartner(p.id)} style={{
                flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", cursor: "pointer",
                background: partner === p.id ? "#1A1A1A" : "#F3F4F6",
                color: partner === p.id ? "#fff" : "#6B7280",
                textAlign: "center", transition: "all 0.15s ease",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, background: partner === p.id ? "#fff" : p.color,
                  color: partner === p.id ? "#1A1A1A" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: FONT, fontSize: 13, fontWeight: 700, margin: "0 auto 6px",
                }}>{p.name[0]}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600 }}>{p.name}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!partner}
          onClick={() => onConfirm({ crybaby: crybaby.id, partner, bet })}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            cursor: partner ? "pointer" : "not-allowed",
            fontFamily: FONT, fontSize: 15, fontWeight: 700,
            background: partner ? "#DC2626" : "#D1D5DB",
            color: partner ? "#fff" : "#9CA3AF",
          }}
        >
          Lock In Crybaby 🍼
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CrybabActiveRound() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roundId = searchParams.get("id");
  const [dbRound, setDbRound] = useState(null);
  const [dbPlayers, setDbPlayers] = useState([]);
  const [playerProfiles, setPlayerProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Redirect if no round ID
  useEffect(() => {
    if (!roundId) {
      navigate("/setup", { replace: true });
    }
  }, [roundId, navigate]);

  // Load round from DB
  useEffect(() => {
    if (!roundId) return;
    const load = async () => {
      try {
        const data = await loadRound(roundId);
        if (!data) {
          setError("Round not found");
          setLoading(false);
          return;
        }
        setDbRound(data.round);
        setDbPlayers(data.players);

        // Load profiles for players with user_ids
        const userIds = data.players.map(p => p.user_id).filter(Boolean);
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, avatar_url, handicap")
            .in("user_id", userIds);
          const map = {};
          (profiles || []).forEach(p => { map[p.user_id] = p; });
          setPlayerProfiles(map);
        }
        setLoading(false);
      } catch (err) {
        console.error("Failed to load round:", err);
        setError("Failed to load round");
        setLoading(false);
      }
    };
    load();
  }, [roundId]);

  // Build round object from DB
  const round = dbRound ? {
    gameMode: dbRound.game_type,
    gameName: dbRound.game_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    course: {
      name: dbRound.course,
      pars: dbRound.course_details?.pars || [],
      handicaps: dbRound.course_details?.handicaps || [],
    },
    holeValue: dbRound.course_details?.holeValue || 5,
    players: dbPlayers.map((p, i) => {
      const profile = p.user_id ? playerProfiles[p.user_id] : null;
      return {
        id: p.id,
        userId: p.user_id || null,
        name: p.guest_name || profile?.display_name || `Player ${i + 1}`,
        handicap: profile?.handicap || 12,
        cart: i < 2 ? "A" : "B",
        position: i % 2 === 0 ? "driver" : "rider",
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      };
    }),
    settings: {
      hammer: (dbRound.course_details?.mechanics || []).includes("hammer"),
      hammerInitiator: dbRound.course_details?.mechanicSettings?.hammer?.initiator || "Either team",
      hammerMaxDepth: "∞",
      crybaby: (dbRound.course_details?.mechanics || []).includes("crybaby"),
      crybabHoles: dbRound.course_details?.mechanicSettings?.crybaby?.holes || 3,
      crybabHammerRule: "Only crybaby hammers",
      birdieBonus: (dbRound.course_details?.mechanics || []).includes("birdie_bonus"),
      birdieMultiplier: 2,
      pops: (dbRound.course_details?.mechanics || []).includes("pops"),
      noPopsParThree: false,
    },
  } : null;

  if (loading) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#F7F7F5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#6B7280" }}>Loading round...</div>
        </div>
      </div>
    );
  }

  if (error || !round) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#F7F7F5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😬</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#6B7280", marginBottom: 16 }}>{error || "Round not found"}</div>
          <button onClick={() => navigate("/setup")} style={{
            padding: "12px 24px", borderRadius: 12, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 14, fontWeight: 700,
            background: "#1A1A1A", color: "#fff",
          }}>
            Start New Round
          </button>
        </div>
      </div>
    );
  }

  const { players, course, settings } = round;

  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores] = useState({}); // { holeNum: { playerId: score } }
  const [totals, setTotals] = useState(() => Object.fromEntries(players.map(p => [p.id, 0])));
  const [holeResults, setHoleResults] = useState([]); // completed hole results
  const [hammerDepth, setHammerDepth] = useState(0);
  const [hammerPending, setHammerPending] = useState(false); // waiting for accept/fold
  const [lastHammerBy, setLastHammerBy] = useState(null); // "A" or "B" — who threw last
  const [showHammer, setShowHammer] = useState(false);
  const [showResult, setShowResult] = useState(null);
  const [showCrybabSetup, setShowCrybabSetup] = useState(false);
  const [crybabConfig, setCrybabConfig] = useState(null);
  const [carryOver, setCarryOver] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [showLiveFeed, setShowLiveFeed] = useState(false);

  const par = course.pars[currentHole - 1];
  const holeHandicap = course.handicaps[currentHole - 1];
  const lowestHandicap = Math.min(...players.map(p => p.handicap));

  const phase = currentHole <= 5 ? "drivers" : currentHole <= 10 ? "others" : currentHole <= 15 ? "carts" : "crybaby";
  const teams = currentHole <= 15 ? getTeams(currentHole, players) : null;

  const currentScores = scores[currentHole] || {};
  const allScored = players.every(p => currentScores[p.id] != null);

  const effectiveHoleValue = round.holeValue * Math.pow(2, hammerDepth) + carryOver;

  // Determine current crybaby candidate
  const currentCrybaby = Object.entries(totals).sort((a, b) => a[1] - b[1])[0];
  const crybabyCandidateId = currentCrybaby[1] < 0 ? currentCrybaby[0] : null;

  // Check if entering crybaby phase
  useEffect(() => {
    if (currentHole === 16 && settings.crybaby && !crybabConfig) {
      setShowCrybabSetup(true);
    }
  }, [currentHole]);

  // Auto-save settlements when round completes
  const [settlementsSaved, setSettlementsSaved] = useState(false);
  useEffect(() => {
    const isComplete = currentHole >= 18 && holeResults.length >= 17;
    if (!isComplete || settlementsSaved) return;

    const saveRoundSettlements = async () => {
      try {
        if (roundId) {
          await completeRound(roundId);
          const settlementData = players.map(p => ({
            userId: p.userId || null,
            guestName: p.userId ? null : p.name,
            amount: totals[p.id] || 0,
          }));
          await insertSettlements(roundId, settlementData);
        }
        setSettlementsSaved(true);
        console.log("✅ Settlements saved");
      } catch (err) {
        console.error("Failed to save settlements:", err);
      }
    };
    saveRoundSettlements();
  }, [currentHole, holeResults.length, settlementsSaved]);

  const handleScoreChange = (playerId, score) => {
    setScores(prev => ({
      ...prev,
      [currentHole]: { ...prev[currentHole], [playerId]: score },
    }));
  };

  // Carry-over cap (from settings — in real app comes from setup)
  const carryOverCap = "∞"; // would come from round.settings.carryOverCap

  const handleHammer = () => {
    if (hammerPending) {
      // Already pending — this shouldn't happen, but safety
      return;
    }
    // Open modal in "who's throwing?" mode
    setLastHammerBy(null);
    setHammerPending(false);
    setShowHammer(true);
  };

  const handleHammerThrow = (teamId) => {
    // Team selected who's throwing — now it's pending for the other team
    setLastHammerBy(teamId);
    setHammerPending(true);
  };

  const handleHammerAccept = () => {
    setHammerDepth(d => d + 1);
    setHammerPending(false);
    setShowHammer(false);

    // Emit hammer event to live feed
    if (roundId && teams) {
      const acceptingTeam = lastHammerBy === "A" ? teams.teamB : teams.teamA;
      createRoundEvent({
        roundId,
        holeNumber: currentHole,
        eventType: "hammer",
        eventData: {
          message: `${acceptingTeam.name} accepted the hammer!`,
          quip: getQuip("hammer_accepted"),
          amount: round.holeValue * Math.pow(2, hammerDepth + 1) + carryOver,
        },
      }).catch(err => console.error("Failed to emit hammer event:", err));
    }
  };

  const handleHammerFold = () => {
    if (!hammerPending) {
      // Cancel from team selection — just close
      setShowHammer(false);
      return;
    }
    // Team that was hammered folds — the throwing team wins at current value
    const foldValue = round.holeValue * Math.pow(2, hammerDepth) + carryOver;
    const throwingTeamId = lastHammerBy;
    const result = calculateFoldResult(foldValue, throwingTeamId);
    setShowHammer(false);
    setHammerPending(false);
    setShowResult(result);
  };

  const handleHammerBack = () => {
    // The team that just accepted can now hammer back
    // Flip who's throwing
    const newThrower = lastHammerBy === "A" ? "B" : "A";
    setLastHammerBy(newThrower);
    setHammerPending(true);
    setShowHammer(true);
  };

  const calculateFoldResult = (value, winnerTeamId) => {
    if (!teams) return null;
    const winTeam = winnerTeamId === "A" ? teams.teamA : teams.teamB;
    const loseTeam = winnerTeamId === "A" ? teams.teamB : teams.teamA;
    const playerResults = players.map(p => {
      const isWinner = winTeam.players.some(tp => tp.id === p.id);
      return {
        id: p.id,
        name: p.name,
        amount: isWinner ? value : -value,
      };
    });
    return {
      push: false,
      winnerName: winTeam.name,
      amount: value,
      carryOver: 0,
      playerResults,
      quip: getQuip("hammer_folded", { team: loseTeam.name }),
      folded: true,
    };
  };

  const submitHole = () => {
    if (!allScored) return;
    const result = calculateHoleResult();
    setShowResult(result);
  };

  const calculateHoleResult = () => {
    if (!teams) return null;
    const cs = scores[currentHole];

    // Calculate net scores
    const netScores = {};
    players.forEach(p => {
      const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicap) : 0;
      netScores[p.id] = cs[p.id] - strokes;
    });

    // Team best ball
    const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id]));
    const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id]));

    // Check for birdie bonus — GROSS scores only trigger the double
    // BUT a net birdie by the opposing team FORCES A PUSH on the hole
    const bestGross = Math.min(...Object.values(cs));
    const bestGrossPlayer = players.find(p => cs[p.id] === bestGross);
    const hasGrossBirdie = bestGross < par && settings.birdieBonus;

    let birdieMultiplier = 1;
    let birdieForcedPush = false;

    if (hasGrossBirdie) {
      // Which team has the gross birdie?
      const grossBirdieTeamA = teams.teamA.players.some(p => cs[p.id] < par);
      const grossBirdieTeamB = teams.teamB.players.some(p => cs[p.id] < par);

      // Check if the opposing team has a net birdie
      const teamAHasNetBirdie = teams.teamA.players.some(p => netScores[p.id] < par);
      const teamBHasNetBirdie = teams.teamB.players.some(p => netScores[p.id] < par);

      if (grossBirdieTeamA && teamBHasNetBirdie) {
        // Team A has gross birdie, Team B covers with net birdie → forced push
        birdieForcedPush = true;
      } else if (grossBirdieTeamB && teamAHasNetBirdie) {
        // Team B has gross birdie, Team A covers with net birdie → forced push
        birdieForcedPush = true;
      } else {
        // Gross birdie stands — pot doubles
        birdieMultiplier = settings.birdieMultiplier;
      }
    }

    // FORCED PUSH — net birdie cancels the gross birdie and the hole
    if (birdieForcedPush) {
      const rawCarry = round.holeValue * Math.pow(2, hammerDepth) + carryOver;
      let cappedCarry = rawCarry;
      if (carryOverCap === "None") {
        cappedCarry = 0;
      } else if (carryOverCap !== "∞") {
        const maxCarry = round.holeValue * parseInt(carryOverCap);
        cappedCarry = Math.min(rawCarry, maxCarry);
      }
      return {
        push: true,
        winnerName: null,
        amount: 0,
        carryOver: cappedCarry,
        playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
        quip: getQuip("birdie_negated", { player: bestGrossPlayer.name }),
        birdiePush: true,
      };
    }

    const holeVal = (round.holeValue * Math.pow(2, hammerDepth) + carryOver) * birdieMultiplier;

    if (teamABest === teamBBest) {
      // Push — calculate carry-over with cap
      const rawCarry = round.holeValue * Math.pow(2, hammerDepth) * birdieMultiplier + carryOver;
      let cappedCarry = rawCarry;
      if (carryOverCap === "None") {
        cappedCarry = 0;
      } else if (carryOverCap !== "∞") {
        const maxCarry = round.holeValue * parseInt(carryOverCap);
        cappedCarry = Math.min(rawCarry, maxCarry);
      }
      return {
        push: true,
        winnerName: null,
        amount: 0,
        carryOver: cappedCarry,
        playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
        quip: cappedCarry === 0
          ? "Push. No carry-overs — clean slate next hole."
          : getQuip("push"),
      };
    }

    const winnerTeam = teamABest < teamBBest ? "A" : "B";
    const winTeam = winnerTeam === "A" ? teams.teamA : teams.teamB;
    const loseTeam = winnerTeam === "A" ? teams.teamB : teams.teamA;

    const playerResults = players.map(p => {
      const isWinner = winTeam.players.some(tp => tp.id === p.id);
      return {
        id: p.id,
        name: p.name,
        amount: isWinner ? holeVal : -holeVal,
      };
    });

    // Generate quip (birdie forced push is already handled above and returned early)
    let quip;
    if (hasGrossBirdie && birdieMultiplier > 1) {
      quip = getQuip("birdie", { player: bestGrossPlayer.name });
    } else if (holeVal >= round.holeValue * 3) {
      quip = getQuip("big_swing", { amount: holeVal * 2 });
    } else {
      quip = getQuip("team_win", {
        team: winTeam.name,
        losingTeam: loseTeam.name,
        amount: holeVal,
      });
    }

    return {
      push: false,
      winnerName: winTeam.name,
      amount: holeVal,
      carryOver: 0,
      playerResults,
      quip,
    };
  };

  const advanceHole = () => {
    if (showResult) {
      // Apply results to totals
      const newTotals = { ...totals };
      showResult.playerResults.forEach(pr => {
        newTotals[pr.id] = (newTotals[pr.id] || 0) + pr.amount;
      });
      setTotals(newTotals);
      setHoleResults(prev => [...prev, { hole: currentHole, ...showResult }]);
      setCarryOver(showResult.carryOver || 0);
      setHammerDepth(0);
      setHammerPending(false);
      setLastHammerBy(null);
      setShowResult(null);
      setPendingSync(ps => ps + 1);

      // Emit live feed event
      if (roundId) {
        const cs = scores[currentHole] || {};
        const eventType = showResult.push ? "push"
          : showResult.folded ? "hammer_fold"
          : "team_win";

        // Emit a summary event for the hole
        createRoundEvent({
          roundId,
          holeNumber: currentHole,
          par,
          eventType,
          eventData: {
            message: showResult.push
              ? `Hole ${currentHole} is a push`
              : showResult.folded
              ? `${showResult.winnerName} wins — opponent folded`
              : `${showResult.winnerName} takes Hole ${currentHole}`,
            amount: showResult.push ? 0 : showResult.amount,
            quip: showResult.quip,
            winnerName: showResult.winnerName,
          },
        }).catch(err => console.error("Failed to emit round event:", err));

        // Emit individual player score events for notable scores
        players.forEach(p => {
          const score = cs[p.id];
          if (score == null) return;
          const diff = score - par;
          if (diff <= -2 || diff === -1) {
            const scoreType = diff <= -2 ? "eagle" : "birdie";
            createRoundEvent({
              roundId,
              roundPlayerId: p.id,
              holeNumber: currentHole,
              grossScore: score,
              par,
              eventType: scoreType,
              eventData: {
                playerName: p.name,
                message: `${scoreType === "eagle" ? "Eagle" : "Birdie"} on Hole ${currentHole}!`,
                score,
              },
            }).catch(err => console.error("Failed to emit score event:", err));
          }
        });
      }

      if (currentHole < 18) {
        setCurrentHole(currentHole + 1);
      }
    }
  };

  const handleCrybabConfirm = (config) => {
    setCrybabConfig(config);
    setShowCrybabSetup(false);
  };

  // Simulate connectivity changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingSync > 0 && isOnline) {
        setPendingSync(0);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pendingSync, isOnline]);

  // Completed round
  if (currentHole >= 18 && holeResults.length >= 17) {
    const sorted = [...players].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
    const crybabyPlayer = sorted[sorted.length - 1];
    const winner = sorted[0];
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#F7F7F5", fontFamily: FONT }}>
        <div style={{
          background: "linear-gradient(135deg, #1A1A1A 0%, #374151 100%)",
          padding: "60px 24px 32px", borderRadius: "0 0 32px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Round Complete</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
            {round.gameName} · {course.name}
          </div>
        </div>

        <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Results */}
          {sorted.map((p, i) => {
            const amount = totals[p.id] || 0;
            const isCrybab = i === sorted.length - 1 && amount < 0;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
                background: isCrybab ? "#FEF2F2" : "#fff", borderRadius: 16,
                boxShadow: i === 0 ? "0 0 0 2px #16A34A, 0 4px 12px rgba(22,163,74,0.15)" : "0 1px 3px rgba(0,0,0,0.06)",
              }}>
                <div style={{
                  fontSize: 20, width: 32, textAlign: "center",
                }}>{i === 0 ? "🏆" : isCrybab ? "🍼" : `#${i + 1}`}</div>
                <div style={{
                  width: 40, height: 40, borderRadius: 20, background: p.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, fontWeight: 700,
                }}>{p.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A" }}>{p.name}</div>
                  {isCrybab && <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}>CRYBABY</div>}
                </div>
                <span style={{
                  fontFamily: MONO, fontSize: 22, fontWeight: 800,
                  color: amount > 0 ? "#16A34A" : amount < 0 ? "#DC2626" : "#9CA3AF",
                }}>
                  {amount >= 0 ? "+" : ""}${amount}
                </span>
              </div>
            );
          })}

          {/* Settlement */}
          <div style={{
            background: "#fff", borderRadius: 16, padding: 20, marginTop: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
              Settlement
            </div>
            {(() => {
              // Calculate who owes who
              const settlements = [];
              const balances = players.map(p => ({ ...p, balance: totals[p.id] || 0 }));
              const debtors = balances.filter(p => p.balance < 0).sort((a, b) => a.balance - b.balance);
              const creditors = balances.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);

              let di = 0, ci = 0;
              const deb = debtors.map(d => ({ ...d, owed: -d.balance }));
              const cred = creditors.map(c => ({ ...c, owed: c.balance }));

              while (di < deb.length && ci < cred.length) {
                const amount = Math.min(deb[di].owed, cred[ci].owed);
                if (amount > 0) {
                  settlements.push({ from: deb[di].name, to: cred[ci].name, amount });
                }
                deb[di].owed -= amount;
                cred[ci].owed -= amount;
                if (deb[di].owed === 0) di++;
                if (cred[ci].owed === 0) ci++;
              }

              return settlements.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: i < settlements.length - 1 ? "1px solid #F3F4F6" : "none",
                }}>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: "#6B7280" }}>
                    <span style={{ fontWeight: 600, color: "#DC2626" }}>{s.from}</span>
                    {" → "}
                    <span style={{ fontWeight: 600, color: "#16A34A" }}>{s.to}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "#1A1A1A" }}>
                    ${s.amount}
                  </span>
                </div>
              ));
            })()}
            <button style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none", marginTop: 14,
              fontFamily: FONT, fontSize: 14, fontWeight: 700,
              background: "#16A34A", color: "#fff", cursor: "pointer",
            }}>
              Send Reminders 📲
            </button>
          </div>

          {/* Commentator Summary */}
          <div style={{
            background: "#F0FDF4", borderRadius: 16, padding: "16px 18px",
            borderLeft: "4px solid #16A34A",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Round Recap
            </div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#166534", fontStyle: "italic", lineHeight: 1.5 }}>
              💬 "{winner.name} walked away with +${totals[winner.id]}. {crybabyPlayer.name} is this round's crybaby at -${Math.abs(totals[crybabyPlayer.id])}. {holeResults.filter(h => h.folded).length > 0 ? `${holeResults.filter(h => h.folded).length} hammer${holeResults.filter(h => h.folded).length > 1 ? 's' : ''} folded — chicken dinner for someone. ` : ""}{carryOver > 0 ? `$${carryOver} left on the table in carry-overs. ` : ""}Another day, another dollar. Or several."
            </div>
          </div>

          <div style={{
            padding: "10px 14px", background: "#FEF3C7", borderRadius: 12,
            fontFamily: FONT, fontSize: 12, color: "#92400E", textAlign: "center",
          }}>
            📸 Round photos and full results will post to your feed
          </div>

          <button onClick={() => navigate("/feed")} style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            fontFamily: FONT, fontSize: 16, fontWeight: 700,
            background: "#16A34A", color: "#fff", cursor: "pointer",
            marginTop: 8,
          }}>
            Go to Feed →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F7F7F5", fontFamily: FONT,
      paddingBottom: 140,
    }}>
      {/* Top Bar */}
      <div style={{
        padding: "50px 20px 0",
        background: "#fff",
        position: "sticky", top: 0, zIndex: 10,
        borderBottom: "1px solid #F3F4F6",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={crybabyLogo} alt="Crybaby" style={{ height: 100, marginLeft: -16, marginTop: -24, marginBottom: -24 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
              {course.name} · {round.gameName}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Sync indicator */}
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: pendingSync > 0 ? "#F59E0B" : "#16A34A",
            }} />
              <button
                onClick={() => setShowLiveFeed(true)}
                style={{
                  padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 12, fontWeight: 700,
                  background: "#FEF2F2",
                  color: "#DC2626",
                  position: "relative",
                }}
              >
                📡
                <div style={{
                  position: "absolute", top: 2, right: 2, width: 6, height: 6,
                  borderRadius: 3, background: "#DC2626",
                  animation: "pulse 2s infinite",
                }} />
              </button>
              <button
                onClick={() => setShowLeaderboard(!showLeaderboard)}
                style={{
                  padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 12, fontWeight: 700,
                  background: showLeaderboard ? "#1A1A1A" : "#F3F4F6",
                  color: showLeaderboard ? "#fff" : "#6B7280",
                }}
              >
                📊
              </button>
          </div>
        </div>

        <HoleHeader
          holeNumber={currentHole}
          par={par}
          handicap={holeHandicap}
          phase={phase}
        />
      </div>

      {/* Leaderboard (collapsible) */}
      {showLeaderboard && (
        <div style={{ padding: "12px 20px 0" }}>
          <Leaderboard players={players} totals={totals} currentCrybaby={crybabyCandidateId} />
        </div>
      )}

      {/* Team Banner */}
      {teams && <TeamBanner teams={teams} holeValue={round.holeValue} hammerDepth={hammerDepth} />}

      {/* Carry-over notice */}
      {carryOver > 0 && (
        <div style={{
          margin: "0 20px 8px", padding: "8px 14px", background: "#FEF3C7", borderRadius: 10,
          fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#92400E", textAlign: "center",
        }}>
          ➡️ ${carryOver} carry-over from previous hole{carryOver > round.holeValue ? "s" : ""}
        </div>
      )}

      {/* Score Inputs */}
      <div style={{ padding: "8px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {players.map(player => {
          const strokes = settings.pops ? getStrokesOnHole(player.handicap, lowestHandicap, holeHandicap) : 0;
          return (
            <ScoreInput
              key={player.id}
              player={player}
              par={par}
              score={currentScores[player.id] ?? null}
              strokes={strokes}
              onScoreChange={handleScoreChange}
            />
          );
        })}
      </div>

      {/* Hammer Button */}
      {settings.hammer && teams && !allScored && (
        <div style={{ padding: "12px 20px", display: "flex", gap: 8 }}>
          {hammerDepth === 0 ? (
            <button onClick={handleHammer} style={{
              flex: 1, padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 14, fontWeight: 700,
              background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
              color: "#fff", boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
            }}>
              🔨 Throw Hammer
            </button>
          ) : (
            <button onClick={handleHammerBack} style={{
              flex: 1, padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 14, fontWeight: 700,
              background: hammerDepth >= 3
                ? "linear-gradient(135deg, #7C2D12 0%, #450A0A 100%)"
                : hammerDepth >= 2
                ? "linear-gradient(135deg, #991B1B 0%, #7F1D1D 100%)"
                : "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)",
              color: "#fff",
              boxShadow: hammerDepth >= 3 ? "0 4px 12px rgba(127,29,29,0.4)" : "0 4px 12px rgba(220,38,38,0.3)",
            }}>
              {"🔨".repeat(Math.min(hammerDepth + 1, 5))} Hammer Back — ${round.holeValue * Math.pow(2, hammerDepth) + carryOver} → ${round.holeValue * Math.pow(2, hammerDepth + 1) + carryOver}
            </button>
          )}
        </div>
      )}

      {/* Hole Progress Dots */}
      <div style={{
        padding: "16px 20px", display: "flex", justifyContent: "center", gap: 4, flexWrap: "wrap",
      }}>
        {Array.from({ length: 18 }, (_, i) => {
          const holeNum = i + 1;
          const result = holeResults.find(h => h.hole === holeNum);
          const isCurrent = holeNum === currentHole;
          return (
            <div key={i} style={{
              width: isCurrent ? 20 : 10, height: 10, borderRadius: 5,
              background: result ? (result.push ? "#F59E0B" : "#16A34A") : isCurrent ? "#1A1A1A" : "#E5E7EB",
              transition: "all 0.2s ease",
            }} />
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: "fixed", bottom: 68, left: 0, right: 0,
        padding: "12px 20px", paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        background: "rgba(247,247,245,0.95)", backdropFilter: "blur(12px)",
        borderTop: "1px solid #E5E7EB",
      }}>
        {pendingSync > 0 && (
          <div style={{
            fontFamily: FONT, fontSize: 11, color: "#F59E0B", textAlign: "center",
            marginBottom: 6, fontWeight: 600,
          }}>
            🟡 {pendingSync} hole{pendingSync > 1 ? "s" : ""} pending sync
          </div>
        )}
        <button
          disabled={!allScored}
          onClick={submitHole}
          style={{
            width: "100%", maxWidth: 380, margin: "0 auto", display: "block",
            padding: "16px 32px", borderRadius: 14, border: "none",
            cursor: allScored ? "pointer" : "not-allowed",
            fontFamily: FONT, fontSize: 16, fontWeight: 700,
            background: allScored ? "#1A1A1A" : "#D1D5DB",
            color: allScored ? "#fff" : "#9CA3AF",
            transition: "all 0.2s ease",
          }}
        >
          {allScored ? `Submit Hole ${currentHole} →` : `Enter all scores (${Object.keys(currentScores).length}/${players.length})`}
        </button>
      </div>

      {/* Modals */}
      {showHammer && teams && (
        <HammerModal
          teams={teams}
          currentValue={round.holeValue * Math.pow(2, hammerDepth) + carryOver}
          hammerDepth={hammerDepth}
          lastHammerBy={hammerPending ? lastHammerBy : null}
          onThrow={handleHammerThrow}
          onAccept={handleHammerAccept}
          onFold={handleHammerFold}
        />
      )}
      {showResult && (
        <HoleResultCard result={showResult} onDismiss={advanceHole} />
      )}
      {showCrybabSetup && (
        <CrybabSetupModal
          players={players}
          totals={totals}
          onConfirm={handleCrybabConfirm}
        />
      )}
      {roundId && (
        <RoundLiveFeed
          roundId={roundId}
          isOpen={showLiveFeed}
          onClose={() => setShowLiveFeed(false)}
        />
      )}
    </div>
  );
}
