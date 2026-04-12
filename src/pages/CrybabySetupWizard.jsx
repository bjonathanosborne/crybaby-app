import { useState, useEffect, useCallback, useRef } from "react";
import { createRound, loadActiveRound, loadProfile } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import crybabyLogo from "@/assets/crybaby-logo.png";
import AddClubModal from "@/components/AddClubModal";
import { Users, RotateCcw, Flag, Coins, Sliders, Globe, Lock, EyeOff, Eye } from "lucide-react";
import { WolfIcon, HammerIcon, CrybabyBottleIcon, BirdieIcon, MoneyIcon, PressIcon } from "@/components/icons/CrybIcons";
import CourseSearch from "@/components/CourseSearch";

// ============================================================
// CRYBABY — Game Setup Wizard
// Apple-level design, sans-serif, clean & fun
// ============================================================

// --- DATA ---
const GAME_FORMATS = [
  {
    id: "drivers_others_carts",
    name: "Drivers / Others / Carts",
    players: { min: 4, max: 4 },
    description: "15-hole rotating partners. Drivers, cross-cart, then same-cart. Crybaby finishes it.",
    mechanics: ["hammer", "crybaby", "birdie_bonus", "pops"],
    defaultHoles: 18,
    teamStructure: "rotating",
    requiresCarts: true,
  },
  {
    id: "flip",
    name: "Flip",
    players: { min: 3, max: 6 },
    description: "Coin flip before each hole. Uneven teams with multiplied stakes. Crybaby rules apply.",
    mechanics: ["hammer", "crybaby", "birdie_bonus", "pops"],
    defaultHoles: 18,
    teamStructure: "coin_flip",
    requiresCarts: false,
  },
  {
    id: "nassau",
    name: "Nassau",
    players: { min: 2, max: 4 },
    description: "The classic. Three bets in one — front 9, back 9, and overall 18.",
    mechanics: ["presses", "pops"],
    defaultHoles: 18,
    teamStructure: "fixed",
    requiresCarts: false,
  },
  {
    id: "skins",
    name: "Skins",
    players: { min: 2, max: 6 },
    description: "Every hole is its own bet. Low score takes the skin. Ties carry over.",
    mechanics: ["carry_overs", "pops"],
    defaultHoles: 18,
    teamStructure: "individual",
    requiresCarts: false,
  },
  {
    id: "wolf",
    name: "Wolf",
    players: { min: 4, max: 4 },
    description: "Rotating Wolf picks a partner — or goes lone. Strategy meets guts.",
    mechanics: ["lone_wolf", "pops"],
    defaultHoles: 18,
    teamStructure: "wolf_rotation",
    requiresCarts: false,
  },
  {
    id: "custom",
    name: "Custom Game",
    players: { min: 2, max: 6 },
    description: "Build your own rules. Your house, your game.",
    mechanics: [],
    defaultHoles: 18,
    teamStructure: "custom",
    requiresCarts: false,
  },
];

// SVG icon renderer per game — keyed by game id
const GAME_ICON = {
  drivers_others_carts: (s) => <Users size={s} strokeWidth={1.75} />,
  flip:                 (s) => <RotateCcw size={s} strokeWidth={1.75} />,
  nassau:               (s) => <Flag size={s} strokeWidth={1.75} />,
  skins:                (s) => <MoneyIcon size={s} />,
  wolf:                 (s) => <WolfIcon size={s} />,
  custom:               (s) => <Sliders size={s} strokeWidth={1.75} />,
};

