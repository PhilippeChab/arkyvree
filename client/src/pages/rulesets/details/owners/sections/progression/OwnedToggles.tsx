import { Box, ButtonBase } from "@mui/material";

import type { PositionWord } from "@/client/src/lib/rulesetLabels.ts";

interface OwnedTogglesProps {
  /** What the toggles grant, which each one's label names ("Evasion at level 2") */
  label: string;
  /** An owned entity's toggle was clicked */
  onToggle: (ownedId: string) => void;
  /** The owner's owned entities, each its number (`position`) */
  ownedEntities: readonly { id: string; position: number }[];
  /**
   * Its rules' word for an owned entity's position along its owner, which names one ("Level 3"), and several ("Levels")
   */
  positionWord: PositionWord;
  /** Read-only: nothing to click */
  readOnly?: boolean;
  /** What an owned entity holds as saved: a changed toggle is outlined */
  saved: (ownedId: string) => number;
  /** What an owned entity holds: 0 is off, a count above 1 shows on its toggle */
  value: (ownedId: string) => number;
}

/** One toggle an owned entity, filled where something is granted, outlined where the tab changed it before its save. */
export function OwnedToggles({
  label,
  ownedEntities,
  onToggle,
  positionWord,
  readOnly,
  saved,
  value,
}: OwnedTogglesProps) {
  return (
    <Box
      role="group"
      aria-label={`${positionWord.many} of ${label}`}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(ownedEntities.length, 1)}, minmax(24px, 1fr))`,
        gap: 0.5,
      }}
    >
      {ownedEntities.map(({ id, position }) => {
        const count = value(id);
        const changed = count !== saved(id);
        return (
          <ButtonBase
            key={id}
            disabled={readOnly}
            aria-pressed={count > 0}
            aria-label={`${positionWord.one} ${position}: ${label}${count > 1 ? `, ${count} Picks` : ""}`}
            onClick={() => onToggle(id)}
            sx={{
              fontSize: "0.72rem",
              fontVariantNumeric: "tabular-nums",
              py: 0.25,
              borderRadius: 0.5,
              border: 1,
              borderColor: count > 0 ? "primary.main" : "divider",
              bgcolor: count > 0 ? "primary.main" : "background.default",
              color: count > 0 ? "primary.contrastText" : "text.secondary",
              fontWeight: count > 0 ? 600 : 400,
              outline: changed ? 2 : 0,
              outlineColor: "secondary.main",
              outlineOffset: 1,
            }}
          >
            {count > 1 ? `${position}×${count}` : position}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
