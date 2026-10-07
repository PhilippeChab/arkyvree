import { Chip } from "@mui/material";

interface CharacterBuildChipsProps {
  /** Its classes, each at the highest level it reached. */
  levels: readonly { klass: string; level: number }[];
  race: string;
}

/** A character card's build, among its pills: its race, then each of its classes and its level. */
export function CharacterBuildChips({ levels, race }: CharacterBuildChipsProps) {
  return (
    <>
      <Chip
        label={race}
        size="small"
        variant="outlined"
        sx={{ borderColor: "secondary.main", color: "secondary.main", fontWeight: 500 }}
      />
      {levels.map((level) => (
        <Chip
          key={level.klass}
          label={`${level.klass} ${level.level}`}
          size="small"
          sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 500 }}
        />
      ))}
    </>
  );
}