const AUSTIN_COURSES = [
  // === CITY OF AUSTIN MUNICIPAL (Golf ATX) ===
  { id: "lions", name: "Lions Municipal Golf Course", city: "Austin", type: "municipal", pars: [4,4,3,4,5,4,3,5,4,4,4,4,3,4,5,4,3,5], handicaps: [5,3,15,9,1,11,17,7,13,6,2,14,16,10,4,8,18,12], tees: [{ name: "Blue", slope: 121, rating: 69.1, yardage: 6001 }, { name: "White", slope: 118, rating: 67.8, yardage: 5689 }] },
  { id: "jimmy_clay", name: "Jimmy Clay Golf Course", city: "Austin", type: "municipal", pars: [5,4,3,4,4,4,3,4,5,4,3,5,4,4,4,3,5,4], handicaps: [1,9,13,7,3,11,17,15,5,10,18,2,8,4,6,16,12,14], tees: [{ name: "Blue", slope: 126, rating: 70.7, yardage: 6557 }, { name: "White", slope: 121, rating: 68.8, yardage: 6087 }] },
  { id: "roy_kizer", name: "Roy Kizer Golf Course", city: "Austin", type: "municipal", pars: [4,5,4,3,4,3,5,4,4,4,4,3,4,5,4,3,5,4], handicaps: [7,1,11,15,3,17,5,9,13,6,10,18,8,2,12,16,4,14], tees: [{ name: "Blue", slope: 128, rating: 71.3, yardage: 6749 }, { name: "White", slope: 123, rating: 69.2, yardage: 6219 }] },
  { id: "morris_williams", name: "Morris Williams Golf Course", city: "Austin", type: "municipal", pars: [4,4,5,3,4,4,3,5,4,4,5,4,3,4,4,5,3,4], handicaps: [9,3,5,17,1,7,13,11,15,10,4,8,18,2,6,12,16,14], tees: [{ name: "Blue", slope: 127, rating: 70.4, yardage: 6636 }, { name: "White", slope: 122, rating: 68.5, yardage: 6126 }] },
  { id: "hancock", name: "Hancock Golf Course", city: "Austin", type: "municipal", holes: 9, pars: [4,3,3,5,3,4,4,3,4], handicaps: [3,5,9,1,7,4,2,8,6], tees: [{ name: "Blue", slope: 108, rating: 31.6, yardage: 2633 }] },
  { id: "grey_rock", name: "Grey Rock Golf Club", city: "Austin", type: "municipal", pars: [4,4,3,5,4,4,3,4,5,4,5,4,3,4,4,5,3,4], handicaps: [7,3,13,1,11,9,17,5,15,8,2,10,18,6,12,4,16,14], tees: [{ name: "Blue", slope: 135, rating: 72.5, yardage: 6808 }, { name: "White", slope: 129, rating: 70.2, yardage: 6290 }] },
  // === PRIVATE CLUBS ===
  { id: "westlake", name: "Westlake Country Club", city: "Austin", type: "private", pars: [5,4,4,3,4,4,4,3,4,3,5,4,4,4,4,5,4,3], handicaps: [1,9,7,17,13,5,11,15,3,18,14,12,6,4,10,8,2,16], tees: [{ name: "Black", slope: 141, rating: 74.9, yardage: 6935 }, { name: "Gold", slope: 138, rating: 70.9, yardage: 6224 }, { name: "Silver", slope: 124, rating: 66.8, yardage: 5589 }, { name: "Violet", slope: 113, rating: 63.8, yardage: 4937 }] },
  { id: "austin_cc", name: "Austin Country Club", city: "Austin", type: "private", pars: [4,4,3,5,4,4,4,3,5,4,4,3,4,5,4,4,3,5], handicaps: [5,9,17,1,7,3,11,15,13,8,4,16,10,2,6,12,18,14], tees: [{ name: "Blue", slope: 138, rating: 73.5, yardage: 7104 }, { name: "White", slope: 132, rating: 71.2, yardage: 6625 }] },
  { id: "spanish_oaks", name: "Spanish Oaks Golf Club", city: "Bee Cave", type: "private", pars: [4,5,3,4,4,3,5,4,4,4,3,5,4,4,3,4,5,4], handicaps: [7,3,15,1,9,17,5,11,13,8,16,2,6,10,18,12,4,14], tees: [{ name: "Blue", slope: 142, rating: 74.6, yardage: 7234 }, { name: "White", slope: 135, rating: 72.0, yardage: 6680 }] },
  { id: "lost_creek", name: "Lost Creek Country Club", city: "Austin", type: "private", pars: [4,5,4,3,4,3,4,4,5,4,3,5,4,4,4,3,5,4], handicaps: [9,1,5,15,7,17,11,3,13,10,18,4,8,2,6,16,12,14], tees: [{ name: "Blue", slope: 130, rating: 71.2, yardage: 6640 }, { name: "White", slope: 125, rating: 69.1, yardage: 6152 }] },
  { id: "onion_creek", name: "Onion Creek Club", city: "Austin", type: "private", pars: [4,3,4,5,4,4,3,5,4,5,4,4,3,4,4,3,5,4], handicaps: [7,15,3,1,9,5,17,11,13,2,10,8,18,4,6,16,12,14], tees: [{ name: "Blue", slope: 133, rating: 72.4, yardage: 6880 }, { name: "White", slope: 127, rating: 70.1, yardage: 6350 }] },
  { id: "river_place", name: "River Place Country Club", city: "Austin", type: "private", pars: [4,4,3,5,4,4,3,4,5,4,5,3,4,4,4,3,5,4], handicaps: [5,7,17,1,3,9,15,13,11,8,2,18,6,4,10,16,12,14], tees: [{ name: "Blue", slope: 137, rating: 73.1, yardage: 6931 }, { name: "White", slope: 131, rating: 70.8, yardage: 6400 }] },
  { id: "hills_lakeway", name: "The Hills of Lakeway", city: "Lakeway", type: "private", pars: [4,5,3,4,4,4,3,5,4,4,4,3,4,5,4,4,3,5], handicaps: [7,3,15,9,1,11,17,5,13,8,4,18,10,2,6,12,16,14], tees: [{ name: "Blue", slope: 134, rating: 72.3, yardage: 6914 }, { name: "White", slope: 128, rating: 70.0, yardage: 6380 }] },
  { id: "flintrock", name: "Flintrock Falls Golf Club", city: "Lakeway", type: "private", pars: [4,4,5,3,4,4,3,4,5,4,3,5,4,4,3,4,5,4], handicaps: [9,5,1,17,7,3,15,11,13,10,18,2,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 139, rating: 73.8, yardage: 7093 }, { name: "White", slope: 133, rating: 71.5, yardage: 6560 }] },
  { id: "ut_golf", name: "UT Golf Club", city: "Austin", type: "private", pars: [4,4,5,3,4,4,3,5,4,4,5,3,4,4,4,3,5,4], handicaps: [5,9,1,15,7,3,17,11,13,8,2,18,10,4,6,16,12,14], tees: [{ name: "Blue", slope: 136, rating: 73.0, yardage: 6970 }, { name: "White", slope: 130, rating: 70.6, yardage: 6440 }] },
  { id: "cimarron_hills", name: "Cimarron Hills Golf & CC", city: "Georgetown", type: "private", pars: [4,5,4,3,4,3,5,4,4,4,4,3,5,4,3,4,5,4], handicaps: [7,1,9,15,5,17,3,11,13,6,10,18,2,8,16,12,4,14], tees: [{ name: "Blue", slope: 141, rating: 74.2, yardage: 7159 }, { name: "White", slope: 134, rating: 71.8, yardage: 6610 }] },
  // === RESORT / SEMI-PRIVATE ===
  { id: "barton_fazio", name: "Barton Creek — Fazio Foothills", city: "Austin", type: "resort", pars: [4,5,3,4,4,4,3,4,5,4,3,4,5,4,4,3,5,4], handicaps: [7,1,17,9,3,11,15,13,5,8,18,4,2,6,14,16,10,12], tees: [{ name: "Blue", slope: 137, rating: 73.2, yardage: 6956 }, { name: "White", slope: 130, rating: 70.8, yardage: 6407 }] },
  { id: "barton_crenshaw", name: "Barton Creek — Crenshaw Cliffside", city: "Austin", type: "resort", pars: [4,3,4,5,4,3,4,4,5,4,5,3,4,4,4,3,5,4], handicaps: [9,17,5,1,7,15,3,11,13,10,2,18,8,6,12,16,4,14], tees: [{ name: "Blue", slope: 135, rating: 72.8, yardage: 6880 }, { name: "White", slope: 128, rating: 70.4, yardage: 6340 }] },
  { id: "barton_coore", name: "Barton Creek — Coore Crenshaw", city: "Austin", type: "resort", pars: [4,4,5,3,4,4,3,5,4,4,3,4,5,4,3,4,5,4], handicaps: [5,11,1,15,7,9,17,3,13,8,16,6,2,10,18,12,4,14], tees: [{ name: "Blue", slope: 139, rating: 73.8, yardage: 7100 }, { name: "White", slope: 132, rating: 71.3, yardage: 6550 }] },
  { id: "barton_palmer", name: "Barton Creek — Palmer Lakeside", city: "Austin", type: "resort", pars: [4,5,4,3,4,3,5,4,4,4,4,3,5,4,4,3,4,5], handicaps: [7,3,9,15,1,17,5,11,13,6,10,18,2,8,12,16,14,4], tees: [{ name: "Blue", slope: 136, rating: 73.0, yardage: 6957 }, { name: "White", slope: 129, rating: 70.5, yardage: 6415 }] },
  { id: "falconhead", name: "Falconhead Golf Club", city: "Bee Cave", type: "semi-private", pars: [4,5,4,3,4,4,3,5,4,4,3,5,4,4,3,4,5,4], handicaps: [11,3,7,15,1,9,17,5,13,10,18,2,8,4,16,12,6,14], tees: [{ name: "Blue", slope: 136, rating: 73.0, yardage: 7002 }, { name: "White", slope: 130, rating: 70.6, yardage: 6490 }] },
  { id: "wolfdancer", name: "Wolfdancer Golf Club", city: "Cedar Creek", type: "resort", pars: [4,4,5,3,4,4,3,4,5,5,3,4,4,4,3,5,4,4], handicaps: [5,9,1,13,7,11,17,15,3,2,16,10,6,8,18,4,14,12], tees: [{ name: "Blue", slope: 140, rating: 74.1, yardage: 7205 }, { name: "White", slope: 133, rating: 71.5, yardage: 6645 }] },
  // === OTHER PUBLIC / DAILY FEE ===
  { id: "avery_ranch", name: "Avery Ranch Golf Club", city: "Austin", type: "public", pars: [4,3,5,4,4,3,4,5,4,4,5,3,4,4,5,4,3,4], handicaps: [9,15,1,5,11,17,7,3,13,10,4,16,8,2,6,14,18,12], tees: [{ name: "Blue", slope: 133, rating: 72.1, yardage: 6894 }, { name: "White", slope: 128, rating: 70.0, yardage: 6398 }] },
  { id: "star_ranch", name: "Star Ranch Golf Club", city: "Round Rock", type: "public", pars: [5,3,4,4,4,3,5,4,4,4,4,5,3,4,4,3,4,5], handicaps: [3,17,7,9,1,13,5,11,15,10,6,2,18,8,4,16,14,12], tees: [{ name: "Blue", slope: 132, rating: 72.0, yardage: 6860 }, { name: "White", slope: 126, rating: 69.6, yardage: 6310 }] },
  { id: "teravista", name: "Teravista Golf Club", city: "Round Rock", type: "public", pars: [4,4,3,5,4,3,4,5,4,4,3,5,4,4,3,4,5,4], handicaps: [9,5,17,1,7,15,11,3,13,8,18,2,6,10,16,12,4,14], tees: [{ name: "Blue", slope: 134, rating: 72.6, yardage: 6913 }, { name: "White", slope: 128, rating: 70.2, yardage: 6385 }] },
  { id: "crystal_falls", name: "Crystal Falls Golf Club", city: "Leander", type: "semi-private", pars: [4,5,3,4,4,4,3,5,4,4,4,3,5,4,4,3,4,5], handicaps: [7,1,15,9,3,11,17,5,13,6,10,18,2,8,12,16,14,4], tees: [{ name: "Blue", slope: 131, rating: 71.5, yardage: 6654 }, { name: "White", slope: 125, rating: 69.2, yardage: 6120 }] },
  { id: "shadow_glen", name: "Shadow Glen Golf Club", city: "Manor", type: "public", pars: [4,4,5,3,4,4,3,4,5,4,3,5,4,4,3,4,5,4], handicaps: [5,9,1,15,7,3,17,11,13,10,18,2,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 133, rating: 72.1, yardage: 6869 }, { name: "White", slope: 127, rating: 69.8, yardage: 6340 }] },
  { id: "plum_creek", name: "Plum Creek Golf Course", city: "Kyle", type: "public", pars: [4,5,3,4,4,4,3,5,4,4,5,3,4,4,3,4,5,4], handicaps: [9,1,17,7,3,11,15,5,13,10,2,18,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 130, rating: 71.4, yardage: 6753 }, { name: "White", slope: 124, rating: 69.0, yardage: 6210 }] },
  { id: "forest_creek", name: "Forest Creek Golf Club", city: "Round Rock", type: "public", pars: [4,4,5,3,4,4,3,4,5,4,4,3,5,4,4,3,5,4], handicaps: [7,3,1,17,9,5,15,11,13,8,6,18,2,10,4,16,12,14], tees: [{ name: "Blue", slope: 135, rating: 72.8, yardage: 7014 }, { name: "White", slope: 129, rating: 70.4, yardage: 6475 }] },
  { id: "kissing_tree", name: "Kissing Tree Golf Club", city: "San Marcos", type: "public", pars: [4,3,5,4,4,3,4,5,4,5,4,3,4,4,3,4,5,4], handicaps: [5,15,1,9,7,17,11,3,13,2,8,18,6,10,16,12,4,14], tees: [{ name: "Blue", slope: 132, rating: 71.8, yardage: 6842 }, { name: "White", slope: 126, rating: 69.5, yardage: 6310 }] },
  { id: "riverside", name: "Riverside Golf Course", city: "Austin", type: "public", pars: [5,4,3,4,4,4,3,5,4,4,5,4,3,4,4,5,3,4], handicaps: [3,7,15,5,1,9,17,11,13,8,2,10,18,4,6,12,16,14], tees: [{ name: "Blue", slope: 124, rating: 69.8, yardage: 6308 }, { name: "White", slope: 119, rating: 67.9, yardage: 5880 }] },
  { id: "colovista", name: "ColoVista Country Club", city: "Bastrop", type: "semi-private", pars: [4,5,4,3,4,3,5,4,4,4,3,5,4,4,3,4,5,4], handicaps: [7,1,9,15,5,17,3,11,13,10,18,2,8,6,16,12,4,14], tees: [{ name: "Blue", slope: 134, rating: 72.3, yardage: 6886 }, { name: "White", slope: 128, rating: 70.0, yardage: 6350 }] },
];

