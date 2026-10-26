import { Box, ButtonBase } from "@mui/material";

interface LevelTogglesProps {
  /** What the toggles grant, which each one's label names ("Evasion at level 2") */
  label: string;
  /** The owner's levels, by their number */
  levels: readonly { id: string; level: number }[];
  /** A level's toggle was clicked */
  onToggle: (levelId: string) => void;
  /** Read-only: nothing to click */
  readOnly?: boolean;
  /** What a level holds as saved: a changed toggle is outlined */
  saved: (levelId: string) => number;
  /** What a level holds: 0 is off, a count above 1 shows on its toggle */
  value: (levelId: string) => number;
}

/** One toggle a level, filled where something is granted, outlined where the tab changed it before its save. */
export function LevelToggles({ label, levels, onToggle, readOnly, saved, value }: LevelTogglesProps) {
  return (
    <Box
      role="group"
      aria-label={`Levels of ${label}`}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(levels.length, 1)}, minmax(24px, 1fr))`,
        gap: 0.5,
      }}
    >
      {levels.map(({ id, level }) => {
        const count = value(id);
        const changed = count !== saved(id);
        return (
          <ButtonBase
            key={id}
            disabled={readOnly}
            aria-pressed={count > 0}
            aria-label={`Level ${level}: ${label}${count > 1 ? `, ${count} Picks` : ""}`}
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
            {count > 1 ? `${level}×${count}` : level}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
