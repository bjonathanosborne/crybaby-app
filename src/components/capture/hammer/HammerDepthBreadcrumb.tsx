import type { HammerDepthEvent } from "@/lib/hammerMath";

/**
 * Compact horizontal trail of hammer events entered so far for the
 * current hole. Each event is a little chip: "D1: A→B accepted". Tapping
 * a chip jumps back to edit from that event (destroys subsequent events
 * after a confirm in the parent). Empty state shows a hint.
 */

interface HammerDepthBreadcrumbProps {
  events: HammerDepthEvent[];
  onJumpTo?: (depth: number) => void;
}

export default function HammerDepthBreadcrumb({
  events,
  onJumpTo,
}: HammerDepthBreadcrumbProps): JSX.Element {
  if (events.length === 0) {
    return (
      <div
        data-testid="hammer-depth-breadcrumb"
        aria-hidden="true"
        className="min-h-8 rounded-md bg-muted/40 px-3 py-1.5 text-xs italic text-muted-foreground"
      >
        No hammer events yet.
      </div>
    );
  }

  return (
    <nav
      data-testid="hammer-depth-breadcrumb"
      aria-label="Hammer event history for this hole"
      className="flex flex-wrap items-center gap-1"
    >
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        const otherTeam = e.thrower === "A" ? "B" : "A";
        const responseLabel = e.response === "accepted" ? "accepted" : "laid down";
        const label = `D${e.depth}: ${e.thrower}→${otherTeam} ${responseLabel}`;
        const handleClick = () => onJumpTo?.(e.depth);
        return (
          <button
            key={e.depth}
            type="button"
            onClick={handleClick}
            disabled={!onJumpTo}
            aria-label={`Edit from depth ${e.depth}: Team ${e.thrower} threw, Team ${otherTeam} ${responseLabel}`}
            className={`rounded-full px-2 py-1 text-xs font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${isLast
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/70"
              } ${!onJumpTo ? "cursor-default" : "cursor-pointer"}`}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