const COURSE_GROUPS = [
  { label: "City of Austin Municipal", types: ["municipal"] },
  { label: "Private Clubs", types: ["private"] },
  { label: "Resort / Semi-Private", types: ["resort", "semi-private"] },
  { label: "Public / Daily Fee", types: ["public"] },
];

const TYPE_COLORS = { municipal: "#059669", public: "#2D5016", private: "#7C3AED", "semi-private": "#3B82F6", resort: "#F59E0B" };

const MECHANICS_CONFIG = {
  hammer:       { label: "Hammer",          icon: (s) => <HammerIcon size={s} />,        description: "Double-or-nothing mid-hole challenge" },
  crybaby:      { label: "Crybaby",         icon: (s) => <CrybabyBottleIcon size={s} />, description: "End-of-round redemption for the biggest loser" },
  birdie_bonus: { label: "Birdie Bonus",    icon: (s) => <BirdieIcon size={s} />,        description: "Birdies multiply the hole value" },
  carry_overs:  { label: "Carry-Overs",     icon: (s) => <RotateCcw size={s} strokeWidth={2} />, description: "Tied holes carry value to the next hole" },
  presses:      { label: "Presses",         icon: (s) => <PressIcon size={s} />,         description: "New bet when a team goes 2-down" },
  pops:         { label: "Handicap Strokes",icon: (s) => <Users size={s} strokeWidth={2} />, description: "Stroke allocation based on GHIN handicap" },
  lone_wolf:    { label: "Lone Wolf",       icon: (s) => <WolfIcon size={s} />,          description: "Go solo for multiplied stakes" },
  greenies:     { label: "Greenies",        icon: (s) => <Flag size={s} strokeWidth={2} />, description: "Closest to pin on par 3s" },
  sandies:      { label: "Sandies",         icon: (s) => <Coins size={s} strokeWidth={2} />, description: "Par or better from a bunker" },
  kps:          { label: "KPs",             icon: (s) => <Flag size={s} strokeWidth={2} />, description: "Closest to the pin side bets" },
  no_pops_par3: { label: "No Pops Par 3s",  icon: (s) => <Sliders size={s} strokeWidth={2} />, description: "No handicap strokes on par 3s" },
};

