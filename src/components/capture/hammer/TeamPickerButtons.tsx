import type { Player } from "@/lib/gameEngines";

/**
 * Two large tappable team cards for "Who threw first?" and similar
 * team-picking moments in the hammer prompt.
 *
 * Renders team name + a compact list of player names. Selected state
 * is expressed via a visible border + aria-pressed in addition to any
 * color change (non-color-only signal).
 */

interface TeamPickerButtonsProps {
  teamA: { name: string; players: Player[] };
  teamB: { name: string; players: Player[] };
  selected: "A" | "B" | null;
  onSelect: (team: "A" | "B") => void;
  disabled?: boolean;
}

function TeamCard({
  team,
  name,
  players,
  selected,
  onSelect,
  disabled,
}: {
  team: "A" | "B";
  name: string;
  players: Player[];
  selected: boolean;
  onSelect: (team: "A" | "B") => void;
  disabled: boolean;
}): JSX.Element {
  const id = `team-picker-${team.toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(team)}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={id}
      className={`flex min-h-24 flex-1 flex-col items-start gap-1 rounded-2xl border-4 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${selected
        ? "border-primary bg-primary/10"
        : "border-border bg-background hover:bg-muted"
        }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Team {team}
      </span>
      <span className="text-lg font-bold text-foreground">{name}</span>
      <span className="text-sm text-muted-foreground">
        {players.map(p => p.name).join(" + ")}
      </span>
    </button>
  );
}

export default function TeamPickerButtons({
  teamA,
  teamB,
  selected,
  onSelect,
  disabled = false,
}: TeamPickerButtonsProps): JSX.Element {
  return (
    <div data-testid="team-picker-buttons" className="flex gap-3">
      <TeamCard
        team="A"
        name={teamA.name}
        players={teamA.players}
        selected={selected === "A"}
        onSelect={onSelect}
        disabled={disabled}
      />
      <TeamCard
        team="B"
        name={teamB.name}
        players={teamB.players}
        selected={selected === "B"}
        onSelect={onSelect}
        disabled={disabled}
      />
    </div>
  );
}
