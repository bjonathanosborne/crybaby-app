import { useEffect, useRef } from "react";

/**
 * Full-bleed celebratory transition between hammer holes. Fades in
 * ~150ms, lingers ~1.2s, fades out ~150ms. Total ~1.5s.
 *
 * Tap anywhere to dismiss early. Screen readers announce via
 * role=status + aria-live=polite.
 */

export interface HoleTransitionProps {
  city: string;
  onComplete: () => void;
}

const LINGER_MS = 1500;

export default function HoleTransition({ city, onComplete }: HoleTransitionProps): JSX.Element {
  // Guard against double-fire: auto-timer + user tap both call onComplete.
  const firedRef = useRef<boolean>(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete();
      }
    }, LINGER_MS);
    return () => clearTimeout(t);
  }, [onComplete]);

  const handleTap = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onComplete();
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      data-testid="hole-transition"
      role="status"
      aria-live="polite"
      aria-label={`OK. Cool onto ${city}.`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2D5016]/95 text-center focus:outline-none animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <span className="px-6 font-pacifico text-4xl leading-snug text-[#F5EFE0] sm:text-5xl">
        OK. Cool onto<br />
        <span className="text-[#D4AF37]">{city}.</span>
      </span>
    </button>
  );
}