// --- STEP INDICATOR ---
function StepIndicator({ steps, currentStep }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 8px", marginBottom: 10 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 600,
            fontFamily: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            background: i <= currentStep ? "#2D5016" : "#DDD0BB",
            color: i <= currentStep ? "#fff" : "#A8957B",
            transition: "all 0.3s ease",
          }}>
            {i < currentStep ? "✓" : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: "0 4px",
              background: i < currentStep ? "#2D5016" : "#DDD0BB",
              transition: "background 0.3s ease",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- GAME FORMAT CARD ---
function GameCard({ game, selected, onSelect, playerCount }) {
  const fits = playerCount >= game.players.min && playerCount <= game.players.max;
  const isSelected = selected === game.id;
  return (
    <button
      onClick={() => onSelect(game.id)}
      disabled={!fits && playerCount > 0}
      style={{
        width: "100%", textAlign: "left", border: "none", cursor: fits || playerCount === 0 ? "pointer" : "not-allowed",
        background: isSelected ? "#EEF5E5" : "#FAF5EC",
        borderRadius: 16, padding: "20px 20px",
        boxShadow: isSelected ? "0 0 0 2px #2D5016, 0 2px 8px rgba(45,80,22,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
        opacity: !fits && playerCount > 0 ? 0.4 : 1,
        transition: "all 0.2s ease",
        transform: isSelected ? "scale(1.01)" : "scale(1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: isSelected ? "rgba(45,80,22,0.12)" : "#EDE7D9",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isSelected ? "#2D5016" : "#8B7355",
          transition: "all 0.2s ease",
        }}>
          {GAME_ICON[game.id]?.(22)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: 15, fontWeight: 400, color: "#2D5016", marginBottom: 4,
          }}>
            {game.name}
          </div>
          <div style={{
            fontFamily: "'Lato', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 13, color: "#8B7355", lineHeight: 1.45,
          }}>
            {game.description}
          </div>
          <div style={{
            marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              background: "#EDE7D9", color: "#8B7355",
              fontFamily: "'Lato', -apple-system, sans-serif",
            }}>
              {game.players.min === game.players.max ? `${game.players.min}P` : `${game.players.min}-${game.players.max}P`}
            </span>
            {game.mechanics.slice(0, 3).map(m => (
              <span key={m} style={{
                fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                background: "#FEF3C7", color: "#92400E",
                fontFamily: "'Lato', -apple-system, sans-serif",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {MECHANICS_CONFIG[m]?.icon(11)}
                {MECHANICS_CONFIG[m]?.label}
              </span>
            ))}
          </div>
        </div>
        {isSelected && (
          <div style={{
            width: 24, height: 24, borderRadius: 12, background: "#2D5016",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>✓</div>
        )}
      </div>
    </button>
  );
}

// --- PLAYER ROW ---
function PlayerRow({ player, index, onUpdate, onRemove, showCarts, cartOptions, canRemove, currentUserId }) {
  const font = "'Lato', -apple-system, BlinkMacSystemFont, sans-serif";
  const mono = "'SF Mono', 'JetBrains Mono', monospace";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isLinkedUser, setIsLinkedUser] = useState(!!player.userId);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      // Search friends first, then all users
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id_a, user_id_b")
        .eq("status", "accepted")
        .or(`user_id_a.eq.${currentUserId},user_id_b.eq.${currentUserId}`);
      
      const friendIds = (friendships || []).map(f =>
        f.user_id_a === currentUserId ? f.user_id_b : f.user_id_a
      );

      const { data: results } = await supabase.rpc("search_users_by_name", { _query: q });
      
      // Sort friends first
      const sorted = (results || []).map(r => ({
        ...r,
        isFriend: friendIds.includes(r.user_id),
      })).sort((a, b) => (b.isFriend ? 1 : 0) - (a.isFriend ? 1 : 0));
      
      setSearchResults(sorted.slice(0, 10));
    } catch (e) {
      console.error("Player search error:", e);
    } finally {
      setSearching(false);
    }
  }, [currentUserId]);

  const handleNameChange = (val) => {
    onUpdate(index, { ...player, name: val, userId: null });
    setIsLinkedUser(false);
    setSearchQuery(val);
    clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => {
        doSearch(val);
        setShowDropdown(true);
      }, 300);
    } else {
      setShowDropdown(false);
      setSearchResults([]);
    }
  };

  const selectUser = (user) => {
    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name || "";
    onUpdate(index, {
      ...player,
      name: displayName,
      handicap: user.handicap,
      ghin: user.ghin || "",
      userId: user.user_id,
    });
    setIsLinkedUser(true);
    setShowDropdown(false);
    setSearchResults([]);
    setSearchQuery("");
  };

  const clearLinkedUser = () => {
    onUpdate(index, { ...player, name: "", handicap: null, ghin: "", userId: null });
    setIsLinkedUser(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
      background: "#FAF5EC", borderRadius: 12,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      transition: "all 0.2s ease",
      border: isLinkedUser ? "1.5px solid #2D5016" : "1px solid transparent",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 16, marginTop: 6,
        background: isLinkedUser ? "#2D5016" : ["#2D5016", "#3B82F6", "#F59E0B", "#DC2626", "#8B5CF6", "#EC4899"][index % 6],
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: font, flexShrink: 0,
      }}>
        {player.name ? player.name[0].toUpperCase() : (index + 1)}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0, position: "relative" }} ref={dropdownRef}>
        {isLinkedUser ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
            background: "#EEF5E5", borderRadius: 8, border: "1px solid #BBF7D0",
            minHeight: 44, boxSizing: "border-box",
          }}>
            <span style={{ fontFamily: font, fontSize: 16, fontWeight: 600, color: "#1E130A", flex: 1 }}>
              {player.name}
            </span>
            <button onClick={clearLinkedUser} style={{
              width: 24, height: 24, borderRadius: 12, border: "none",
              background: "#DC262620", color: "#DC2626", cursor: "pointer",
              fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          </div>
        ) : (
          <input
            value={player.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder={`Search or type Player ${index + 1}`}
            style={{
              fontFamily: font, fontSize: 16, fontWeight: 500, color: "#1E130A",
              border: "1px solid #DDD0BB", background: "#FAF5EC", borderRadius: 8,
              outline: "none", padding: "10px 12px", width: "100%",
              minHeight: 44, boxSizing: "border-box",
            }}
          />
        )}

        {/* Search dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div style={{
            position: "absolute", top: 48, left: 0, right: 0, zIndex: 50,
            background: "#FAF5EC", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            border: "1px solid #DDD0BB", maxHeight: 240, overflowY: "auto",
          }}>
            {searchResults.map((u, i) => (
              <button key={u.user_id} onClick={() => selectUser(u)} style={{
                width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                padding: "10px 14px", background: "transparent",
                borderBottom: i < searchResults.length - 1 ? "1px solid #F3F4F6" : "none",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 14, objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: 14, background: "#DDD0BB",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#8B7355",
                  }}>
                    {(u.display_name || "?")[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: "#1E130A", display: "flex", alignItems: "center", gap: 6 }}>
                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.display_name}
                    {u.isFriend && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#DBEAFE", color: "#2563EB" }}>Friend</span>
                    )}
                  </div>
                  <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", display: "flex", gap: 8 }}>
                    {u.handicap != null && <span>HCP {u.handicap}</span>}
                    {u.home_course && <span>{u.home_course}</span>}
                  </div>
                </div>
              </button>
            ))}
            <div style={{
              padding: "8px 14px", borderTop: "1px solid #F3F4F6",
              fontFamily: font, fontSize: 11, color: "#A8957B", textAlign: "center",
            }}>
              Or just type a name for a guest player
            </div>
          </div>
        )}
        {showDropdown && searching && (
          <div style={{
            position: "absolute", top: 48, left: 0, right: 0, zIndex: 50,
            background: "#FAF5EC", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            padding: "14px", textAlign: "center", fontFamily: font, fontSize: 13, color: "#A8957B",
          }}>
            Searching…
          </div>
        )}

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            value={player.handicap ?? ""}
            onChange={e => {
              const val = e.target.value;
              if (val === "") { onUpdate(index, { ...player, handicap: null }); return; }
              const num = parseFloat(val);
              if (isNaN(num)) return;
              const clamped = Math.min(54, Math.max(-10, num));
              onUpdate(index, { ...player, handicap: clamped });
            }}
            placeholder="HCP"
            min="-10"
            max="54"
            step="0.5"
            style={{
              fontFamily: mono, fontSize: 13, color: "#8B7355",
              border: "1px solid #DDD0BB", borderRadius: 6, padding: "8px 10px",
              width: 72, background: "#FAF5EC", outline: "none",
              minHeight: 36, boxSizing: "border-box",
            }}
          />
          {showCarts && (
            <select
              value={player.cart || ""}
              onChange={e => onUpdate(index, { ...player, cart: e.target.value })}
              style={{
                fontFamily: font, fontSize: 12, color: "#8B7355",
                border: "1px solid #DDD0BB", borderRadius: 6, padding: "8px 10px",
                background: "#FAF5EC", outline: "none",
                minHeight: 36, boxSizing: "border-box",
                flex: 1, minWidth: 80,
              }}
            >
              <option value="">Cart...</option>
              {(cartOptions || []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      {canRemove && (
        <button
          onClick={() => onRemove(index)}
          style={{
            width: 32, height: 32, borderRadius: 16, border: "none",
            background: "#FEE2E2", color: "#DC2626", cursor: "pointer",
            fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0, marginTop: 6,
          }}
        >×</button>
      )}
    </div>
  );
}

// --- COURSE CARD ---
function CourseCard({ course, selected, onSelect }) {
  const isSelected = selected === course.id;
  const typeColors = { public: "#2D5016", private: "#7C3AED", "semi-private": "#3B82F6", resort: "#F59E0B" };
  return (
    <button
      onClick={() => onSelect(course.id)}
      style={{
        width: "100%", textAlign: "left", border: "none", cursor: "pointer",
        background: isSelected ? "#EEF5E5" : "#fff", borderRadius: 14,
        padding: "14px 16px",
        boxShadow: isSelected ? "0 0 0 2px #2D5016, 0 2px 8px rgba(45,80,22,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{
            fontFamily: "'Lato', -apple-system, sans-serif",
            fontSize: 15, fontWeight: 600, color: "#1E130A", marginBottom: 3,
          }}>{course.name}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              fontFamily: "'Lato', -apple-system, sans-serif",
              fontSize: 12, color: "#8B7355",
            }}>{course.city}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: typeColors[course.type] + "18",
              color: typeColors[course.type],
              fontFamily: "'Lato', -apple-system, sans-serif",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{course.type}</span>
          </div>
        </div>
        {isSelected && (
          <div style={{
            width: 24, height: 24, borderRadius: 12, background: "#2D5016",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14, fontWeight: 700,
          }}>✓</div>
        )}
      </div>
      {isSelected && course.tees && (
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {course.tees.map(tee => (
            <span key={tee.name} style={{
              fontFamily: "'SF Mono', monospace", fontSize: 11, padding: "3px 8px",
              borderRadius: 6, background: "#EDE7D9", color: "#8B7355",
            }}>
              {tee.name} · {tee.yardage}y · {tee.slope}/{tee.rating}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// --- MECHANIC TOGGLE ---
function MechanicToggle({ id, config, enabled, onToggle, expanded, onExpand, settings, onSettings }) {
  const font = "'Lato', -apple-system, BlinkMacSystemFont, sans-serif";
  return (
    <div style={{
      background: enabled ? "#EEF5E5" : "#fff", borderRadius: 14, overflow: "hidden",
      boxShadow: enabled ? "0 0 0 1.5px #2D501620, 0 1px 3px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.06)",
      transition: "all 0.2s ease",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer",
      }} onClick={() => onToggle(id)}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: enabled ? "rgba(45,80,22,0.10)" : "#EDE7D9",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: enabled ? "#2D5016" : "#8B7355", transition: "all 0.2s ease",
        }}>
          {config.icon(18)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: "#1E130A" }}>{config.label}</div>
          <div style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>{config.description}</div>
        </div>
        <div
          onClick={e => { e.stopPropagation(); onToggle(id); }}
          style={{
            width: 48, height: 28, borderRadius: 14, padding: 2, cursor: "pointer",
            background: enabled ? "#2D5016" : "#CEC0AA", transition: "background 0.2s ease",
            display: "flex", alignItems: "center",
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 12, background: "#FAF5EC",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transform: enabled ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.2s ease",
          }} />
        </div>
      </div>
      {enabled && id === "hammer" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["Losing team only", "Either team"].map(opt => (
              <button key={opt} onClick={() => onSettings(id, { ...settings, initiator: opt })} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: font, fontSize: 12, fontWeight: 600,
                background: settings?.initiator === opt ? "#2D5016" : "#EDE7D9",
                color: settings?.initiator === opt ? "#fff" : "#8B7355",
                transition: "all 0.15s ease",
              }}>{opt}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Max depth:</span>
            {[1, 2, 3, "∞"].map(d => (
              <button key={d} onClick={() => onSettings(id, { ...settings, maxDepth: d })} style={{
                width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "'SF Mono', monospace", fontSize: 13, fontWeight: 600,
                background: settings?.maxDepth === d ? "#2D5016" : "#EDE7D9",
                color: settings?.maxDepth === d ? "#fff" : "#8B7355",
              }}>{d}</button>
            ))}
          </div>
        </div>
      )}
      {enabled && id === "crybaby" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Crybaby holes:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => onSettings(id, { ...settings, holes: n })} style={{
                width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "'SF Mono', monospace", fontSize: 13, fontWeight: 600,
                background: settings?.holes === n ? "#2D5016" : "#EDE7D9",
                color: settings?.holes === n ? "#fff" : "#8B7355",
              }}>{n}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Only crybaby hammers", "Anyone can hammer"].map(opt => (
              <button key={opt} onClick={() => onSettings(id, { ...settings, hammerRule: opt })} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: font, fontSize: 11, fontWeight: 600,
                background: settings?.hammerRule === opt ? "#3B82F6" : "#EDE7D9",
                color: settings?.hammerRule === opt ? "#fff" : "#8B7355",
              }}>{opt}</button>
            ))}
          </div>
        </div>
      )}
      {enabled && id === "birdie_bonus" && (
        <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Multiplier:</span>
          {["2x", "3x", "4x"].map(m => (
            <button key={m} onClick={() => onSettings(id, { ...settings, multiplier: m })} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'SF Mono', monospace", fontSize: 13, fontWeight: 600,
              background: settings?.multiplier === m ? "#2D5016" : "#EDE7D9",
              color: settings?.multiplier === m ? "#fff" : "#8B7355",
            }}>{m}</button>
          ))}
        </div>
      )}
      {enabled && id === "carry_overs" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Max carry-overs:</span>
            {["None", 1, 2, 3, 5, "∞"].map(c => (
              <button key={c} onClick={() => onSettings(id, { ...settings, cap: c })} style={{
                minWidth: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                padding: "0 8px",
                fontFamily: c === "None" || c === "∞" ? font : "'SF Mono', monospace",
                fontSize: c === "None" ? 11 : 13, fontWeight: 600,
                background: settings?.cap === c ? "#2D5016" : "#EDE7D9",
                color: settings?.cap === c ? "#fff" : "#8B7355",
              }}>{c}</button>
            ))}
          </div>
          {settings?.cap === "None" && (
            <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", fontStyle: "italic" }}>
              Pushes reset — no value carries forward. Keeps things predictable.
            </div>
          )}
        </div>
      )}
      {enabled && id === "presses" && (
        <div style={{ padding: "0 16px 14px", display: "flex", gap: 8 }}>
          {["Auto-press when 2 down", "Optional (must request)"].map(opt => (
            <button key={opt} onClick={() => onSettings(id, { ...settings, autoPress: opt })} style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: font, fontSize: 12, fontWeight: 600,
              background: settings?.autoPress === opt ? "#2D5016" : "#EDE7D9",
              color: settings?.autoPress === opt ? "#fff" : "#8B7355",
            }}>{opt}</button>
          ))}
        </div>
      )}
      {enabled && id === "pops" && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: font, fontSize: 12, color: "#8B7355" }}>Handicap %:</span>
            {[60, 70, 80, 90, 100].map(pct => (
              <button key={pct} onClick={() => onSettings(id, { ...settings, handicapPercent: pct })} style={{
                minWidth: 42, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "'SF Mono', 'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                background: (settings?.handicapPercent || 100) === pct ? "#2D5016" : "#EDE7D9",
                color: (settings?.handicapPercent || 100) === pct ? "#fff" : "#8B7355",
                transition: "all 0.15s ease",
              }}>{pct}%</button>
            ))}
          </div>
          <div style={{ fontFamily: font, fontSize: 11, color: "#A8957B", fontStyle: "italic" }}>
            {(settings?.handicapPercent || 100) === 100
              ? "Full handicap — strokes based on 100% of each player's index."
              : `Playing at ${settings?.handicapPercent}% — a ${20} HCP gets ${Math.round(20 * (settings?.handicapPercent || 100) / 100)} strokes.`
            }
          </div>
        </div>
      )}
    </div>
  );
}

// --- REVIEW SECTION ---
function ReviewSection({ label, value, icon }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "#FAF5EC", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: "#EDE7D9", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#8B7355",
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Lato', -apple-system, sans-serif",
          fontSize: 11, fontWeight: 600, color: "#A8957B",
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2,
        }}>{label}</div>
        <div style={{
          fontFamily: "'Lato', -apple-system, sans-serif",
          fontSize: 14, fontWeight: 600, color: "#1E130A",
        }}>{value}</div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CrybabSetupWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const font = "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const mono = "'SF Mono', 'JetBrains Mono', monospace";

  const [step, setStep] = useState(0);
  const steps = ["Format", "Players", "Course", "Rules", "Review"];

  // State
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [players, setPlayers] = useState([
    { name: "", ghin: "", handicap: null, cart: "", position: "" },
    { name: "", ghin: "", handicap: null, cart: "", position: "" },
  ]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCourseData, setSelectedCourseData] = useState(null);
  const [selectedTee, setSelectedTee] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [userCourses, setUserCourses] = useState([]);
  const [showAddClub, setShowAddClub] = useState(false);
  const [holeValue, setHoleValue] = useState(5);
  const [enabledMechanics, setEnabledMechanics] = useState(new Set());
  const [mechanicSettings, setMechanicSettings] = useState({
    hammer: { initiator: "Losing team only", maxDepth: "∞" },
    crybaby: { holes: 3, hammerRule: "Only crybaby hammers" },
    birdie_bonus: { multiplier: "2x" },
    carry_overs: { cap: "∞" },
    presses: { autoPress: "Optional (must request)" },
    pops: { handicapPercent: 100 },
  });
  const [privacy, setPrivacy] = useState("friends");
  const [roundStarted, setRoundStarted] = useState(false);
  const [activeRound, setActiveRound] = useState(null);
  const [checkingActive, setCheckingActive] = useState(true);

  // On mount: check for active round + pre-fill Player 1 + load user courses
  useEffect(() => {
    const init = async () => {
      const [active, profile] = await Promise.all([
        loadActiveRound().catch(() => null),
        loadProfile().catch(() => null),
      ]);
      setActiveRound(active);
      if (profile) {
        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "";
        setPlayers(prev => {
          const next = [...prev];
          next[0] = { ...next[0], name: fullName, handicap: profile.handicap ?? null, userId: user?.id || null };
          return next;
        });
      }
      setCheckingActive(false);

      // Load user-added courses
      supabase.from("user_courses").select("*").order("name").then(({ data }) => {
        if (data) setUserCourses(data);
      });
    };
    init();
  }, []);

  const format = GAME_FORMATS.find(g => g.id === selectedFormat);

  // Resolve course: API/search selection takes priority, then built-in list, then user courses
  const course = selectedCourseData || AUSTIN_COURSES.find(c => c.id === selectedCourse) || (() => {
    const uc = userCourses.find(c => c.id === selectedCourse);
    if (!uc) return undefined;
    const cd = uc.course_data || {};
    return {
      id: uc.id,
      name: uc.name,
      city: uc.city || "",
      state: uc.state || "",
      type: "user",
      holes: cd.holes || 18,
      pars: cd.pars || Array(cd.holes || 18).fill(4),
      handicaps: cd.handicaps || Array.from({ length: cd.holes || 18 }, (_, i) => i + 1),
      tees: cd.tees || [],
    };
  })();

  // Auto-enable default mechanics and set player count when format is selected
  useEffect(() => {
    if (format) {
      setEnabledMechanics(new Set(format.mechanics));
      // For fixed-count games, set exact number of player slots
      if (format.players.min === format.players.max) {
        const slots = Array.from({ length: format.players.min }, (_, i) => 
          players[i] || { name: "", ghin: "", handicap: null, cart: "", position: "" }
        );
        setPlayers(slots);
      } else {
        // For flexible games, ensure at least min players
        if (players.length < format.players.min) {
          const additional = Array.from(
            { length: format.players.min - players.length },
            () => ({ name: "", ghin: "", handicap: null, cart: "", position: "" })
          );
          setPlayers([...players, ...additional]);
        }
      }
    }
  }, [selectedFormat]);


  const addPlayer = () => {
    const maxP = format?.players.max || 6;
    if (players.length < maxP) {
      setPlayers([...players, { name: "", ghin: "", handicap: null, cart: "", position: "" }]);
    }
  };

  const removePlayer = (index) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  const updatePlayer = (index, updated) => {
    setPlayers(prev => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const toggleMechanic = (id) => {
    setEnabledMechanics(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateMechanicSettings = (id, settings) => {
    setMechanicSettings(prev => ({ ...prev, [id]: settings }));
  };

  const filteredCourses = AUSTIN_COURSES.filter(c =>
    c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
    c.city.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedFormat;
      case 1: return players.filter(p => p.name.trim()).length >= (format?.players.min || 2);
      case 2: return !!course && (!course.tees?.length || !!selectedTee);
      case 3: return holeValue > 0;
      case 4: return true;
      default: return false;
    }
  };

  // COMMENTATOR QUIPS
  const getCommentatorQuip = () => {
    if (roundStarted) return "🏌️ Round is live. Go get 'em.";
    const quips = {
      0: [
        "Pick your poison.",
        "Choose wisely. Or don't. It's your money.",
        "The game chooses you. Just kidding, you choose.",
      ],
      1: [
        `${players.filter(p => p.name).length} players, ${players.filter(p => !p.name).length} TBD. Someone's getting a text.`,
        "Add the pigeons. I mean, players.",
        "Everyone needs a GHIN. No sandbaggers allowed.",
      ],
      2: [
        "Where's the damage happening today?",
        "Pick the course. Blame the course later.",
      ],
      3: [
        `$${holeValue}/hole. ${enabledMechanics.has("hammer") ? "Hammers are live. Somebody's getting hurt." : "No hammers? Playing it safe."}`,
        "Set the rules. Break the rules. Actually, don't break the rules.",
      ],
      4: [
        "Last chance to back out. Nobody would blame you. (They would.)",
        "Everything looks good. Time to find out who's buying drinks.",
      ],
    };
    const options = quips[step] || ["Let's go."];
    return options[Math.floor(Math.random() * options.length)];
  };

  const [quip, setQuip] = useState(getCommentatorQuip());
  useEffect(() => { setQuip(getCommentatorQuip()); }, [step, holeValue, enabledMechanics.size]);

  const [saving, setSaving] = useState(false);

  const handleStartRound = async () => {
    if (activeRound) {
      toast({ title: "Round already in progress", description: "Resume or cancel your active round before starting a new one." });
      return;
    }
    setSaving(true);
    try {
      const roundId = await createRound({
        gameType: selectedFormat,
        course,
        courseDetails: course,
        stakes: `$${holeValue}/hole`,
        holeValue,
        players,
        mechanics: enabledMechanics,
        mechanicSettings,
        privacy,
        scorekeeperMode: true,
      });
      window.location.href = `/round?id=${roundId}`;
    } catch (err) {
      console.error("Failed to create round:", err);
      toast({ title: "Failed to start round", description: "Please try again.", variant: "destructive" });
      setSaving(false);
    }
  };

  useEffect(() => {
    if (roundStarted) {
      handleStartRound();
    }
  }, [roundStarted]);

  return (
    <>
    <div style={{
      maxWidth: 420, margin: "0 auto", minHeight: "100vh",
      background: "#F5EFE0", fontFamily: font,
      paddingBottom: 140, paddingTop: 16,
    }}>
      {/* Active Round Resume Banner */}
      {activeRound && (
        <div style={{
          margin: "12px 16px 0",
          padding: "14px 16px",
          background: "#FEF9C3",
          border: "1.5px solid #FDE047",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>⛳</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#A16207", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Round In Progress
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1E130A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeRound.course}
            </div>
          </div>
          <button
            onClick={() => { window.location.href = `/round?id=${activeRound.id}`; }}
            style={{
              padding: "9px 14px", borderRadius: 12, border: "none",
              background: "#2D5016", color: "#fff",
              fontFamily: font, fontSize: 13, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Resume →
          </button>
        </div>
      )}

      {/* Header — sticky below AppLayout top bar */}
      <div style={{
        padding: "16px 20px 14px",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #DDD0BB",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Pacifico', cursive", fontSize: 22, fontWeight: 400, color: "#2D5016" }}>New Round</span>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                fontFamily: font, fontSize: 14, fontWeight: 600, color: "#2D5016",
                background: "none", border: "none", cursor: "pointer",
                padding: "6px 12px", margin: "-6px -12px",
              }}
            >
              ← Back
            </button>
          )}
        </div>
        <StepIndicator steps={steps} currentStep={step} />
        {/* Commentator */}
        <div style={{
          padding: "8px 12px", background: "#F5EFE0", borderRadius: 8,
          fontFamily: font, fontSize: 12, color: "#8B7355", fontStyle: "italic",
          borderLeft: "3px solid #F59E0B",
        }}>
          💬 {quip}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px" }}>
        {/* STEP 0: FORMAT */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              fontFamily: "'Pacifico', cursive",
              fontSize: 22, fontWeight: 400, color: "#2D5016",
              letterSpacing: "0", marginBottom: 2,
            }}>
              Choose Your Game
            </div>
            {GAME_FORMATS.map(g => (
              <GameCard
                key={g.id}
                game={g}
                selected={selectedFormat}
                onSelect={setSelectedFormat}
                playerCount={0}
              />
            ))}
          </div>
        )}

        {/* STEP 1: PLAYERS */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em" }}>
                  Add Players
                </div>
                <div style={{ fontSize: 13, color: "#A8957B", marginTop: 2 }}>
                  {format?.players.min === format?.players.max
                    ? `Exactly ${format.players.min} players required`
                    : `${format?.players.min}-${format?.players.max} players`
                  }
                </div>
              </div>
              {format?.players.min === format?.players.max ? (
                <span style={{
                  fontFamily: mono, fontSize: 13, fontWeight: 700,
                  padding: "4px 10px", borderRadius: 8,
                  background: players.filter(p => p.name.trim()).length === format.players.min ? "#EEF5E5" : "#FEF3C7",
                  color: players.filter(p => p.name.trim()).length === format.players.min ? "#2D5016" : "#92400E",
                }}>
                  {players.filter(p => p.name.trim()).length}/{format.players.min} locked
                </span>
              ) : (
                <span style={{
                  fontFamily: mono, fontSize: 13, fontWeight: 700,
                  color: players.filter(p => p.name.trim()).length >= (format?.players.min || 2) ? "#2D5016" : "#A8957B",
                }}>
                  {players.filter(p => p.name.trim()).length}/{format?.players.max || 6}
                </span>
              )}
            </div>

            {players.map((p, i) => (
              <PlayerRow
                key={i}
                player={p}
                index={i}
                onUpdate={updatePlayer}
                onRemove={removePlayer}
                showCarts={format?.requiresCarts}
                cartOptions={["Cart A — Driver", "Cart A — Rider", "Cart B — Driver", "Cart B — Rider"]}
                canRemove={format?.players.min !== format?.players.max && i >= 2}
                currentUserId={user?.id}
              />
            ))}

            {format?.players.min !== format?.players.max && players.length < (format?.players.max || 6) && (
              <button onClick={addPlayer} style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "2px dashed #D1D5DB",
                background: "transparent", cursor: "pointer",
                fontFamily: font, fontSize: 14, fontWeight: 600, color: "#A8957B",
                transition: "all 0.15s ease",
              }}>
                + Add Player
              </button>
            )}

            <div style={{
              marginTop: 8, padding: "10px 14px", background: "#FEF3C7", borderRadius: 10,
              fontFamily: font, fontSize: 12, color: "#92400E",
            }}>
              💡 Start typing a name to search friends &amp; players. Their handicap auto-fills. Or just type a guest name.
            </div>
          </div>
        )}

        {/* STEP 2: COURSE */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em" }}>
              Select Course
            </div>

            <CourseSearch
              value={course?.name}
              onSelect={c => {
                setSelectedCourseData(c);
                setSelectedCourse(c.id);
                setSelectedTee(null);
              }}
              onAddManually={() => setShowAddClub(true)}
            />

            {/* Selected course info card */}
            {course && (
              <div style={{
                background: "#FAF5EC", borderRadius: 14, padding: "14px 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                border: "1px solid #DDD0BB",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: "#1E130A" }}>
                    {course.name}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: (TYPE_COLORS[course.type] || "#8B7355") + "18",
                    color: TYPE_COLORS[course.type] || "#8B7355",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>{course.type}</span>
                </div>
                <div style={{ fontFamily: font, fontSize: 12, color: "#8B7355", marginBottom: 12 }}>
                  {course.city}{course.holes === 9 ? " · 9 holes" : " · 18 holes"}
                </div>

                {/* Tee selection */}
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 8 }}>
                  Select Tees
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {course.tees.map(tee => (
                    <button key={tee.name} onClick={() => setSelectedTee(tee.name)} style={{
                      flex: 1, padding: "12px 14px", borderRadius: 12, border: "none", cursor: "pointer",
                      background: selectedTee === tee.name ? "#2D5016" : "#FAF5EC",
                      color: selectedTee === tee.name ? "#fff" : "#1E130A",
                      boxShadow: selectedTee === tee.name ? "0 2px 8px rgba(45,80,22,0.2)" : "none",
                      transition: "all 0.2s ease", textAlign: "center",
                    }}>
                      <div style={{ fontFamily: font, fontSize: 14, fontWeight: 700 }}>{tee.name}</div>
                      <div style={{ fontFamily: mono, fontSize: 11, marginTop: 4, opacity: 0.8 }}>{tee.yardage}y</div>
                      <div style={{ fontFamily: mono, fontSize: 10, marginTop: 2, opacity: 0.6 }}>{tee.slope} / {tee.rating}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {course && selectedTee && (
              <div style={{
                marginTop: 4, background: "#FAF5EC", borderRadius: 14, padding: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "auto",
              }}>
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 10 }}>
                  Scorecard Preview
                </div>
                <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
                  {course.pars.map((par, i) => (
                    <div key={i} style={{
                      minWidth: 36, textAlign: "center", padding: "6px 4px",
                      background: i < 9 ? "#FAF5EC" : "#EDE7D9", borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: mono, fontSize: 10, color: "#A8957B", fontWeight: 700 }}>{i + 1}</div>
                      <div style={{ fontFamily: mono, fontSize: 13, color: "#1E130A", fontWeight: 700 }}>{par}</div>
                      <div style={{ fontFamily: mono, fontSize: 9, color: "#8B7355" }}>H{course.handicaps[i]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: RULES */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em" }}>
              Set the Stakes
            </div>

            {/* Hole Value */}
            <div style={{
              background: "#FAF5EC", borderRadius: 16, padding: "20px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 12 }}>
                Hole Value
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
                <button onClick={() => setHoleValue(Math.max(1, holeValue - 1))} style={{
                  width: 48, height: 48, borderRadius: 24, border: "none",
                  background: "#EDE7D9", cursor: "pointer", fontSize: 22, fontWeight: 700, color: "#8B7355",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>−</button>
                <div style={{
                  fontFamily: mono, fontSize: 48, fontWeight: 800, color: "#1E130A",
                  letterSpacing: "-0.03em", minWidth: 100, textAlign: "center",
                }}>
                  ${holeValue}
                </div>
                <button onClick={() => setHoleValue(holeValue + 1)} style={{
                  width: 48, height: 48, borderRadius: 24, border: "none",
                  background: "#2D5016", cursor: "pointer", fontSize: 22, fontWeight: 700, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>+</button>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                {[2, 5, 10, 20, 50].map(v => (
                  <button key={v} onClick={() => setHoleValue(v)} style={{
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontFamily: mono, fontSize: 12, fontWeight: 700,
                    background: holeValue === v ? "#1E130A" : "#EDE7D9",
                    color: holeValue === v ? "#fff" : "#8B7355",
                    transition: "all 0.15s ease",
                  }}>${v}</button>
                ))}
              </div>
              <div style={{
                marginTop: 14, textAlign: "center",
                fontFamily: mono, fontSize: 12, color: "#A8957B",
              }}>
                Max exposure: ~${holeValue * (format?.defaultHoles || 18) * 3}
              </div>
            </div>

            {/* Mechanics */}
            <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginTop: 4 }}>
              Game Mechanics
            </div>
            {Object.entries(MECHANICS_CONFIG).map(([id, config]) => (
              <MechanicToggle
                key={id}
                id={id}
                config={config}
                enabled={enabledMechanics.has(id)}
                onToggle={toggleMechanic}
                settings={mechanicSettings[id]}
                onSettings={updateMechanicSettings}
              />
            ))}

            {/* Privacy */}
            <div style={{
              marginTop: 4, background: "#FAF5EC", borderRadius: 14, padding: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 10 }}>
                Round Visibility
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { value: "public",  label: "Public",     icon: <Globe size={16} strokeWidth={2} /> },
                  { value: "friends", label: "Friends",    icon: <Users size={16} strokeWidth={2} /> },
                  { value: "group",   label: "Group Only", icon: <Lock size={16} strokeWidth={2} /> },
                  { value: "private", label: "Private",    icon: <EyeOff size={16} strokeWidth={2} /> },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setPrivacy(opt.value)} style={{
                    flex: 1, minWidth: 70, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: privacy === opt.value ? "#1E130A" : "#EDE7D9",
                    color: privacy === opt.value ? "#fff" : "#8B7355",
                    fontFamily: font, fontSize: 12, fontWeight: 600,
                    transition: "all 0.15s ease", textAlign: "center",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1E130A", letterSpacing: "-0.02em", marginBottom: 4 }}>
              Review & Start
            </div>

            <ReviewSection icon={format ? GAME_ICON[format.id]?.(18) : null} label="Game" value={format?.name} />
            <ReviewSection icon={<Users size={18} strokeWidth={2} />} label="Players" value={players.filter(p => p.name.trim()).map(p => p.name).join(", ")} />
            <ReviewSection icon={<Flag size={18} strokeWidth={2} />} label="Course" value={`${course?.name}${selectedTee ? ` · ${selectedTee} tees` : ""}`} />
            <ReviewSection icon={<MoneyIcon size={18} />} label="Hole Value" value={`$${holeValue} / hole`} />
            <ReviewSection icon={<Sliders size={18} strokeWidth={2} />} label="Mechanics" value={[...enabledMechanics].map(m => MECHANICS_CONFIG[m]?.label).join(", ") || "None"} />
            <ReviewSection icon={<Eye size={18} strokeWidth={2} />} label="Visibility" value={privacy.charAt(0).toUpperCase() + privacy.slice(1)} />

            {/* Estimated exposure */}
            <div style={{
              marginTop: 8, background: "#FEF3C7", borderRadius: 14, padding: "16px 18px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Estimated Max Exposure
              </div>
              <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 800, color: "#92400E" }}>
                ${holeValue * (format?.defaultHoles || 18) * (enabledMechanics.has("hammer") ? 4 : 2)}
              </div>
              <div style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>
                {enabledMechanics.has("hammer") ? "With hammers, things can escalate." : "Steady game. No hammers."}
              </div>
            </div>

            {/* Rules summary */}
            {enabledMechanics.size > 0 && (
              <div style={{
                background: "#FAF5EC", borderRadius: 14, padding: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 14, fontWeight: 400, color: "#2D5016", marginBottom: 10 }}>
                  House Rules
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {enabledMechanics.has("hammer") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🔨 Hammer: {mechanicSettings.hammer.initiator}, max depth {mechanicSettings.hammer.maxDepth}
                    </div>
                  )}
                  {enabledMechanics.has("crybaby") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🍼 Crybaby: {mechanicSettings.crybaby.holes} holes, {mechanicSettings.crybaby.hammerRule.toLowerCase()}
                    </div>
                  )}
                  {enabledMechanics.has("birdie_bonus") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🐦 Birdies: {mechanicSettings.birdie_bonus.multiplier} hole value
                    </div>
                  )}
                  {enabledMechanics.has("presses") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      📈 Presses: {mechanicSettings.presses.autoPress}
                    </div>
                  )}
                  {enabledMechanics.has("pops") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🎯 Handicap strokes at {mechanicSettings.pops?.handicapPercent || 100}%{enabledMechanics.has("no_pops_par3") ? " (no pops on par 3s)" : ""}
                    </div>
                  )}
                  {enabledMechanics.has("carry_overs") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      ➡️ Carry-overs enabled
                    </div>
                  )}
                  {enabledMechanics.has("greenies") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      🟢 Greenies enabled
                    </div>
                  )}
                  {enabledMechanics.has("sandies") && (
                    <div style={{ fontFamily: font, fontSize: 13, color: "#8B7355" }}>
                      ⛱️ Sandies enabled
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: "fixed", bottom: 64, left: 0, right: 0,
        padding: "16px 20px", paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        background: "rgba(247,247,245,0.95)", backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid #DDD0BB",
        display: "flex", justifyContent: "center",
      }}>
        <button
          disabled={!canProceed()}
          onClick={() => {
            if (step < 4) setStep(step + 1);
            else setRoundStarted(true);
          }}
          style={{
            width: "100%", maxWidth: 380,
            padding: "11px 24px",
            borderRadius: 14,
            border: "none", cursor: canProceed() ? "pointer" : "not-allowed",
            fontFamily: "'Pacifico', cursive",
            fontSize: 18,
            fontWeight: 400,
            background: "#2D5016",
            color: "#D4AF37",
            opacity: canProceed() ? 1 : 0.45,
            transition: "all 0.2s ease",
            minHeight: 44,
            boxShadow: "0 2px 12px rgba(45,80,22,0.25)",
            textShadow: "0 1px 6px rgba(212, 175, 55, 0.45)",
          }}
        >
          {step < 4 ? "Continue" : "Start Round 🏌️"}
        </button>
      </div>
    </div>

    {/* Add Club Modal */}
    {showAddClub && (
      <AddClubModal
        onClose={() => setShowAddClub(false)}
        onSaved={(newCourse) => {
          setUserCourses(prev => [...prev, newCourse]);
          setSelectedCourse(newCourse.id);
          setSelectedTee(null);
          setShowAddClub(false);
        }}
      />
    )}
    </>
  );
}
