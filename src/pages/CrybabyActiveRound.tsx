import { useState, useEffect, useRef, useCallback } from "react";
import crybabyLogo from "@/assets/crybaby-logo.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loadRound, updatePlayerScores, completeRound, cancelRound, createPost, saveAICommentary, insertSettlements, createRoundEvent, toggleBroadcast, saveGameState, RoundLoadError } from "@/lib/db";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useRoundState } from "@/hooks/useRoundState";
import { useRoundPersistence } from "@/hooks/useRoundPersistence";
import { useRoundGameModes } from "@/hooks/useRoundGameModes";
import { useCapture } from "@/hooks/useCapture";
import { useAuth } from "@/contexts/AuthContext";
// PR #27: Photo capture removed from gameplay UI. CaptureButton (FAB)
// and CapturePrompt (mid-round photo banner) imports dropped along
// with their renders. useCaptureCadence + cadenceResult derivations
// are also gone — the gate they computed (blockedOnPhoto) had only
// one consumer, the CapturePrompt banner. Edge functions, the
// round_captures table, and CaptureFlow (still used by the post-
// round-correction button on the completion screen) stay in place.
// Components themselves remain in src/components/capture/ so legacy
// captures keep displaying on round detail; no UI triggers them now.
import CaptureFlow from "@/components/capture/CaptureFlow";
import EditHammerModal from "@/components/capture/hammer/EditHammerModal";
import FinalPhotoGate from "@/components/FinalPhotoGate";
import FinishRoundConfirm from "@/components/round/FinishRoundConfirm";
import { resolvePlayerCartPosition } from "@/lib/cartPosition";
import FlipReel from "@/components/flip/FlipReel";
import FlipTeamsBadge from "@/components/flip/FlipTeamsBadge";
import CrybabyTransition from "@/components/flip/CrybabyTransition";
import CrybabyHoleSetup from "@/components/flip/CrybabyHoleSetup";
import { commitFlipTeams, calculateCrybabyHoleResult, type TeamInfo as FlipTeamInfo, type FlipConfig as FlipConfigType, type CrybabyState as CrybabyStateType, type CrybabyHoleChoice, type GameMode, type HoleResult } from "@/lib/gameEngines";
import { computeBaseGameBalances, canInitiateCrybabyHammer, computeFlipSettlementSplit, roundHasFlipSettlementSplit, type CrybabyIdentification } from "@/lib/flipCrybaby";
import { supabase } from "@/integrations/supabase/client";
import RoundLiveFeed from "@/components/RoundLiveFeed";
import {
  getStrokesOnHole, getTeamsForHole, getPhaseLabel, getPhaseDisplayLabel, getPhaseColor,
  supportsTeams, supportsHammer, supportsCrybaby,
  calculateTeamHoleResult, calculateSkinsResult, calculateScorecardResult, calculateNassauHoleResult,
  calculateNassauSettlement,
  calculateWolfHoleResult, calculateFoldResult as calcFoldResult,
  initWolfState, getWolfForHole, initNassauState,
  isRoundComplete,
} from "@/lib/gameEngines";

// ============================================================
// CRYBABY — Active Round / Score Entry
// Core scoring interface — one scorekeeper, hole-by-hole
// ============================================================

const FONT = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', monospace";

const PLAYER_COLORS = ["#2D5016", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899"];

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
  const phaseLabel = getPhaseDisplayLabel(phase);
  const phaseColor = getPhaseColor(phase);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 20px", background: "#FAF5EC", borderBottom: "1px solid #F3F4F6",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: "#1E130A",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "#fff",
        }}>{holeNumber}</div>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#1E130A" }}>Par {par}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#A8957B" }}>HCP {handicap}</span>
          </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
              background: phaseColor + "14",
              color: phaseColor,
              fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {phaseLabel}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#A8957B" }}>
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
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#1E130A", fontWeight: 500, marginTop: 3 }}>
          {teams.teamA.players.map(p => p.name).join(" & ")}
        </div>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minWidth: 56,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 10, color: "#A8957B", fontWeight: 600 }}>HOLE</div>
        <div style={{
          fontFamily: MONO, fontSize: hammerDepth >= 3 ? 16 : 18, fontWeight: 800,
          color: hammerDepth >= 3 ? "#7F1D1D" : hammerDepth >= 2 ? "#DC2626" : hammerDepth >= 1 ? "#F59E0B" : "#1E130A",
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
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#1E130A", fontWeight: 500, marginTop: 3 }}>
          {teams.teamB.players.map(p => p.name).join(" & ")}
        </div>
      </div>
    </div>
  );
}

function ScoreInput({ player, par, score, strokes, onScoreChange }) {
  const netScore = score !== null ? score - strokes : null;
  const diff = netScore !== null ? netScore - par : null;
  const diffColor = diff === null ? "#A8957B" : diff < 0 ? "#2D5016" : diff > 0 ? "#DC2626" : "#1E130A";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "#FAF5EC", borderRadius: 14,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18, background: player.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT, flexShrink: 0,
      }}>{player.name[0]}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{player.name}</span>
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
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#A8957B", marginTop: 1 }}>
            gross {score} → net {netScore}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => onScoreChange(player.id, Math.max(1, (score || par) - 1))}
          style={{
            width: 40, height: 40, borderRadius: 12, border: "none",
            background: "#EDE7D9", cursor: "pointer",
            fontSize: 20, fontWeight: 600, color: "#8B7355",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >−</button>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: score !== null ? (diff < 0 ? "#EEF5E5" : diff > 0 ? "#FEF2F2" : "#FAF5EC") : "#FAF5EC",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 22, fontWeight: 800, color: diffColor,
          border: score !== null ? `2px solid ${diffColor}20` : "2px solid #DDD0BB",
          transition: "all 0.2s ease",
        }}>
          {score !== null ? score : "–"}
        </div>
        <button
          onClick={() => onScoreChange(player.id, (score || par) + 1)}
          style={{
            width: 40, height: 40, borderRadius: 12, border: "none",
            background: "#EDE7D9", cursor: "pointer",
            fontSize: 20, fontWeight: 600, color: "#8B7355",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >+</button>
      </div>
    </div>
  );
}

/**
 * Two-mode leaderboard. In money games ("money"), sorts desc by P&L
 * and shows ±$X per player. In Scorecard rounds ("strokes"), sorts
 * asc by total strokes (lowest best) and shows a plain integer
 * count per player. strokesByPlayer is required in "strokes" mode.
 */
function Leaderboard({ players, totals, currentCrybaby, mode = "money", strokesByPlayer = {} }) {
  const sorted = mode === "strokes"
    ? [...players].sort((a, b) => (strokesByPlayer[a.id] || 0) - (strokesByPlayer[b.id] || 0))
    : [...players].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
  return (
    <div
      data-testid={`leaderboard-${mode}`}
      style={{
        background: "#FAF5EC", borderRadius: 16, overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{
        padding: "12px 16px", background: "#FAF5EC", borderBottom: "1px solid #F3F4F6",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#A8957B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Standings
        </span>
        <span style={{ fontFamily: FONT, fontSize: 11, color: "#A8957B" }}>
          {mode === "strokes" ? "Strokes" : "P&L"}
        </span>
      </div>
      {sorted.map((player, i) => {
        const amount = totals[player.id] || 0;
        const strokes = strokesByPlayer[player.id] || 0;
        const isCrybaby = currentCrybaby === player.id;
        return (
          <div key={player.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
            borderBottom: i < sorted.length - 1 ? "1px solid #FAF5EC" : "none",
            background: isCrybaby ? "#FEF2F2" : "transparent",
          }}>
            <span style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#CEC0AA",
              width: 18, textAlign: "center",
            }}>{i + 1}</span>
            <div style={{
              width: 28, height: 28, borderRadius: 14, background: player.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: FONT,
            }}>{player.name[0]}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#1E130A" }}>{player.name}</span>
              {isCrybaby && <span style={{ marginLeft: 6, fontSize: 12 }}>🍼</span>}
            </div>
            {mode === "strokes" ? (
              <span style={{
                fontFamily: MONO, fontSize: 15, fontWeight: 800,
                color: "#1E130A",
              }}>
                {strokes || "—"}
              </span>
            ) : (
              <span style={{
                fontFamily: MONO, fontSize: 15, fontWeight: 800,
                color: amount > 0 ? "#2D5016" : amount < 0 ? "#DC2626" : "#A8957B",
              }}>
                {amount >= 0 ? "+" : ""}${amount}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HammerModal({ teams, currentValue, hammerDepth, lastHammerBy, onThrow, onAccept, onFold }) {
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
        background: "#FAF5EC", borderRadius: 24, padding: "32px 28px", maxWidth: 360, width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{"🔨".repeat(Math.min(hammerDepth + 1, 5))}</div>
        <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1E130A", marginBottom: 4 }}>
          {hammerDepth === 0 ? "HAMMER" : hammerDepth === 1 ? "HAMMER BACK" : `HAMMER ${"BACK ".repeat(Math.min(hammerDepth, 3))}`.trim()}
        </div>

        {!isPending ? (
          <>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginBottom: 20 }}>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1E130A", marginTop: 4 }}>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1E130A", marginTop: 4 }}>
                  {teams.teamB.players.map(p => p.name).join(" & ")}
                </div>
              </button>
            </div>
            <button onClick={onFold} style={{
              width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 13, fontWeight: 600,
              background: "#EDE7D9", color: "#A8957B",
            }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: throwingTeam.color }}>{throwingTeam.name}</span> {isHammerBack ? "hammered back!" : "threw the hammer!"}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginBottom: 20 }}>
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
                background: "#EDE7D9", color: "#8B7355",
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
        background: "#FAF5EC", borderRadius: 24, padding: "28px 24px", maxWidth: 360, width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          {result.push ? "🤝" : "🏆"}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: "#1E130A", marginBottom: 4 }}>
          {result.push ? "Push" : `${result.winnerName} Win`}
        </div>
        {!result.push && (
          <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 800, color: "#2D5016", marginBottom: 4 }}>
            ${result.amount}
          </div>
        )}
        {result.carryOver > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#F59E0B", fontWeight: 700, marginBottom: 8 }}>
            ➡️ ${result.carryOver} carries to next hole
          </div>
        )}
        <div style={{
          padding: "12px 16px", background: "#F5EFE0", borderRadius: 12, marginBottom: 4,
          textAlign: "left",
        }}>
          {result.playerResults.map(pr => (
            <div key={pr.id} style={{
              display: "flex", justifyContent: "space-between", padding: "4px 0",
              fontFamily: FONT, fontSize: 13,
            }}>
              <span style={{ color: "#8B7355" }}>{pr.name}</span>
              <span style={{
                fontFamily: MONO, fontWeight: 700,
                color: pr.amount > 0 ? "#2D5016" : pr.amount < 0 ? "#DC2626" : "#A8957B",
              }}>
                {pr.amount >= 0 ? "+" : ""}${pr.amount}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          padding: "10px 14px", background: "#EEF5E5", borderRadius: 10, marginBottom: 20, marginTop: 12,
          fontFamily: FONT, fontSize: 13, color: "#1A3009", fontStyle: "italic",
          borderLeft: "3px solid #2D5016",
          textAlign: "left",
        }}>
          💬 {result.quip}
        </div>
        <button onClick={onDismiss} style={{
          width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 15, fontWeight: 700,
          background: "#1E130A", color: "#fff",
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
        background: "#FAF5EC", borderRadius: 24, padding: "28px 24px", maxWidth: 380, width: "100%",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🍼</div>
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1E130A" }}>
            Crybaby Time
          </div>
          <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginTop: 4 }}>
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

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 8 }}>
            Crybaby Bet (max ${maxBet})
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <button onClick={() => setBet(Math.max(1, bet - 1))} style={{
              width: 40, height: 40, borderRadius: 12, border: "none", background: "#EDE7D9",
              cursor: "pointer", fontSize: 18, fontWeight: 700, color: "#8B7355",
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

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 8 }}>
            Choose Partner
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {others.map(p => (
              <button key={p.id} onClick={() => setPartner(p.id)} style={{
                flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", cursor: "pointer",
                background: partner === p.id ? "#1E130A" : "#EDE7D9",
                color: partner === p.id ? "#fff" : "#8B7355",
                textAlign: "center", transition: "all 0.15s ease",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, background: partner === p.id ? "#fff" : p.color,
                  color: partner === p.id ? "#1E130A" : "#fff",
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
            background: partner ? "#DC2626" : "#CEC0AA",
            color: partner ? "#fff" : "#A8957B",
          }}
        >
          Lock In Crybaby 🍼
        </button>
      </div>
    </div>
  );
}

// --- WOLF: Partner Selection Modal ---
function WolfPartnerModal({ wolfPlayer, otherPlayers, holeNumber, holeValue, onSelectPartner, onGoLone }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 20,
    }}>
      <div style={{
        background: "#FAF5EC", borderRadius: 24, padding: "28px 24px", maxWidth: 380, width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🐺</div>
        <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1E130A", marginBottom: 4 }}>
          Hole {holeNumber} — Wolf
        </div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: wolfPlayer.color }}>{wolfPlayer.name}</span> is the Wolf
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#A8957B", marginBottom: 20 }}>
          Pick a partner or go lone for 2× payout
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {otherPlayers.map(p => (
            <button key={p.id} onClick={() => onSelectPartner(p.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              borderRadius: 14, border: "none", cursor: "pointer",
              background: "#FAF5EC", transition: "all 0.15s ease",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 18, background: p.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT,
              }}>{p.name[0]}</div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{p.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#A8957B" }}>HCP {p.handicap}</div>
              </div>
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#8B5CF6" }}>Pick →</span>
            </button>
          ))}
        </div>

        <button onClick={onGoLone} style={{
          width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 15, fontWeight: 700,
          background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
          color: "#fff",
          boxShadow: "0 4px 12px rgba(139,92,246,0.3)",
        }}>
          🐺 Go Lone Wolf — 2× Payout
        </button>

        <div style={{
          marginTop: 12, padding: "10px 14px", background: "#F5F3FF", borderRadius: 10,
          fontFamily: FONT, fontSize: 12, color: "#7C3AED", fontStyle: "italic",
          borderLeft: "3px solid #8B5CF6",
          textAlign: "left",
        }}>
          💬 "The wolf surveys the pack. Choose wisely — or don't choose at all."
        </div>
      </div>
    </div>
  );
}

