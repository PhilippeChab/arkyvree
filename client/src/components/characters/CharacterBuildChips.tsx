import { ValueChip } from "@/client/src/components/common/index.ts";

interface CharacterBuildChipsProps {
  /** Its classes, each at the highest level it reached. */
  levels: readonly { klass: string; level: number }[];
  race: string;
}

/** A character card's build, among its chips: its race, gold, then each of its classes and its level. */
export function CharacterBuildChips({ levels, race }: CharacterBuildChipsProps) {
  return (
    <>
      <ValueChip label={race} color="secondary" />
      {levels.map((level) => (
        <ValueChip key={level.klass} label={`${level.klass} ${level.level}`} />
      ))}
    </>
  );
}
