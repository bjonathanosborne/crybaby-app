/**
 * CrybIcons — Crybaby's owned SVG icon set
 *
 * All icons: 24x24 viewBox, currentColor, stroke-based (1.5px).
 * Drop-in alongside lucide-react. Use `className="text-primary"` etc. for theming.
 *
 * Named exports: EagleIcon, BirdieIcon, ParFlagIcon, BogeyIcon, DoubleBogeyIcon,
 *   TriplePlusIcon, HammerIcon, CrybabyBottleIcon, FoldFlagIcon, WolfIcon,
 *   PushIcon, MoneyIcon, GolferIcon, PressIcon
 *
 * Lookup: <CrybIcon name="eagle" size={20} className="text-primary" />
 * Map:    SCORE_ICONS["eagle"] → EagleIcon component
 */

import type { SVGProps } from "react";
import { Trophy } from "lucide-react";

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

// ── Golf Scoring Icons ──────────────────────────────────────────────────────

/** Eagle (2 under par) — soaring bird silhouette, wide wingspan */
export function EagleIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Left wing sweeping out */}
      <path d="M12 10 C9 8, 4 7, 2 9" />
      {/* Right wing sweeping out */}
      <path d="M12 10 C15 8, 20 7, 22 9" />
      {/* Body arc */}
      <path d="M9 11 C10 13, 12 14, 14 13 C15 12, 15 10, 12 10" />
      {/* Head */}
      <circle cx="14.5" cy="9.5" r="1" fill={color || "currentColor"} stroke="none" />
      {/* Tail fork */}
      <path d="M9 11 L7 14 M9 11 L8 14.5" />
    </svg>
  );
}

/** Birdie (1 under par) — small perched bird, rounder than eagle */
export function BirdieIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Body */}
      <ellipse cx="12" cy="13" rx="4" ry="3" />
      {/* Wing */}
      <path d="M10 11 C9 8, 6 8, 5 10" />
      {/* Head */}
      <circle cx="15" cy="10" r="2" />
      {/* Beak */}
      <path d="M16.8 9.5 L18.5 9" />
      {/* Eye */}
      <circle cx="15.2" cy="9.6" r="0.4" fill={color || "currentColor"} stroke="none" />
      {/* Tail */}
      <path d="M8 13 L6 15" />
      {/* Feet */}
      <path d="M10 16 L9 18 M10 16 L11 18" />
      <path d="M14 16 L13 18 M14 16 L15 18" />
    </svg>
  );
}

/** Par (even) — golf flag on pole, the universal golf icon */
export function ParFlagIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Flagpole */}
      <line x1="8" y1="4" x2="8" y2="20" />
      {/* Flag pennant */}
      <path d="M8 4 L16 7.5 L8 11" fill={color || "currentColor"} stroke="none" />
      {/* Ground line */}
      <path d="M5 20 L11 20" />
    </svg>
  );
}

/** Bogey (1 over par) — minus in soft circle */
export function BogeyIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

/** Double Bogey (2 over par) — double minus in circle */
export function DoubleBogeyIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </svg>
  );
}

/** Triple+ Bogey (3+ over par) — geometric skull, bold at any size */
export function TriplePlusIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Skull dome */}
      <path d="M7 14 C7 9, 17 9, 17 14 L17 16 L7 16 Z" />
      {/* Jaw teeth */}
      <path d="M7 16 L7 18 L10 18 L10 16" />
      <path d="M14 16 L14 18 L17 18 L17 16" />
      {/* Eyes */}
      <circle cx="9.5" cy="13" r="1.5" fill={color || "currentColor"} stroke="none" />
      <circle cx="14.5" cy="13" r="1.5" fill={color || "currentColor"} stroke="none" />
    </svg>
  );
}

// ── Game Mechanic Icons ─────────────────────────────────────────────────────

/** Hammer — the escalation bet mechanic */
export function HammerIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Handle */}
      <line x1="15" y1="9" x2="6" y2="18" />
      {/* Head */}
      <rect x="9" y="4" width="10" height="6" rx="1.5"
        transform="rotate(45 14 7)"
        fill={color || "currentColor"}
        stroke="none"
      />
    </svg>
  );
}