// --- NASSAU: Press Modal ---
function NassauPressModal({ currentHole, holeValue, nassauPresses, onPress, onClose }) {
  const segment = currentHole <= 9 ? "Front 9" : "Back 9";
  const pressCount = nassauPresses.filter(p => {
    if (currentHole <= 9) return p.startHole <= 9;
    return p.startHole > 9;
  }).length;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      padding: 20,
    }}>
      <div style={{
        background: "#FAF5EC", borderRadius: 24, padding: "28px 24px", maxWidth: 360, width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>📌</div>
        <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: "#1E130A", marginBottom: 4 }}>
          Press
        </div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", marginBottom: 8 }}>
          Start a new match within the {segment}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#A8957B", marginBottom: 20 }}>
          Active presses this segment: {pressCount} · ${holeValue} per press
        </div>

        <div style={{
          padding: "12px 16px", background: "#FEF3C7", borderRadius: 12, marginBottom: 20,
          fontFamily: FONT, fontSize: 13, color: "#92400E", fontStyle: "italic",
          textAlign: "left", borderLeft: "3px solid #F59E0B",
        }}>
          💬 "A press starts a new bet from this hole through the end of the {segment.toLowerCase()}. Same stakes. More risk. More reward."
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 14, fontWeight: 700,
            background: "#EDE7D9", color: "#8B7355",
          }}>
            Cancel
          </button>
          <button onClick={() => { onPress(currentHole); onClose(); }} style={{
            flex: 1, padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 14, fontWeight: 700,
            background: "#2D5016", color: "#fff",
          }}>
            Press! 📌
          </button>
        </div>
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

  // ----------------------------------------------------------------
  // Decomposed hooks — keep local names to minimize downstream diff.
  // All hooks must be declared before any conditional returns (preserves
  // the fix from commit 747ef77 for React error #310).
  // ----------------------------------------------------------------
  const rs = useRoundState();
  const persist = useRoundPersistence();
  const gm = useRoundGameModes();

  // Round state (owned by useRoundState)
  const { currentHole, setCurrentHole } = rs;
  const { scores, setScores } = rs;
  const { totals, setTotals } = rs;
  const { holeResults, setHoleResults } = rs;
  const { hammerDepth, setHammerDepth } = rs;
  const { hammerHistory, setHammerHistory } = rs;
  const { hammerPending, setHammerPending } = rs;
  const { lastHammerBy, setLastHammerBy } = rs;
  const { carryOver, setCarryOver } = rs;
  const { flipTeams, setFlipTeams } = rs;
  // C4B: Flip base-game per-hole state + scorekeeper setup config.
  // flipTeams (legacy static) stays in place during the C4/C5 transition
  // so other call sites (lines ~1476, ~1598) read the current hole's teams
  // without a structural change. New code should read flipState directly.
  const { flipState, setFlipState, flipConfig, setFlipConfig } = rs;
  // C5: Flip crybaby-phase state. Set by the CrybabyTransition "Begin"
  // handler at hole 15 → 16 handoff. Null during holes 1-15 + non-Flip.
  const { crybabyState, setCrybabyState } = rs;
  const { wolfState, setWolfState } = rs;
  const { nassauState, setNassauState } = rs;
  const { nassauPresses, setNassauPresses } = rs;

  // Persistence + network (owned by useRoundPersistence)
  const { isOnline, lastSaveFailed, pendingSync, setPendingSync } = persist;

  // Modal / UI mode state (owned by useRoundGameModes)
  const { showHammer, setShowHammer } = gm;
  const { showResult, setShowResult } = gm;
  const { showCrybabSetup, setShowCrybabSetup } = gm;
  const { crybabConfig, setCrybabConfig } = gm;
  const { showLeaderboard, setShowLeaderboard } = gm;
  const { showLiveFeed, setShowLiveFeed } = gm;
  const { showFlipModal, setShowFlipModal } = gm;
  const { wolfPartner, setWolfPartner } = gm;
  const { isLoneWolf, setIsLoneWolf } = gm;
  const { showWolfModal, setShowWolfModal } = gm;
  const { wolfModalShownForHole, setWolfModalShownForHole } = gm;
  const { showPressModal, setShowPressModal } = gm;
  const { showCancelConfirm, setShowCancelConfirm } = gm;
  const { canceling, setCanceling } = gm;
  const { isCanceled, setIsCanceled } = gm;
  const { showLeaveConfirm, setShowLeaveConfirm } = gm;
  const pendingNavRef = gm.pendingNavRef;

  // Stays local — tightly coupled to round loading / completion flow
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [settlementsSaved, setSettlementsSaved] = useState(false);
  const [totalsInitialized, setTotalsInitialized] = useState(false);

  // Bug 2: pre-completion final-photo gate.
  //   pending  — hole 18 scored, waiting on user decision (gate is visible)
  //   captured — user took a scorecard photo from the gate, apply succeeded
  //   skipped  — user tapped Skip; needs_final_photo has been set in DB
  //
  // The settlements-save useEffect is blocked until decision !== "pending".
  // gateCaptureInFlight tracks when a capture was launched from the gate so
  // onApplied can distinguish it from an earlier ad-hoc capture.
  const [finalPhotoDecision, setFinalPhotoDecision] = useState<"pending" | "captured" | "skipped">("pending");
  const [skipInFlight, setSkipInFlight] = useState(false);
  const gateCaptureInFlightRef = useRef<boolean>(false);

  // PR #18: Explicit scorekeeper confirmation BEFORE auto-finish fires.
  // The round auto-enters completion state when hole 18 is scored, but
  // we now gate the FinalPhotoGate + settlement write on a deliberate
  // "Finish Round" tap. Cancel path leaves the round scored-but-
  // unlocked so the scorekeeper can edit a score or swap the handicap
  // % before committing. `finishConfirmed` is the latch: once true the
  // finish chain runs, never auto-resets.
  const [finishConfirmed, setFinishConfirmed] = useState<boolean>(false);
  // Dialog open state — user-controlled so Cancel truly closes it.
  // Auto-opened ONCE when hole 18 completes (see effect below); after
  // that the scorekeeper re-opens by tapping the sticky Finish button.
  const [showFinishConfirm, setShowFinishConfirm] = useState<boolean>(false);
  const finishAutoOpenedRef = useRef<boolean>(false);

  // Bug 1 carry-over: user-triggered retry for the completion/settlement
  // write. Previously a failure left settlementsSaved=false with the effect
  // auto-re-firing every render (persist + totals are fresh refs each pass),
  // hammering the server. Now a failure sets completionError, which gates
  // the effect until the user taps the toast's Retry action — retryCompletionNonce
  // is bumped + completionError cleared, which re-fires the effect exactly once.
  // completionInFlightRef prevents concurrent runs if the effect is triggered
  // by multiple dep changes in the same render cycle.
  const [completionError, setCompletionError] = useState<"completion" | "settlement" | null>(null);
  const [retryCompletionNonce, setRetryCompletionNonce] = useState<number>(0);
  const completionInFlightRef = useRef<boolean>(false);

  // C4B: per-hole Flip reel visibility. Separate from the round-start
  // `showFlipModal` so the two can coexist cleanly (and the scorekeeper
  // can't accidentally end up with BOTH modals open on hole 1).
  const [showPerHoleFlipReel, setShowPerHoleFlipReel] = useState<boolean>(false);
  // Phase 2 capture: tracks the hole number we most recently applied a
  // capture for. Used to clear the CapturePrompt banner after apply and
  // to re-gate advance on the next hole.
  // PR #27: `lastCapturedHole` state removed — its only consumer was
  // the cadence banner gate (`captureAppliedForCurrent`), which is also
  // gone. The `onApplied` callback below no longer needs to track
  // which hole was last captured because no UI consumes it.

  // Phase 2.5: retro hammer-fix modal state.
  const [showEditHammerModal, setShowEditHammerModal] = useState<boolean>(false);

  // Round is considered complete once all 18 holes have results saved, or explicitly canceled
  const roundIsComplete = settlementsSaved || isCanceled || (currentHole >= 18 && holeResults.length >= 18);

  // --- Phase 2 capture wiring ---
  // useAuth() gives us the current user; scorekeeper visibility + capture
  // auth both key off auth.uid().
  const { user: currentUser } = useAuth();
  const isScorekeeper = Boolean(
    currentUser && dbPlayers.some(p => p.user_id === currentUser.id && p.is_scorekeeper === true),
  );
  // C6.1: the scorekeeper's round_players.id (NOT their auth user_id) for
  // the crybaby-hammer initiator gate. null when the current user isn't
  // a player on this round (spectator / admin viewing someone else's round).
  const currentUserPlayerId = dbPlayers.find(p => p.user_id === currentUser?.id)?.id ?? null;
  const roundIsActiveStatus = dbRound?.status === "active";
  // Bug 3: drives the "Add scorecard photo" prominence on the completed-round
  // view. True only when the scorekeeper skipped the pre-completion gate
  // (Bug 2). Cleared in onApplied after a successful post_round_correction
  // capture.
  const needsFinalPhoto = (dbRound as unknown as { needs_final_photo?: boolean } | null)?.needs_final_photo === true;
  // PR #27: cadence input + cadenceResult removed. The capture-prompt
  // banner that consumed cadenceResult.blockedOnPhoto no longer renders.
  // captureCadence.ts module stays in the tree (still used by the
  // extract-scores edge function), just not consumed by the
  // active-round client anymore.

  // Build the scoresMap shape that CaptureFlow needs: { playerId: { hole: gross } }
  const currentScoresByPlayer: Record<string, Record<number, number>> = {};
  dbPlayers.forEach(p => {
    const raw = (p.hole_scores || {}) as Record<string, number>;
    const converted: Record<number, number> = {};
    for (const [h, v] of Object.entries(raw)) converted[Number(h)] = v;
    currentScoresByPlayer[p.id] = converted;
  });

  // Build capture Player[] from DB rows (name from playerConfig if available).
  const capturePlayers = dbRound
    ? dbPlayers.map(p => {
        const cfg = dbRound.course_details?.playerConfig?.[dbPlayers.indexOf(p)] || {};
        return {
          id: p.id,
          name: p.guest_name || cfg.name || "Player",
          handicap: typeof cfg.handicap === "number" ? cfg.handicap : 0,
          cart: cfg.cart,
          position: cfg.position,
          color: cfg.color || "#3B82F6",
          userId: p.user_id,
        };
      })
    : [];

  const mechanicsList = (dbRound?.course_details?.mechanics || []) as string[];

  // For hammer prompt: build the team split. Phase 2.5 supports DOC/Flip
  // with 4-player teams. Nassau 2v2 could land later. If the round isn't
  // a 4-player hammer mode, hammerTeams stays undefined and the flow
  // skips the hammer step (mechanics.includes('hammer') must ALSO be
  // true for the step to render).
  const hammerTeams = mechanicsList.includes("hammer") && capturePlayers.length === 4
    ? (() => {
        // DOC uses drivers/riders for holes 1-5, then carts. For the
        // capture prompt we use the "whoever is on cart A vs cart B"
        // split as the canonical team split (stable across the round,
        // matches the hammer thrower/responder labels in the UI).
        const cartA = capturePlayers.filter(p => p.cart === "A");
        const cartB = capturePlayers.filter(p => p.cart === "B");
        if (cartA.length === 2 && cartB.length === 2) {
          return {
            A: { name: "Cart A", players: cartA },
            B: { name: "Cart B", players: cartB },
          };
        }
        // Fallback: first two vs last two (covers Flip and unconfigured carts).
        return {
          A: { name: "Team A", players: capturePlayers.slice(0, 2) },
          B: { name: "Team B", players: capturePlayers.slice(2, 4) },
        };
      })()
    : undefined;

  const capture = useCapture({
    base: {
      roundId: roundId || "",
      players: capturePlayers,
      pars: dbRound?.course_details?.pars || Array(18).fill(4),
      handicaps: dbRound?.course_details?.handicaps || Array.from({ length: 18 }, (_, i) => i + 1),
      currentScores: currentScoresByPlayer,
      roundPrivacy: (dbRound?.course_details?.privacy === "private") ? "private" : "public",
      mechanics: mechanicsList,
      hammerTeams,
    },
    onApplied: (result, trigger) => {
      // PR #27: lastCapturedHole tracking removed — the cadence banner
      // that consumed it is gone. Other onApplied side effects
      // (retryNonce bump, FinalPhotoGate decision flip,
      // needs_final_photo clear) are unchanged.
      // Re-fetch would be ideal; for now, the apply-capture server has already
      // persisted changes. The 30s sync useEffect (saveGameState interval) +
      // round_captures realtime subscription will bring the client back in line.
      if (!result.noop) {
        // Force a reload of the round so totals/hole_scores match the server.
        setRetryNonce(n => n + 1);
      }
      // Bug 2: if this apply was launched from the final-photo gate, mark
      // the gate decision as "captured" so the settlements effect proceeds.
      if (gateCaptureInFlightRef.current) {
        gateCaptureInFlightRef.current = false;
        setFinalPhotoDecision("captured");
      }
      // Bug 3: a post_round_correction capture by definition supplies a
      // scorecard photo for the completed round, so clear the pending
      // needs_final_photo flag. Fire-and-forget is fine — the flag is
      // cosmetic (drives the "Add scorecard photo" CTA styling) and the
      // next successful apply will clear it again if this write fails.
      if (trigger === "post_round_correction" && roundId && result.applied && !result.noop) {
        void persist.persistNeedsFinalPhoto(roundId, false);
      }
    },
  });

  // PR #18: Auto-open the Finish Round confirmation ONCE when the
  // scorekeeper crosses into the completed state (hole 18 scored).
  // The ref gate prevents the dialog from re-popping after the user
  // cancels — they control the re-open via the sticky Finish button
  // below. Non-scorekeepers never see the dialog; only the creator
  // can finalize. Already-saved rounds (resumed into completion)
  // don't re-trigger since finishConfirmed is not latched in that
  // case... wait, they DO need to not re-trigger. Extra gate below.
  useEffect(() => {
    if (!isScorekeeper) return;
    if (finishAutoOpenedRef.current) return;
    if (!(currentHole >= 18 && holeResults.length >= 18)) return;
    if (settlementsSaved) return;          // already-finalised round: no dialog
    if (finishConfirmed) return;           // post-refresh with latch somehow set
    if (capture.isOpen) return;            // don't stack over capture flow
    if (showCancelConfirm) return;         // don't stack over cancel dialog
    finishAutoOpenedRef.current = true;
    setShowFinishConfirm(true);
  }, [isScorekeeper, currentHole, holeResults.length, settlementsSaved, finishConfirmed, capture.isOpen, showCancelConfirm]);

  // Guard back-button navigation while round is active
  useEffect(() => {
    if (roundIsComplete) return;
    // Push a duplicate history entry so the back button pops to the same page
    window.history.pushState(null, "", window.location.href);
    const handler = () => {
      // Re-push so repeated back-button presses keep hitting our handler
      window.history.pushState(null, "", window.location.href);
      setShowLeaveConfirm(true);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [roundIsComplete]);

  // Warn on browser refresh / tab close while round is active
  useEffect(() => {
    if (roundIsComplete) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [roundIsComplete]);

  // Cancel round — permanent, preserves scores, clears from active state
  const handleCancelRound = async () => {
    setCanceling(true);
    try {
      await cancelRound(roundId);
      setIsCanceled(true);
      navigate("/feed", { replace: true });
    } catch (err) {
      console.error("Failed to cancel round:", err);
      setCanceling(false);
    }
  };

  // Redirect if no round ID
  useEffect(() => {
    if (!roundId) {
      navigate("/setup", { replace: true });
    }
  }, [roundId, navigate]);

  // Load round from DB — 10-second timeout is enforced inside loadRound() via
  // AbortController. Failures surface as typed RoundLoadError with a kind we
  // dispatch on for the error UI.
  // retryNonce forces a re-fetch when the user taps the Retry button.
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!roundId) return;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const data = await loadRound(roundId);
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
        // Surface typed error kind so the UI can route the recovery path
        if (err instanceof RoundLoadError) {
          setError({ kind: err.kind, message: err.message, roundId: err.roundId });
        } else {
          setError({ kind: "network", message: err?.message || "Failed to load round", roundId });
        }
        setLoading(false);
      }
    };
    load();
  }, [roundId, retryNonce]);

  // Build round object from DB
  const round = dbRound ? {
    gameMode: dbRound.game_type,
    gameName: dbRound.game_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    course: {
      name: dbRound.course,
      pars: dbRound.course_details?.pars || [],
      handicaps: dbRound.course_details?.handicaps || [],
    },
    holeValue: dbRound.course_details?.holeValue ?? 5,
    players: dbPlayers.map((p, i) => {
      const profile = p.user_id ? playerProfiles[p.user_id] : null;
      const config = dbRound.course_details?.playerConfig?.[i] || {};
      // PR #23 D2: normalise cart + position via resolvePlayerCartPosition.
      // Handles three input shapes cleanly:
      //   - new (post-commit-2): { cart: "A"|"B", position: "driver"|"rider" }
      //   - legacy combined string: { cart: "Cart A — Driver", position: null }
      //   - missing / partial: deterministic index-based fallback
      // The engine's getDOCTeams has always expected the canonical shape;
      // this keeps it untouched while making legacy rounds render correctly.
      const { cart, position } = resolvePlayerCartPosition(config, i);
      return {
        id: p.id,
        userId: p.user_id || null,
        name: p.guest_name || profile?.display_name || config.name || `Player ${i + 1}`,
        handicap: config.handicap ?? profile?.handicap ?? 12,
        cart,
        position,
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
      birdieMultiplier: parseInt(dbRound.course_details?.mechanicSettings?.birdie_bonus?.multiplier || "2"),
      pops: (dbRound.course_details?.mechanics || []).includes("pops"),
      noPopsParThree: false,
      carryOverCap: dbRound.course_details?.mechanicSettings?.carry_overs?.cap ?? "∞",
      // PR #17 commit 2: Detect new-world rounds (playerConfig entries
      // tagged with `handicap_percent` audit field). For those the stored
      // handicap IS the adjusted value — engine must not scale again
      // or it double-applies the factor. Legacy rounds keep their raw
      // handicap in playerConfig and expect the engine to scale via
      // settings.handicapPercent, resolved through the fallback chain.
      handicapPercent: (dbRound.course_details?.playerConfig ?? []).some(
        (pc: { handicap_percent?: unknown }) => typeof pc?.handicap_percent === "number",
      )
        ? 100
        : ((dbRound as { handicap_percent?: number | null }).handicap_percent
            ?? dbRound.course_details?.mechanicSettings?.pops?.handicapPercent
            ?? 100),
      presses: (dbRound.course_details?.mechanics || []).includes("presses"),
      pressType: dbRound.course_details?.mechanicSettings?.presses?.autoPress || "Optional (must request)",
    },
  } : null;

  // Initialize state once round loads. If a saved game state exists (round was resumed),
  // override the zero-initialized values so play continues from the right hole and totals.
  useEffect(() => {
    if (round && !totalsInitialized) {
      setTotals(Object.fromEntries(round.players.map(p => [p.id, 0])));
      setIsBroadcast(dbRound?.is_broadcast || false);
      setShowFlipModal(round.gameMode === 'flip');
      setWolfState(initWolfState(round.players));
      setNassauState(initNassauState(round.players));
      setTotalsInitialized(true);

      // Resume from saved state if present
      const saved = (dbRound?.course_details)?.game_state;
      if (saved) {
        if (saved.currentHole > 1) setCurrentHole(saved.currentHole);
        if (saved.carryOver) setCarryOver(saved.carryOver);
        if (saved.totals) setTotals(saved.totals);
        if (saved.hammerHistory) setHammerHistory(saved.hammerHistory);
        // C4B: hydrate Flip base-game state. flipConfig lands from the setup
        // wizard at round creation; flipState accumulates via FlipReel
        // confirmations. Absent on non-Flip rounds.
        if (saved.flipConfig) setFlipConfig(saved.flipConfig as FlipConfigType);
        if (saved.flipState) setFlipState(saved.flipState as import('@/lib/gameEngines').FlipState);
        // C5: hydrate crybaby state if the round resumed past hole 15.
        if (saved.crybabyState) setCrybabyState(saved.crybabyState as CrybabyStateType);

        // Restore per-hole stroke scores from round_players.hole_scores
        const restoredScores = {};
        dbPlayers.forEach(p => {
          if (p.hole_scores && typeof p.hole_scores === "object") {
            Object.entries(p.hole_scores).forEach(([hole, score]) => {
              if (!restoredScores[hole]) restoredScores[hole] = {};
              restoredScores[hole][p.id] = score;
            });
          }
        });
        if (Object.keys(restoredScores).length) setScores(restoredScores);

        // Reconstruct holeResults for all played holes so progress dots,
        // roundIsComplete, and the scorecard work correctly on resume.
        const playedHoles = saved.currentHole > 1 ? saved.currentHole - 1 : 0;
        if (playedHoles > 0) {
          const restored = [];
          for (let h = 1; h <= playedHoles; h++) {
            restored.push({ hole: h, push: false, resumed: true });
          }
          setHoleResults(restored);
        }
      }
    }
  }, [round, totalsInitialized]);

  // Show wolf modal at the start of each hole for wolf game.
  // wolfModalShownForHole tracks whether we've already shown it this hole,
  // preventing it from re-firing when showWolfModal or showCrybabSetup change.
  useEffect(() => {
    if (round?.gameMode === 'wolf' && wolfModalShownForHole !== currentHole && !showCrybabSetup) {
      setWolfPartner(null);
      setIsLoneWolf(false);
      setShowWolfModal(true);
      setWolfModalShownForHole(currentHole);
    }
  }, [currentHole, round?.gameMode, showCrybabSetup, wolfModalShownForHole]);

  // Check if entering crybaby phase
  useEffect(() => {
    if (round && currentHole === 16 && round.settings.crybaby && !crybabConfig) {
      setShowCrybabSetup(true);
    }
  }, [currentHole, round]);

  // User-triggered retry: clears the error flag + bumps the nonce, which is
  // an explicit dep of the completion effect. Defined before the effect so
  // it can be captured in the toast's ToastAction closure.
  const retryCompletion = useCallback(() => {
    setCompletionError(null);
    setRetryCompletionNonce(n => n + 1);
  }, []);

  // Auto-save settlements when round completes.
  //
  // Routes through persistRoundCompletion / persistSettlements (PersistResult
  // envelopes) so failures surface as a toast with a Retry action — no
  // auto-retry loop. `settlementsSaved` only flips to true when BOTH writes
  // succeed. On failure, completionError is set and the effect's guard
  // early-returns until the user taps Retry (which bumps retryCompletionNonce).
  //
  // Bug 2 gate: blocked while finalPhotoDecision === "pending". The
  // FinalPhotoGate modal renders when hole 18 is done and the decision is
  // still pending; the user MUST choose Take Photo or Skip before this
  // effect can save settlements / complete the round.
  useEffect(() => {
    if (!round) return;
    const isComplete = currentHole >= 18 && holeResults.length >= 18;
    if (!isComplete || settlementsSaved || !roundId) return;
    // PR #18: Block completion until the scorekeeper explicitly
    // confirms via the Finish Round dialog. Before this, hole 18
    // auto-fired the save chain — now the dialog gates it so a
    // misread score can still be corrected before money locks.
    if (!finishConfirmed) return;
    if (finalPhotoDecision === "pending") return;
    // After a failure, wait for the user to tap Retry before trying again.
    // This prevents a render-loop (persist + totals are fresh references on
    // every render) from hammering the server.
    if (completionError) return;
    // Render-loop concurrency guard: a dep change that happens mid-flight
    // should not start a second in-flight attempt.
    if (completionInFlightRef.current) return;
    completionInFlightRef.current = true;

    const saveRoundSettlements = async () => {
      try {
        const completionResult = await persist.persistRoundCompletion(roundId);
        if (!completionResult.ok) {
          setCompletionError("completion");
          toast({
            title: "Couldn't finalize round",
            description: "We saved your scores. Tap Retry to finalize.",
            variant: "destructive",
            action: (
              <ToastAction altText="Retry finalizing the round" onClick={retryCompletion}>
                Retry
              </ToastAction>
            ),
          });
          return;
        }

        // C7: Flip rounds persist both the combined `amount` AND the
        // two-component split (base_amount / crybaby_amount) so audit
        // + round-summary can show "how much of your total came from
        // the base game vs. the crybaby comeback". Non-Flip rounds
        // leave the split fields undefined → NULL in the DB.
        //
        // All-square sentinel (crybabyState.crybaby === ""): pass
        // `crybabyWasPlayed: false` so holes 16-18 money rolls into
        // baseAmount and crybabyAmount is an explicit $0 rather than
        // NULL. See computeFlipSettlementSplit for the branching.
        const splitThisRound = roundHasFlipSettlementSplit(round.gameMode as GameMode);
        const crybabyWasPlayed = Boolean(
          crybabyState && crybabyState.crybaby && crybabyState.crybaby !== "",
        );
        const settlementData = round.players.map(p => {
          const base: {
            userId: string | null;
            guestName: string | null;
            amount: number;
            baseAmount?: number;
            crybabyAmount?: number;
          } = {
            userId: p.userId || null,
            guestName: p.userId ? null : p.name,
            amount: totals[p.id] || 0,
          };
          if (splitThisRound) {
            const split = computeFlipSettlementSplit(
              holeResults as (HoleResult & { hole: number })[],
              p.id,
              crybabyWasPlayed,
            );
            base.baseAmount = split.baseAmount;
            base.crybabyAmount = split.crybabyAmount;
          }
          return base;
        });
        // PR #19: Scorecard rounds never write settlement rows — there's
        // no money to record. Leaving round_settlements empty makes
        // `isMoneyRound = settlements.length > 0` on the round detail
        // page return false naturally, which hides every money surface.
        if (!hasMoneyMode) {
          setSettlementsSaved(true);
          completionInFlightRef.current = false;
          return;
        }
        const settlementResult = await persist.persistSettlements(roundId, settlementData);
        if (!settlementResult.ok) {
          setCompletionError("settlement");
          toast({
            title: "Couldn't save settlements",
            description: "Round finalized. Tap Retry to save settlement amounts.",
            variant: "destructive",
            action: (
              <ToastAction altText="Retry saving settlements" onClick={retryCompletion}>
                Retry
              </ToastAction>
            ),
          });
          return;
        }

        setSettlementsSaved(true);
      } finally {
        completionInFlightRef.current = false;
      }
    };
    saveRoundSettlements();
  }, [currentHole, holeResults.length, settlementsSaved, roundId, persist, round, totals, finalPhotoDecision, completionError, retryCompletionNonce, retryCompletion, finishConfirmed]);

  // Bug 2: final-photo gate handlers.
  //
  // Take Photo: launch CaptureFlow ad-hoc on holeRange [1, 18]. We set the
  // ref before opening so onApplied (above) knows this capture came from
  // the gate and can flip decision → "captured". If the user cancels the
  // flow mid-way, the ref is cleared by onCancel (handled below) and the
  // gate re-renders.
  const handleTakeFinalPhoto = useCallback(() => {
    gateCaptureInFlightRef.current = true;
    capture.openAdHoc();
  }, [capture]);

  // Skip: persist needs_final_photo=true, then flip decision → "skipped"
  // so the settlements effect proceeds. On failure we keep the gate open
  // and toast — the completion flow intentionally does NOT proceed without
  // either a photo or the skip-flag recorded.
  const handleSkipFinalPhoto = useCallback(async () => {
    if (!roundId) return;
    setSkipInFlight(true);
    const result = await persist.persistNeedsFinalPhoto(roundId, true);
    setSkipInFlight(false);
    if (!result.ok) {
      toast({
        title: "Couldn't save your choice",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
      return;
    }
    setFinalPhotoDecision("skipped");
  }, [roundId, persist]);

  // If the user cancels the capture flow mid-way after launching it from
  // the gate, clear the ref so they land back on the gate with no state
  // change. (capture.activeCapture goes null on cancel; watch the open
  // state and reset the ref when the flow closes without having flipped
  // the decision.)
  useEffect(() => {
    if (!capture.isOpen && gateCaptureInFlightRef.current && finalPhotoDecision === "pending") {
      gateCaptureInFlightRef.current = false;
    }
  }, [capture.isOpen, finalPhotoDecision]);

  // PR #24 commit 1: Scorecard auto-advance. The HoleResultCard modal is
  // gated off for scorecard rounds (no money to surface), so when
  // submitHole sets showResult, we immediately kick advanceHole — which
  // consumes the state, updates totals/holeResults, and moves to the next
  // hole. Guard on gameMode to keep other modes' click-to-dismiss UX
  // intact.
  //
  // Originally introduced in PR #19 BELOW the early returns — a
  // rules-of-hooks violation that caused React #310 on every round
  // creation. Moved here above the loading/error guards so the hook
  // count stays invariant across all renders. See PR #24 recon for the
  // full archaeology. DO NOT move this effect below the early returns
  // again — the regression test at src/test/hookPositionInvariant.test.ts
  // will fail if you do.
  useEffect(() => {
    if (!round) return;
    if (round.gameMode !== 'scorecard') return;
    if (!showResult) return;
    advanceHole();
    // Purposely omit advanceHole from deps: it's a closure recreated
    // every render, and re-running this effect on closure identity
    // would cause redundant auto-advance calls. showResult is the
    // only trigger we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResult, round?.gameMode]);

  // Online/offline wiring is owned by useRoundPersistence.

  // --- Early returns (after all hooks) ---
  if (loading) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#8B7355" }}>Loading round...</div>
        </div>
      </div>
    );
  }

  if (error || !round) {
    // Pattern-match the typed error kind to pick the right recovery path.
    const kind = error?.kind || (error ? "network" : "not_found");
    const copy = {
      timeout: {
        emoji: "📶",
        title: "Connection Lost",
        body: "Looks like your signal took a mulligan. Check your connection and try again.",
        primary: "Try Again",
        onPrimary: () => setRetryNonce(n => n + 1),
      },
      not_found: {
        emoji: "⛳",
        title: "Round Not Found",
        body: "This round may have ended or the link is no longer valid. Head back and start fresh.",
        primary: "Back to Home",
        onPrimary: () => navigate("/feed"),
      },
      unauthorized: {
        emoji: "🔒",
        title: "Sign in required",
        body: "Your session expired. Sign in to keep scoring.",
        primary: "Sign In",
        onPrimary: () => navigate("/auth"),
      },
      network: {
        emoji: "⚠️",
        title: "Couldn't load round",
        body: "Something went wrong loading this round. Tap retry or head home.",
        primary: "Try Again",
        onPrimary: () => setRetryNonce(n => n + 1),
      },
    }[kind];

    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 56, marginBottom: 16, lineHeight: 1 }}>{copy.emoji}</div>
          <div style={{
            fontFamily: "'Pacifico', cursive", fontSize: 22, color: "#1E130A", marginBottom: 8,
          }}>
            {copy.title}
          </div>
          <div style={{ fontSize: 14, color: "#8B7355", lineHeight: 1.5, marginBottom: 28 }}>
            {copy.body}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={copy.onPrimary} style={{
              padding: "14px 24px", borderRadius: 14, border: "none", cursor: "pointer",
              fontFamily: FONT, fontSize: 15, fontWeight: 700,
              background: "#1E130A", color: "#FAF5EC",
            }}>
              {copy.primary}
            </button>
            <button onClick={() => navigate("/setup")} style={{
              padding: "12px 24px", borderRadius: 14, border: "2px solid #DDD0BB", cursor: "pointer",
              fontFamily: FONT, fontSize: 14, fontWeight: 600,
              background: "transparent", color: "#8B7355",
            }}>
              Start New Round
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Derived state (safe after early returns guarantee round exists) ---
  const { players, course, settings } = round;

  const par = course.pars[currentHole - 1];
  const holeHandicap = course.handicaps[currentHole - 1];
  const lowestHandicap = Math.min(...players.map(p => p.handicap));

  const phase = getPhaseLabel(round.gameMode, currentHole);

  // PR #19: Suppress every money-UI surface (leaderboard chin, per-hole
  // result card amounts, settlement write) when the round doesn't play
  // for money. Scorecard is the only no-money mode today; the flag is
  // written to match future additions (e.g., a practice-round mode).
  const hasMoneyMode = round.gameMode !== 'scorecard';

  function buildWolfTeams() {
    const wolfId = getWolfForHole(wolfState, currentHole);
    const wolf = players.find(p => p.id === wolfId);
    if (!wolf) return null;
    if (isLoneWolf) {
      return {
        teamA: { name: `${wolf.name} (Lone Wolf)`, players: [wolf], color: '#8B5CF6' },
        teamB: { name: 'The Pack', players: players.filter(p => p.id !== wolfId), color: '#DC2626' },
      };
    }
    const partner = players.find(p => p.id === wolfPartner);
    if (!partner) return null;
    return {
      teamA: { name: 'Wolf Team', players: [wolf, partner], color: '#8B5CF6' },
      teamB: { name: 'The Pack', players: players.filter(p => p.id !== wolfId && p.id !== wolfPartner), color: '#DC2626' },
    };
  }

  const teams = round.gameMode === 'flip'
    ? flipTeams
    : round.gameMode === 'wolf'
    ? (wolfPartner || isLoneWolf ? buildWolfTeams() : null)
    : supportsTeams(round.gameMode) ? getTeamsForHole(round.gameMode, currentHole, players) : null;

  const currentScores = scores[currentHole] || {};
  const allScored = players.every(p => currentScores[p.id] != null);
  const effectiveHoleValue = round.holeValue * Math.pow(2, hammerDepth) + carryOver;

  const currentCrybaby = Object.entries(totals).sort((a, b) => a[1] - b[1])[0] || [null, 0];
  const crybabyCandidateId = currentCrybaby[1] < 0 ? currentCrybaby[0] : null;

  const handleScoreChange = (playerId, score) => {
    setScores(prev => ({
      ...prev,
      [currentHole]: { ...prev[currentHole], [playerId]: score },
    }));
  };

  const carryOverCap = settings.carryOverCap || "∞";

  const handleHammer = () => {
    if (hammerPending) return;
    setLastHammerBy(null);
    setHammerPending(false);
    setShowHammer(true);
  };

  const handleHammerThrow = (teamId) => {
    setLastHammerBy(teamId);
    setHammerPending(true);
  };

  const handleHammerAccept = () => {
    setHammerDepth(d => d + 1);
    setHammerPending(false);
    setShowHammer(false);

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
      setShowHammer(false);
      return;
    }
    const foldValue = round.holeValue * Math.pow(2, hammerDepth) + carryOver;
    const throwingTeamId = lastHammerBy;
    const result = makeFoldResult(foldValue, throwingTeamId);
    setShowHammer(false);
    setHammerPending(false);
    setShowResult(result);
  };

  const handleHammerBack = () => {
    const newThrower = lastHammerBy === "A" ? "B" : "A";
    setLastHammerBy(newThrower);
    setHammerPending(true);
    setShowHammer(true);
  };

  const makeFoldResult = (value, winnerTeamId) => {
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

  // PR #24 commit 1: Scorecard auto-advance useEffect MOVED to the
  // top-of-body hook block above the early returns. See the relocated
  // copy earlier in this component; leaving this stub comment here as
  // a marker so a future `grep "PR #19: Scorecard auto-advance"` lands
  // near the historical position.

  const calculateHoleResult = () => {
    const cs = scores[currentHole];
    const gameMode = round.gameMode;

    // C6: Flip crybaby sub-game (holes 16-18 when a crybaby exists).
    // Payout math is completely separate from the base-game 3v2 engine
    // — see calculateCrybabyHoleResult for the asymmetric stakes logic.
    // The "all-square" case (crybabyState.crybaby === "") intentionally
    // skips this branch and falls through to the base-game team path
    // below, continuing Flip holes 16-18 as an extension of 1-15.
    if (
      gameMode === 'flip' &&
      currentHole >= 16 &&
      currentHole <= 18 &&
      crybabyState &&
      crybabyState.crybaby !== "" &&
      crybabyState.byHole[currentHole]
    ) {
      const choice = crybabyState.byHole[currentHole];
      const twoManTeam = choice.teams.teamA;
      const threeManTeam = choice.teams.teamB;
      const netScoresCry: Record<string, number> = {};
      players.forEach(p => {
        const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicap, settings.handicapPercent) : 0;
        netScoresCry[p.id] = cs[p.id] - strokes;
      });
      const twoManBest = Math.min(...twoManTeam.players.map(p => netScoresCry[p.id]));
      const threeManBest = Math.min(...threeManTeam.players.map(p => netScoresCry[p.id]));
      const twoManWon: boolean | null = twoManBest < threeManBest
        ? true
        : threeManBest < twoManBest
          ? false
          : null;
      const crybabyResult = calculateCrybabyHoleResult({
        bet: choice.bet,
        crybabyId: crybabyState.crybaby,
        partnerId: choice.partner,
        players,
        twoManWon,
      });
      return {
        push: crybabyResult.push,
        winnerName: crybabyResult.winningSide === null
          ? null
          : crybabyResult.winningSide === 'A' ? twoManTeam.name : threeManTeam.name,
        amount: Math.abs(crybabyResult.perPlayer.find(p => p.amount > 0)?.amount ?? 0),
        carryOver: 0, // crybaby holes are independent — no rolling window
        playerResults: crybabyResult.perPlayer,
        quip: crybabyResult.push
          ? "Crybaby push. Money back."
          : crybabyResult.winningSide === 'A'
            ? `${twoManTeam.name} takes it. Crybaby's comeback continues.`
            : `The pack wins. ${crybabyState.crybaby === crybabyState.crybaby ? "Crybaby" : ""} holds on by a thread.`,
      };
    }

    // PR #19: Scorecard — pure score-tracking. No money, no teams.
    // Engine returns a zero-amount HoleResult that carries nothing,
    // wins nothing, quips "Scored." The runtime's money-UI surfaces
    // gate on `hasMoneyMode` (below) so the user never sees $0 chin.
    if (gameMode === 'scorecard') {
      return calculateScorecardResult(players);
    }

    // Skins — individual scoring
    if (gameMode === 'skins' || gameMode === 'custom') {
      return calculateSkinsResult(players, cs, par, currentHole, round.holeValue, carryOver, round.settings, lowestHandicap, holeHandicap);
    }

    // Nassau — match play per hole
    if (gameMode === 'nassau') {
      return calculateNassauHoleResult(players, teams, cs, par, currentHole, round.holeValue, round.settings, lowestHandicap, holeHandicap);
    }

    // Wolf — wolf vs pack scoring
    if (gameMode === 'wolf') {
      const wolfId = getWolfForHole(wolfState, currentHole);
      return calculateWolfHoleResult(players, cs, par, round.holeValue, wolfId, wolfPartner, isLoneWolf, round.settings, lowestHandicap, holeHandicap);
    }

    // Team-based games (DOC, Flip) — use inline team logic
    if (!teams) {
      // DOC crybaby phase (holes 16–18) has no team structure — fall back to
      // individual skins scoring so the hole can always be completed
      return calculateSkinsResult(players, cs, par, currentHole, round.holeValue, carryOver, round.settings, lowestHandicap, holeHandicap);
    }

    // Calculate net scores using the imported getStrokesOnHole
    const netScores = {};
    players.forEach(p => {
      const strokes = settings.pops ? getStrokesOnHole(p.handicap, lowestHandicap, holeHandicap, settings.handicapPercent) : 0;
      netScores[p.id] = cs[p.id] - strokes;
    });

    // Team best ball
    const teamABest = Math.min(...teams.teamA.players.map(p => netScores[p.id]));
    const teamBBest = Math.min(...teams.teamB.players.map(p => netScores[p.id]));

    // Birdie bonus
    const bestGross = Math.min(...Object.values(cs));
    const bestGrossPlayer = players.find(p => cs[p.id] === bestGross);
    const hasGrossBirdie = bestGross < par && settings.birdieBonus;

    let birdieMultiplier = 1;
    let birdieForcedPush = false;

    if (hasGrossBirdie) {
      const grossBirdieTeamA = teams.teamA.players.some(p => cs[p.id] < par);
      const grossBirdieTeamB = teams.teamB.players.some(p => cs[p.id] < par);
      const teamAHasNetBirdie = teams.teamA.players.some(p => netScores[p.id] < par);
      const teamBHasNetBirdie = teams.teamB.players.some(p => netScores[p.id] < par);

      if ((grossBirdieTeamA && teamBHasNetBirdie) || (grossBirdieTeamB && teamAHasNetBirdie)) {
        birdieForcedPush = true;
      } else {
        birdieMultiplier = settings.birdieMultiplier;
      }
    }

    if (birdieForcedPush) {
      const rawCarry = round.holeValue * Math.pow(2, hammerDepth) + carryOver;
      let cappedCarry = rawCarry;
      if (carryOverCap === "None") cappedCarry = 0;
      else if (carryOverCap !== "∞") cappedCarry = Math.min(rawCarry, round.holeValue * parseInt(carryOverCap));
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
      const rawCarry = round.holeValue * Math.pow(2, hammerDepth) * birdieMultiplier + carryOver;
      let cappedCarry = rawCarry;
      if (carryOverCap === "None") cappedCarry = 0;
      else if (carryOverCap !== "∞") cappedCarry = Math.min(rawCarry, round.holeValue * parseInt(carryOverCap));
      return {
        push: true,
        winnerName: null,
        amount: 0,
        carryOver: cappedCarry,
        playerResults: players.map(p => ({ id: p.id, name: p.name, amount: 0 })),
        quip: cappedCarry === 0 ? "Push. No carry-overs — clean slate next hole." : getQuip("push"),
      };
    }

    const winnerTeam = teamABest < teamBBest ? "A" : "B";
    const winTeam = winnerTeam === "A" ? teams.teamA : teams.teamB;
    const loseTeam = winnerTeam === "A" ? teams.teamB : teams.teamA;

    const playerResults = players.map(p => {
      const isWinner = winTeam.players.some(tp => tp.id === p.id);
      return { id: p.id, name: p.name, amount: isWinner ? holeVal : -holeVal };
    });

    let quip;
    if (hasGrossBirdie && birdieMultiplier > 1) {
      quip = getQuip("birdie", { player: bestGrossPlayer.name });
    } else if (holeVal >= round.holeValue * 3) {
      quip = getQuip("big_swing", { amount: holeVal * 2 });
    } else {
      quip = getQuip("team_win", { team: winTeam.name, losingTeam: loseTeam.name, amount: holeVal });
    }

    return { push: false, winnerName: winTeam.name, amount: holeVal, carryOver: 0, playerResults, quip };
  };

  const advanceHole = () => {
    if (showResult) {
      // --- Nassau: compute the post-hole state, then derive totals from segment settlement ---
      // For Nassau, per-hole amounts are always 0 (see calculateNassauHoleResult). Money comes
      // from segment/press bets settled via calculateNassauSettlement. We compute the new
      // nassauState synchronously here so we can feed it to the settlement function without
      // waiting for React's setState to flush.
      let newNassauState = nassauState;
      let newTotals = { ...totals };

      if (round.gameMode === 'nassau') {
        // Apply this hole's winners to a fresh copy of nassauState
        const winnerIds = (showResult.winnerIds && showResult.winnerIds.length > 0)
          ? showResult.winnerIds
          : showResult.playerResults.filter(pr => pr.amount > 0).map(pr => pr.id); // legacy fallback
        newNassauState = {
          frontMatch: { ...nassauState.frontMatch },
          backMatch: { ...nassauState.backMatch },
          overallMatch: { ...nassauState.overallMatch },
          presses: nassauState.presses.map(p => ({ startHole: p.startHole, match: { ...p.match } })),
        };
        if (!showResult.push && winnerIds.length > 0) {
          const bump = (map, id) => { map[id] = (map[id] || 0) + 1; };
          winnerIds.forEach(wid => {
            if (currentHole <= 9) bump(newNassauState.frontMatch, wid);
            else bump(newNassauState.backMatch, wid);
            bump(newNassauState.overallMatch, wid);
          });
          newNassauState.presses = newNassauState.presses.map(press => {
            // Press runs from startHole through end of its segment (hole 9 for a
            // front-9 press, hole 18 for a back-9 press). Don't credit holes past
            // the segment boundary.
            const segmentEnd = press.startHole <= 9 ? 9 : 18;
            if (currentHole >= press.startHole && currentHole <= segmentEnd) {
              const updated = { ...press.match };
              winnerIds.forEach(wid => bump(updated, wid));
              return { ...press, match: updated };
            }
            return press;
          });
        }
        setNassauState(newNassauState);

        // Derive provisional totals from segment settlement based on holes completed so far
        const nassauTeams = round.players.length === 4
          ? {
              teamA: { name: 'Team 1', players: [round.players[0], round.players[1]], color: '#16A34A' },
              teamB: { name: 'Team 2', players: [round.players[2], round.players[3]], color: '#3B82F6' },
            }
          : null;
        const settlement = calculateNassauSettlement(
          round.players,
          nassauTeams,
          newNassauState,
          round.holeValue,
          currentHole, // completedHoles = this hole just wrapped
        );
        round.players.forEach(p => {
          newTotals[p.id] = settlement.playerAmounts[p.id] || 0;
        });
      } else {
        // Non-Nassau modes: sum per-hole amounts as before
        showResult.playerResults.forEach(pr => {
          newTotals[pr.id] = (newTotals[pr.id] || 0) + pr.amount;
        });
      }

      setTotals(newTotals);
      setHoleResults(prev => [...prev, { hole: currentHole, ...showResult }]);
      // Determine fold winner team from playerResults if folded
      let foldWinnerTeamId = null;
      if (showResult.folded && teams) {
        const winnerPlayer = showResult.playerResults.find(pr => pr.amount > 0);
        if (winnerPlayer) {
          foldWinnerTeamId = teams.teamA.players.some(p => p.id === winnerPlayer.id) ? "A" : "B";
        }
      }
      const newHammerHistory = [...hammerHistory, {
        hole: currentHole,
        hammerDepth,
        folded: !!showResult.folded,
        foldWinnerTeamId,
      }];
      setHammerHistory(newHammerHistory);
      setCarryOver(showResult.carryOver || 0);
      setHammerDepth(0);
      setHammerPending(false);
      setLastHammerBy(null);
      setShowResult(null);
      setPendingSync(ps => ps + 1);

      // Persist scores + money totals to DB after every hole — guards against app kill / backgrounding
      if (roundId) {
        players.forEach(p => {
          const playerHoleScores = {};
          Object.entries(scores).forEach(([hole, holeScores]) => {
            if (holeScores[p.id] != null) playerHoleScores[hole] = holeScores[p.id];
          });
          updatePlayerScores(p.id, playerHoleScores, newTotals[p.id] || 0)
            .catch(err => console.error("Failed to persist player scores:", err));
        });

        // Save game state checkpoint so the round can be resumed if the app is killed.
        // If offline, mark lastSaveFailed so the UI shows a warning badge.
        const nextHole = currentHole < 18 ? currentHole + 1 : 18;
        const newCarryOver = showResult.carryOver || 0;
        saveGameState(roundId, { currentHole: nextHole, carryOver: newCarryOver, totals: newTotals, hammerHistory: newHammerHistory })
          .then(() => setLastSaveFailed(false))
          .catch(err => {
            console.error("Failed to save game state:", err);
            setLastSaveFailed(true);
          });
      }

      // Nassau state update is handled inline above (see newNassauState).

      // Emit live feed event
      if (roundId) {
        const holeScores = scores[currentHole] || {};
        const eventType = showResult.push ? "push" : showResult.folded ? "hammer_fold" : "team_win";

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

        players.forEach(p => {
          const score = holeScores[p.id];
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

  // C4B: handle a flip confirm — used by both the initial round-start reel
  // (locks hole 1 teams) and the per-hole flip button (locks hole N teams
  // for hole N >= 2). Writes the current-hole teams into:
  //   - flipState.teamsByHole[N]       (new per-hole shape, source of truth)
  //   - flipTeams (legacy single-team)  (backward compat for existing reads)
  // Then persists game_state via the PersistResult wrapper.
  const handleFlipConfirm = (teams: FlipTeamInfo, forHole?: number) => {
    const targetHole = forHole ?? Math.max(1, currentHole);
    const nextFlipState = commitFlipTeams(flipState, targetHole, teams);
    setFlipTeams(teams);
    setFlipState(nextFlipState);
    setShowFlipModal(false);
    setShowPerHoleFlipReel(false);
    if (roundId) {
      // Persist through useRoundPersistence (PersistResult wrapper) so a
      // network failure surfaces as a toast instead of a silent swallow.
      void persist.persistGameState(roundId, {
        currentHole, carryOver, totals, hammerHistory,
        flipState: nextFlipState,
        flipConfig: flipConfig ?? undefined,
        rollingCarryWindow: rs.rollingCarryWindow ?? undefined,
      }).then(result => {
        if (!result.ok) {
          toast({
            title: "Couldn't save flip teams",
            description: result.error.message,
            variant: "destructive",
            action: (
              <ToastAction altText="Retry saving flip teams" onClick={() => handleFlipConfirm(teams, targetHole)}>
                Retry
              </ToastAction>
            ),
          });
        }
      });
    }
  };

  // C5: Crybaby transition "Begin" handler — stamp CrybabyState from the
  // resolved identification + persist. Runs once at hole 15 → 16 handoff
  // for Flip rounds. When no crybaby applies (all balances >= 0), we
  // store a minimal CrybabyState with crybaby=null so the UI knows we've
  // passed the gate; C6 / C7 handle the skip-crybaby path.
  const handleCrybabyBegin = (identification: CrybabyIdentification) => {
    // Build the CrybabyState payload. crybaby === null means no one in the
    // hole — we persist an empty state so the transition doesn't re-fire,
    // and C7 settlement path can see "no crybaby" as an explicit signal.
    const next: CrybabyStateType = identification.crybaby
      ? {
          crybaby: identification.crybaby,
          losingBalance: identification.losingBalance,
          maxBetPerHole: identification.maxBetPerHole,
          byHole: {},
          tiebreakOutcome: identification.tiebreakOutcome,
        }
      : {
          crybaby: "",        // empty sentinel — UI reads null vs "" as "no crybaby this round"
          losingBalance: 0,
          maxBetPerHole: 0,
          byHole: {},
        };
    setCrybabyState(next);
    if (roundId) {
      void persist.persistGameState(roundId, {
        currentHole, carryOver, totals, hammerHistory,
        flipState,
        flipConfig: flipConfig ?? undefined,
        rollingCarryWindow: rs.rollingCarryWindow ?? undefined,
        crybabyState: next,
      }).then(result => {
        if (!result.ok) {
          toast({
            title: "Couldn't save crybaby selection",
            description: result.error.message,
            variant: "destructive",
            action: (
              <ToastAction altText="Retry saving crybaby selection" onClick={() => handleCrybabyBegin(identification)}>
                Retry
              </ToastAction>
            ),
          });
        }
      });
    }
  };

  // C6: Per-crybaby-hole setup confirm. Writes the scorekeeper's
  // { bet, partner, teams } choice into CrybabyState.byHole[currentHole]
  // and persists. The render gate below falls through to the scoring UI
  // once byHole[currentHole] is present; submit-hole will use the crybaby
  // payout engine instead of the base-game 3v2 formula.
  const handleCrybabyHoleSetupConfirm = (
    choice: { bet: number; partner: string; teams: FlipTeamInfo },
  ) => {
    if (!crybabyState?.crybaby) return;
    const nextByHole: Record<number, CrybabyHoleChoice> = {
      ...crybabyState.byHole,
      [currentHole]: {
        bet: choice.bet,
        partner: choice.partner,
        teams: choice.teams,
      },
    };
    const nextCrybaby: CrybabyStateType = { ...crybabyState, byHole: nextByHole };
    setCrybabyState(nextCrybaby);
    if (roundId) {
      void persist.persistGameState(roundId, {
        currentHole, carryOver, totals, hammerHistory,
        flipState,
        flipConfig: flipConfig ?? undefined,
        rollingCarryWindow: rs.rollingCarryWindow ?? undefined,
        crybabyState: nextCrybaby,
      }).then(result => {
        if (!result.ok) {
          toast({
            title: `Couldn't save hole ${currentHole} setup`,
            description: result.error.message,
            variant: "destructive",
            action: (
              <ToastAction altText={`Retry saving hole ${currentHole} setup`} onClick={() => handleCrybabyHoleSetupConfirm(choice)}>
                Retry
              </ToastAction>
            ),
          });
        }
      });
    }
  };

  const handleWolfPartner = (partnerId) => {
    setWolfPartner(partnerId);
    setIsLoneWolf(false);
    setShowWolfModal(false);
  };

  const handleLoneWolf = () => {
    setWolfPartner(null);
    setIsLoneWolf(true);
    setShowWolfModal(false);
  };

  const handleNassauPress = (startHole) => {
    const init = {};
    players.forEach(p => { init[p.id] = 0; });
    const newPress = { startHole, match: init };
    // Keep both in sync — advanceHole reads nassauState.presses to track holes won per press
    setNassauPresses(prev => [...prev, newPress]);
    setNassauState(prev => ({ ...prev, presses: [...prev.presses, newPress] }));
  };

  // Completed round
  if (currentHole >= 18 && holeResults.length >= 18) {
    const sorted = [...players].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
    const crybabyPlayer = sorted[sorted.length - 1];
    const winner = sorted[0];
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: "#F5EFE0", fontFamily: FONT }}>
        <div style={{
          background: "linear-gradient(135deg, #1E130A 0%, #374151 100%)",
          padding: "60px 24px 32px", borderRadius: "0 0 32px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Round Complete</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
            {round.gameName} · {course.name}
          </div>
        </div>

        <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {sorted.map((p, i) => {
            const amount = totals[p.id] || 0;
            const isCrybab = i === sorted.length - 1 && amount < 0;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
                background: isCrybab ? "#FEF2F2" : "#fff", borderRadius: 16,
                boxShadow: i === 0 ? "0 0 0 2px #2D5016, 0 4px 12px rgba(45,80,22,0.15)" : "0 1px 3px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 20, width: 32, textAlign: "center" }}>{i === 0 ? "🏆" : isCrybab ? "🍼" : `#${i + 1}`}</div>
                <div style={{
                  width: 40, height: 40, borderRadius: 20, background: p.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, fontWeight: 700,
                }}>{p.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1E130A" }}>{p.name}</div>
                  {isCrybab && <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}>CRYBABY</div>}
                </div>
                <span style={{
                  fontFamily: MONO, fontSize: 22, fontWeight: 800,
                  color: amount > 0 ? "#2D5016" : amount < 0 ? "#DC2626" : "#A8957B",
                }}>
                  {amount >= 0 ? "+" : ""}${amount}
                </span>
              </div>
            );
          })}

          {/* Nassau summary */}
          {round.gameMode === 'nassau' && (
            <div style={{
              background: "#FAF5EC", borderRadius: 16, padding: 20,
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 14 }}>
                Nassau Breakdown
              </div>
              {['Front 9', 'Back 9', 'Overall'].map((label, idx) => {
                const match = idx === 0 ? nassauState.frontMatch : idx === 1 ? nassauState.backMatch : nassauState.overallMatch;
                const sortedMatch = [...players].sort((a, b) => (match[b.id] || 0) - (match[a.id] || 0));
                const topWins = match[sortedMatch[0]?.id] || 0;
                return (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#8B7355", marginBottom: 4 }}>{label}</div>
                    {sortedMatch.map(p => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontFamily: MONO, fontSize: 12 }}>
                        <span style={{ color: "#1E130A" }}>{p.name}</span>
                        <span style={{ color: (match[p.id] || 0) === topWins && topWins > 0 ? "#2D5016" : "#A8957B" }}>{match[p.id] || 0} wins</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {nassauPresses.length > 0 && (
                <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: "#F59E0B" }}>
                  📌 {nassauPresses.length} press{nassauPresses.length > 1 ? "es" : ""} played
                </div>
              )}
            </div>
          )}

          {/* Settlement */}
          <div style={{
            background: "#FAF5EC", borderRadius: 16, padding: 20, marginTop: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 14 }}>
              Settlement
            </div>
            {(() => {
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
                  <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355" }}>
                    <span style={{ fontWeight: 600, color: "#DC2626" }}>{s.from}</span>
                    {" → "}
                    <span style={{ fontWeight: 600, color: "#2D5016" }}>{s.to}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "#1E130A" }}>
                    ${s.amount}
                  </span>
                </div>
              ));
            })()}
            <button
              onClick={() => {
                const balances = players.map(p => ({ ...p, balance: totals[p.id] || 0 }));
                const debtors = balances.filter(p => p.balance < 0).sort((a, b) => a.balance - b.balance);
                const creditors = balances.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);
                let di = 0, ci = 0;
                const deb = debtors.map(d => ({ ...d, owed: -d.balance }));
                const cred = creditors.map(c => ({ ...c, owed: c.balance }));
                const lines = [];
                while (di < deb.length && ci < cred.length) {
                  const amount = Math.min(deb[di].owed, cred[ci].owed);
                  if (amount > 0) lines.push(`${deb[di].name} owes ${cred[ci].name} $${amount}`);
                  deb[di].owed -= amount;
                  cred[ci].owed -= amount;
                  if (deb[di].owed === 0) di++;
                  if (cred[ci].owed === 0) ci++;
                }
                const text = lines.length
                  ? `Crybaby Golf — ${round.gameName} at ${course.name}\n\n${lines.join("\n")}`
                  : `Crybaby Golf — ${round.gameName} at ${course.name}\n\nAll square — nobody owes anything.`;
                if (navigator.share) {
                  navigator.share({ title: "Crybaby Golf Settlement", text }).catch(() => {});
                } else {
                  navigator.clipboard?.writeText(text).then(() => alert("Settlement copied to clipboard!")).catch(() => {});
                }
              }}
              style={{
                width: "100%", padding: "14px", borderRadius: 12, border: "none", marginTop: 14,
                fontFamily: FONT, fontSize: 14, fontWeight: 700,
                background: "#2D5016", color: "#fff", cursor: "pointer",
              }}
            >
              Send Reminders 📲
            </button>
          </div>

          {/* Recap */}
          <div style={{
            background: "#EEF5E5", borderRadius: 16, padding: "16px 18px",
            borderLeft: "4px solid #2D5016",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1A3009", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Round Recap
            </div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#1A3009", fontStyle: "italic", lineHeight: 1.5 }}>
              💬 "{winner.name} walked away with +${totals[winner.id]}. {crybabyPlayer.name} is this round's crybaby at -${Math.abs(totals[crybabyPlayer.id])}. {holeResults.filter(h => h.folded).length > 0 ? `${holeResults.filter(h => h.folded).length} hammer${holeResults.filter(h => h.folded).length > 1 ? 's' : ''} folded — chicken dinner for someone. ` : ""}{carryOver > 0 ? `$${carryOver} left on the table in carry-overs. ` : ""}Another day, another dollar. Or several."
            </div>
          </div>

          <div style={{
            padding: "10px 14px", background: "#FEF3C7", borderRadius: 12,
            fontFamily: FONT, fontSize: 12, color: "#92400E", textAlign: "center",
          }}>
            📸 Round photos and full results will post to your feed
          </div>

          {/* Bug 3: post-completion capture CTA.
              Scorekeeper-only. Always available on completed rounds.
              Two visual states:
                - needs_final_photo: amber, primary-prominence ("Add
                  scorecard photo"). The user skipped the pre-completion
                  gate and we're nudging them to add it.
                - otherwise: subtle secondary button ("Fix scores / add
                  photo"). Always available so the scorekeeper can
                  correct later.
              Launches the post_round_correction capture flow which
              apply-capture handles by rewriting non-manual settlements. */}
          {isScorekeeper && (
            <button
              onClick={capture.openPostRoundCorrection}
              data-testid="post-round-correction-cta"
              style={needsFinalPhoto
                ? {
                    width: "100%", padding: "14px", borderRadius: 14, border: "none",
                    fontFamily: FONT, fontSize: 15, fontWeight: 700,
                    background: "#D4AF37", color: "#1E130A", cursor: "pointer",
                    marginTop: 4,
                    boxShadow: "0 4px 16px rgba(212,175,55,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }
                : {
                    width: "100%", padding: "12px", borderRadius: 12,
                    border: "1px solid #DDD0BB",
                    fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    background: "#FAF5EC", color: "#8B7355", cursor: "pointer",
                    marginTop: 4,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }
              }
            >
              📸 {needsFinalPhoto ? "Add scorecard photo" : "Fix scores / add photo"}
            </button>
          )}

          <button onClick={() => navigate("/feed")} style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            fontFamily: FONT, fontSize: 16, fontWeight: 700,
            background: "#2D5016", color: "#fff", cursor: "pointer",
            marginTop: 8,
          }}>
            Go to Feed →
          </button>
        </div>

        {/* Phase 2 capture flow modal — shared by ad-hoc / game-driven /
            post_round_correction via useCapture. Rendered here (not only
            under the active-scoring return) so the Fix-scores CTA above
            can actually show the flow. */}
        {capture.activeCapture && <CaptureFlow {...capture.activeCapture} />}
      </div>
    );
  }

  // C5: Crybaby transition intercept.
  //
  // After hole 15 scores + persistence settle, `useAdvanceHole` advances
  // `currentHole` to 16. Before the normal scoring UI for hole 16 renders,
  // we show the CrybabyTransition screen that surfaces standings, picks
  // the crybaby, and stamps CrybabyState. Once the scorekeeper taps
  // "Begin Crybaby", `handleCrybabyBegin` writes CrybabyState + persists,
  // which makes this gate fall-through on subsequent renders.
  //
  // Gate: gameMode === 'flip' AND currentHole === 16 AND no crybabyState
  // yet AND we have at least 15 holes of results to compute balances from.
  // The holeResults length check guards against a corrupted resume where
  // currentHole jumped to 16 without 15 played holes.
  if (
    round.gameMode === 'flip' &&
    currentHole === 16 &&
    !crybabyState &&
    holeResults.length >= 15
  ) {
    const balances = computeBaseGameBalances(
      holeResults as (HoleResult & { hole: number })[],
      players,
      "base",
    );
    return (
      <CrybabyTransition
        players={players}
        balances={balances}
        roundId={roundId ?? "preview"}
        onBegin={handleCrybabyBegin}
      />
    );
  }

  // C6: Per-crybaby-hole setup intercept.
  //
  // On each crybaby hole (16-18) in a Flip round where a crybaby was
  // designated (non-empty `crybabyState.crybaby`), the setup screen runs
  // FIRST: scorekeeper picks the bet + partner, locks teams, and then
  // the normal scoring UI renders below. Once byHole[currentHole] is
  // populated, this gate falls through and the scoring view renders.
  //
  // Skipped entirely when crybabyState.crybaby === "" (all-square sentinel):
  // holes 16-18 then run as continuation of the base Flip game (C5
  // product decision, confirmed in PR #16 discussion).
  if (
    round.gameMode === 'flip' &&
    currentHole >= 16 &&
    currentHole <= 18 &&
    crybabyState &&
    crybabyState.crybaby !== "" &&
    !crybabyState.byHole[currentHole]
  ) {
    return (
      <CrybabyHoleSetup
        holeNumber={currentHole}
        players={players}
        crybabyId={crybabyState.crybaby}
        maxBetPerHole={crybabyState.maxBetPerHole}
        onConfirm={handleCrybabyHoleSetupConfirm}
      />
    );
  }

  // Wolf info for current hole
  const wolfId = round.gameMode === 'wolf' ? getWolfForHole(wolfState, currentHole) : null;
  const wolfPlayer = wolfId ? players.find(p => p.id === wolfId) : null;

  return (
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F5EFE0", fontFamily: FONT,
      paddingBottom: 140,
    }}>

      {/* C4B: Flip base-game persistent teams badge + per-hole Flip button.
          Rendered only when gameMode is flip and we're in the base game
          (holes 1-15). Crybaby phase (16-18) is C5-C7 scope. */}
      {round.gameMode === 'flip' && currentHole <= 15 && (
        <>
          <FlipTeamsBadge
            holeNumber={currentHole}
            teams={flipState.teamsByHole[currentHole] ?? flipTeams ?? null}
          />
          {isScorekeeper && currentHole >= 2 && (() => {
            // Teams-stay-after-push rule: if the prior hole was a push
            // AND teams are already committed for the current hole (by
            // advanceFlipState's auto-carry), the flip button is disabled
            // with an explanatory tooltip. Decided-hole follow-up: button
            // is enabled; tapping opens the per-hole FlipReel.
            const prevResult = holeResults.find(hr => hr.hole === currentHole - 1);
            const prevHoleWasPush = !!prevResult?.push;
            const teamsAlreadyLocked = !!flipState.teamsByHole[currentHole];
            const disabled = prevHoleWasPush && teamsAlreadyLocked;
            const tooltip = disabled ? "Teams stay after a push" : "Flip 3v2 for this hole";
            return (
              <button
                type="button"
                data-testid="flip-per-hole-button"
                aria-label={`Flip teams for hole ${currentHole}`}
                aria-disabled={disabled}
                title={tooltip}
                onClick={() => { if (!disabled) setShowPerHoleFlipReel(true); }}
                disabled={disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "8px 16px 0",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "none",
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: disabled ? "#EDE7D9" : "#EC4899",
                  color: disabled ? "#A8957B" : "#fff",
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                🪙 {teamsAlreadyLocked
                  ? (disabled ? "Teams stay after a push" : `Re-flip hole ${currentHole}`)
                  : `Flip teams for hole ${currentHole}`}
              </button>
            );
          })()}
        </>
      )}

      {/* PR #27: Mid-round photo UI removed. The "Photo needed to
          continue" CapturePrompt banner, the ad-hoc CaptureButton FAB,
          and the active-round CaptureFlow modal trigger are all gone.
          Scorekeeper is the authority — no photo required for any
          mid-round flow. The completion-screen "Fix scores" CTA + its
          CaptureFlow modal stay until Commit 2 lands. Components
          themselves (src/components/capture/CapturePrompt.tsx,
          CaptureButton.tsx, CaptureFlow.tsx) remain in the tree so
          legacy capture data still renders via CaptureTile +
          CaptureAppliedCard in feed + LiveStandings — and so the
          feature can be resurrected later if needed. */}

      {/* Bug 2: pre-completion final-photo gate.
          Rendered ONLY for the scorekeeper (only they can capture) when
          hole 18 is scored, no capture flow is currently open, and the
          gate decision is still pending. This is the single entry point
          for launching a [1,18] capture that blocks completeRound. */}
      <FinalPhotoGate
        open={
          isScorekeeper &&
          !capture.isOpen &&
          currentHole >= 18 &&
          holeResults.length >= 18 &&
          finalPhotoDecision === "pending" &&
          !settlementsSaved &&
          // PR #18: FinalPhotoGate is part of the finish chain — wait
          // for the scorekeeper's confirm before it renders, so cancel
          // on the confirm dialog keeps the round's completion UI clean.
          finishConfirmed
        }
        onTakePhoto={handleTakeFinalPhoto}
        onSkip={handleSkipFinalPhoto}
        skipping={skipInFlight}
      />

      {/* PR #18: Finish-round confirmation gate. Auto-opens ONCE when
          the scorekeeper submits hole 18; after that the scorekeeper
          controls it via the sticky Finish Round button rendered
          below. Cancel truly closes — the user can navigate, edit a
          hole, swap the handicap %, and return to tap the button
          again. Confirm flips finishConfirmed → true, which unblocks
          the FinalPhotoGate + settlement-write useEffect above. */}
      <FinishRoundConfirm
        open={showFinishConfirm}
        confirming={false}
        onCancel={() => setShowFinishConfirm(false)}
        onConfirm={() => {
          setShowFinishConfirm(false);
          setFinishConfirmed(true);
        }}
      />

      {/* PR #18: Sticky Finish Round CTA. Visible to the scorekeeper
          once hole 18 is scored, hidden after they confirm. Lets the
          scorekeeper re-open the confirm dialog after tapping Cancel
          on the auto-open. Also the primary affordance if the round
          is resumed from a mid-completion state. */}
      {isScorekeeper
        && currentHole >= 18
        && holeResults.length >= 18
        && !finishConfirmed
        && !settlementsSaved
        && !showFinishConfirm
        && !capture.isOpen
        && !showCancelConfirm && (
        <div
          data-testid="finish-round-cta-container"
          style={{
            position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: 420,
            padding: "16px 16px 32px",
            background: "linear-gradient(to top, #F5EFE0 70%, transparent)",
            zIndex: 40,
          }}
        >
          <button
            type="button"
            onClick={() => setShowFinishConfirm(true)}
            data-testid="finish-round-cta-button"
            style={{
              width: "100%", padding: "16px", borderRadius: 16, border: "none",
              background: "#2D5016",
              color: "#fff",
              fontFamily: "'Pacifico', cursive", fontSize: 18,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(45,80,22,0.35)",
              transition: "all 0.2s ease",
            }}
          >
            Finish Round ⛳
          </button>
        </div>
      )}

      {/* Phase 2.5 "Fix hammers" retro-correction entry point.
          Scorekeeper-only; only visible when hammer mechanic is active and
          4-player team split is resolvable. Opens EditHammerModal which
          re-runs the hammer prompt and re-applies via apply-capture with
          trigger='hammer_correction' (no score changes). */}
      {isScorekeeper && roundIsActiveStatus && mechanicsList.includes("hammer") && hammerTeams && (
        <button
          type="button"
          onClick={() => setShowEditHammerModal(true)}
          className="fixed bottom-20 left-4 z-40 rounded-full bg-background border-2 border-border px-3 py-2 text-xs font-semibold text-foreground shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          data-testid="fix-hammers-button"
        >
          🔨 Fix hammers
        </button>
      )}
      {hammerTeams && roundId && (
        <EditHammerModal
          open={showEditHammerModal}
          onOpenChange={setShowEditHammerModal}
          roundId={roundId}
          holeRange={[1, Math.max(1, currentHole)]}
          teams={hammerTeams}
          pars={dbRound?.course_details?.pars || Array(18).fill(4)}
          initialHammerState={
            (dbRound?.course_details?.game_state?.hammerStateByHole)
              ? { byHole: dbRound.course_details.game_state.hammerStateByHole }
              : undefined
          }
          currentScores={currentScoresByPlayer}
          onApplied={() => setRetryNonce(n => n + 1)}
        />
      )}

      {/* Offline / unsaved warning banner */}
      {(!isOnline || lastSaveFailed) && (
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: lastSaveFailed ? "#FEF3C7" : "#FEE2E2",
          padding: "8px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: lastSaveFailed ? "#92400E" : "#991B1B" }}>
            {lastSaveFailed ? "⚠️ Last save failed — scores are at risk" : "📶 No connection — saves paused"}
          </span>
          {lastSaveFailed && isOnline && (
            <button
              onClick={() => {
                if (roundId) {
                  saveGameState(roundId, { currentHole, carryOver, totals, hammerHistory })
                    .then(() => setLastSaveFailed(false))
                    .catch(() => {});
                }
              }}
              style={{
                fontFamily: FONT, fontSize: 12, fontWeight: 700, padding: "4px 12px",
                borderRadius: 8, border: "none", cursor: "pointer",
                background: "#92400E", color: "#fff",
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Leave Round Confirmation Dialog */}
      {showLeaveConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)", zIndex: 9999,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 0 24px",
        }}>
          <div style={{
            background: "#FAF5EC", borderRadius: 24, padding: "28px 24px",
            maxWidth: 380, width: "calc(100% - 32px)",
            boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
          }}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 12 }}>⛳</div>
            <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#1E130A", textAlign: "center", marginBottom: 8 }}>
              Leave this round?
            </div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
              Scores are saved. You can resume from the Feed or home screen anytime.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowLeaveConfirm(false)} style={{
                flex: 1, padding: "14px", borderRadius: 14,
                border: "2px solid #DDD0BB", background: "#FAF5EC",
                fontFamily: FONT, fontSize: 15, fontWeight: 700,
                color: "#1E130A", cursor: "pointer",
              }}>
                Stay in Round
              </button>
              <button onClick={() => { setShowLeaveConfirm(false); navigate("/feed", { replace: true }); }} style={{
                flex: 1, padding: "14px", borderRadius: 14,
                border: "2px solid #DDD0BB", background: "#FAF5EC",
                fontFamily: FONT, fontSize: 14, fontWeight: 700,
                color: "#8B7355", cursor: "pointer",
              }}>
                Leave &amp; Resume Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Round Confirmation Dialog */}
      {showCancelConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}>
          <div style={{
            background: "#FAF5EC", borderRadius: 24, padding: "28px 24px",
            maxWidth: 360, width: "100%",
            boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
          }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
            <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: "#1E130A", textAlign: "center", marginBottom: 8 }}>
              Cancel this round?
            </div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: "#8B7355", textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
              Scores are preserved, but this round won&apos;t appear as active anymore. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{
                  flex: 1, padding: "14px", borderRadius: 14,
                  border: "2px solid #DDD0BB", background: "#FAF5EC",
                  fontFamily: FONT, fontSize: 15, fontWeight: 700,
                  color: "#1E130A", cursor: "pointer",
                }}
              >
                Keep Playing
              </button>
              <button
                onClick={handleCancelRound}
                disabled={canceling}
                style={{
                  flex: 1, padding: "14px", borderRadius: 14,
                  border: "none", background: "#DC2626",
                  fontFamily: FONT, fontSize: 15, fontWeight: 700,
                  color: "#fff", cursor: canceling ? "not-allowed" : "pointer",
                  opacity: canceling ? 0.7 : 1,
                }}
              >
                {canceling ? "Canceling…" : "Cancel Round"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div style={{
        padding: "50px 20px 0",
        background: "#FAF5EC",
        position: "sticky", top: 0, zIndex: 10,
        borderBottom: "1px solid #F3F4F6",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={crybabyLogo} alt="Crybaby" style={{ height: 100, marginLeft: -16, marginTop: -24, marginBottom: -24 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#A8957B" }}>
              {course.name} · {round.gameName}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={async () => {
                const next = !isBroadcast;
                setIsBroadcast(next);
                try { await toggleBroadcast(roundId, next); } catch (e) { console.error(e); setIsBroadcast(!next); }
              }}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 12, fontWeight: 700,
                background: isBroadcast ? "#2D501620" : "#EDE7D9",
                color: isBroadcast ? "#2D5016" : "#A8957B",
              }}
              title={isBroadcast ? "Broadcasting to friends" : "Broadcast this round"}
            >
              {isBroadcast ? "📡 Live" : "📡"}
            </button>
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: pendingSync > 0 ? "#F59E0B" : "#2D5016",
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
                  background: showLeaderboard ? "#1E130A" : "#EDE7D9",
                  color: showLeaderboard ? "#fff" : "#8B7355",
                }}
              >
                📊
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{
                  padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontFamily: FONT, fontSize: 12, fontWeight: 700,
                  background: "#FEF2F2", color: "#DC2626",
                }}
                title="Cancel Round"
              >
                ✕
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

      {/* Leaderboard (collapsible). PR #19: Scorecard mode swaps the
          money-sorted P&L column for a strokes-sorted column. strokes
          are summed live from the `scores` state (keyed by hole →
          playerId), so the leaderboard updates every hole submission. */}
      {showLeaderboard && (
        <div style={{ padding: "12px 20px 0" }}>
          <Leaderboard
            players={players}
            totals={totals}
            currentCrybaby={crybabyCandidateId}
            mode={hasMoneyMode ? "money" : "strokes"}
            strokesByPlayer={(() => {
              const out: Record<string, number> = {};
              for (const p of players) out[p.id] = 0;
              for (const holeScores of Object.values(scores) as Array<Record<string, number>>) {
                for (const pid of Object.keys(holeScores)) {
                  const v = holeScores[pid];
                  if (typeof v === "number" && Number.isFinite(v)) {
                    out[pid] = (out[pid] || 0) + v;
                  }
                }
              }
              return out;
            })()}
          />
        </div>
      )}

      {/* Wolf indicator */}
      {round.gameMode === 'wolf' && wolfPlayer && !showWolfModal && (
        <div style={{
          margin: "8px 20px 0", padding: "10px 16px", background: "#F5F3FF", borderRadius: 12,
          display: "flex", alignItems: "center", gap: 10,
          borderLeft: "3px solid #8B5CF6",
        }}>
          <span style={{ fontSize: 20 }}>🐺</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>
              {wolfPlayer.name} is the Wolf
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#A8957B" }}>
              {isLoneWolf ? "Lone Wolf — 2× payout" : wolfPartner ? `Partner: ${players.find(p => p.id === wolfPartner)?.name}` : "Choosing..."}
            </div>
          </div>
          <button onClick={() => setShowWolfModal(true)} style={{
            padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 11, fontWeight: 700,
            background: "#8B5CF620", color: "#8B5CF6",
          }}>
            Change
          </button>
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
          const strokes = settings.pops ? getStrokesOnHole(player.handicap, lowestHandicap, holeHandicap, settings.handicapPercent) : 0;
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

      {/* Action Buttons Row */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 8 }}>
        {/* Hammer Button — for team games with hammer enabled.
            C6.1: during Flip crybaby phase (holes 16-18 with a designated
            crybaby + per-hole setup confirmed), depth-0 initiation is gated
            to the 2-man team (crybaby + partner). Hammer-BACKs at depth >= 1
            are unchanged — alternation rules handle them at the engine level. */}
        {settings.hammer && teams && !allScored && (() => {
          const canInitiate = canInitiateCrybabyHammer({
            gameMode: round.gameMode,
            currentHole,
            crybabyState,
            currentUserPlayerId,
          });
          return hammerDepth === 0 ? (
            canInitiate ? (
              <button onClick={handleHammer} style={{
                flex: 1, padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                color: "#fff", boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
              }}>
                🔨 Throw Hammer
              </button>
            ) : (
              <button
                type="button"
                disabled
                data-testid="hammer-initiate-gated"
                aria-disabled="true"
                title="Only the crybaby's team can initiate a hammer in crybaby phase."
                style={{
                  flex: 1, padding: "14px", borderRadius: 14, border: "none",
                  cursor: "not-allowed",
                  fontFamily: FONT, fontSize: 14, fontWeight: 700,
                  background: "#DDD0BB", color: "#8B7355",
                  opacity: 0.7,
                }}
              >
                🔨 Only crybaby's team can hammer
              </button>
            )
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
          );
        })()}

        {/* Nassau Press Button */}
        {round.gameMode === 'nassau' && settings.presses && !allScored && (
          <button onClick={() => setShowPressModal(true)} style={{
            padding: "14px 18px", borderRadius: 14, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: 14, fontWeight: 700,
            background: "#2D501620", color: "#2D5016",
          }}>
            📌 Press
          </button>
        )}
      </div>

      {/* Nassau presses indicator */}
      {round.gameMode === 'nassau' && nassauPresses.length > 0 && (
        <div style={{
          margin: "0 20px 8px", padding: "8px 14px", background: "#EEF5E5", borderRadius: 10,
          fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#1A3009", textAlign: "center",
        }}>
          📌 {nassauPresses.length} active press{nassauPresses.length > 1 ? "es" : ""} · ${nassauPresses.length * round.holeValue} extra on the line
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
              background: result ? (result.push ? "#F59E0B" : "#2D5016") : isCurrent ? "#1E130A" : "#DDD0BB",
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
        borderTop: "1px solid #DDD0BB",
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
            background: allScored ? "#1E130A" : "#CEC0AA",
            color: allScored ? "#fff" : "#A8957B",
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
      {/* PR #19: HoleResultCard renders the "X wins $Y" modal after
          every hole submission. Scorecard rounds have no money, no
          winner, no carry — the modal would show "null Win / $0" and
          the per-player list would render "+$0" across the board.
          Skip it entirely and auto-advance (below). */}
      {showResult && hasMoneyMode && (
        <HoleResultCard result={showResult} onDismiss={advanceHole} />
      )}
      {showCrybabSetup && (
        <CrybabSetupModal
          players={players}
          totals={totals}
          onConfirm={handleCrybabConfirm}
        />
      )}
      {showFlipModal && (
        <FlipReel
          mode="initial"
          players={players}
          onConfirm={(teams) => handleFlipConfirm(teams, 1)}
          testIdPrefix="initial-flip-reel"
        />
      )}
      {showPerHoleFlipReel && (
        <FlipReel
          mode="per-hole"
          players={players}
          holeNumber={currentHole}
          onConfirm={(teams) => handleFlipConfirm(teams, currentHole)}
          onCancel={() => setShowPerHoleFlipReel(false)}
          testIdPrefix="per-hole-flip-reel"
        />
      )}
      {showWolfModal && wolfPlayer && (
        <WolfPartnerModal
          wolfPlayer={wolfPlayer}
          otherPlayers={players.filter(p => p.id !== wolfId)}
          holeNumber={currentHole}
          holeValue={round.holeValue}
          onSelectPartner={handleWolfPartner}
          onGoLone={handleLoneWolf}
        />
      )}
      {showPressModal && (
        <NassauPressModal
          currentHole={currentHole}
          holeValue={round.holeValue}
          nassauPresses={nassauPresses}
          onPress={handleNassauPress}
          onClose={() => setShowPressModal(false)}
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