/** Baby Bottle — the Crybaby / biggest loser icon */
export function CrybabyBottleIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Nipple tip */}
      <path d="M13 4 C13 3, 11 3, 11 4 L11 6 L13 6 Z" fill={color || "currentColor"} stroke="none" />
      {/* Collar ring */}
      <rect x="10" y="6" width="4" height="2" rx="0.5" />
      {/* Bottle body */}
      <rect x="9" y="8" width="6" height="12" rx="3" />
      {/* Measurement lines */}
      <line x1="10.5" y1="12" x2="13.5" y2="12" strokeWidth={1} />
      <line x1="10.5" y1="15" x2="13.5" y2="15" strokeWidth={1} />
    </svg>
  );
}

/** White flag — fold / chicken out mechanic */
export function FoldFlagIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Flagpole */}
      <line x1="7" y1="4" x2="7" y2="20" />
      {/* Waving white flag */}
      <path d="M7 5 C10 5, 12 7, 16 6 C12 8, 10 10, 7 9 Z" fill={color || "currentColor"} stroke="none" />
    </svg>
  );
}

/** Wolf head — wolf game mode */
export function WolfIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Ears */}
      <polygon points="6,6 9,12 3,10" fill={color || "currentColor"} stroke="none" />
      <polygon points="18,6 21,10 15,12" fill={color || "currentColor"} stroke="none" />
      {/* Head */}
      <path d="M7 11 C7 8, 10 6, 12 6 C14 6, 17 8, 17 11 C17 14, 15 16, 12 17 C9 16, 7 14, 7 11 Z" />
      {/* Snout */}
      <path d="M10 14 C10 15, 12 16, 14 15 C14 13, 10 13, 10 14 Z" />
      {/* Eyes */}
      <circle cx="10" cy="11" r="1" fill={color || "currentColor"} stroke="none" />
      <circle cx="14" cy="11" r="1" fill={color || "currentColor"} stroke="none" />
    </svg>
  );
}

/** Push / tie — horizontal double arrow */
export function PushIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="8,9 5,12 8,15" />
      <polyline points="16,9 19,12 16,15" />
    </svg>
  );
}

/** Money / stakes — stylized dollar coin */
export function MoneyIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7 L12 8.5 M12 15.5 L12 17" />
      <path d="M9.5 10 C9.5 8.5, 14.5 8.5, 14.5 11 C14.5 13, 9.5 13, 9.5 15 C9.5 16.5, 14.5 16.5, 14.5 15" />
    </svg>
  );
}

/** Golfer — player silhouette mid-swing */
export function GolferIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Head */}
      <circle cx="14" cy="5" r="2" />
      {/* Body */}
      <path d="M14 7 L12 13" />
      {/* Arm + club */}
      <path d="M14 9 L18 11 L17 15" />
      {/* Legs */}
      <path d="M12 13 L10 18 M12 13 L14 18" />
    </svg>
  );
}

/** Press — Nassau press escalation */
export function PressIcon({ size = 20, className = "", color }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Plus inside a square */}
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// ── Lookup API ──────────────────────────────────────────────────────────────

export const SCORE_ICONS: Record<string, React.ComponentType<IconProps>> = {
  eagle: EagleIcon,
  birdie: BirdieIcon,
  par: ParFlagIcon,
  bogey: BogeyIcon,
  double_bogey: DoubleBogeyIcon,
  triple_plus: TriplePlusIcon,
  push: PushIcon,
  team_win: Trophy as React.ComponentType<IconProps>,
  hammer: HammerIcon,
  hammer_accepted: HammerIcon,
  hammer_fold: FoldFlagIcon,
  score: ParFlagIcon,
  score_updated: ParFlagIcon,
  crybaby_bottle: CrybabyBottleIcon,
  wolf: WolfIcon,
  money: MoneyIcon,
  golfer: GolferIcon,
  press: PressIcon,
};

/** Universal lookup component — use where event_type drives the icon */
export function CrybIcon({
  name,
  size = 20,
  className = "",
  color,
}: { name: string } & IconProps) {
  const Icon = SCORE_ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} className={className} color={color} />;
}
