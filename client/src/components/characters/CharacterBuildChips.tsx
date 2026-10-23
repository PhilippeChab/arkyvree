import { ValueChip } from "@/client/src/components/common/index.ts";

interface CharacterBuildChipsProps {
  /** Its card's chips, in its ruleset's order: 3.5's race, gold, then each of its classes at its level. */
  chips: readonly { label: string; tone: "primary" | "secondary" }[];
}

/** A character card's build, among its chips, as its ruleset describes it. */
export function CharacterBuildChips({ chips }: CharacterBuildChipsProps) {
  return chips.map((chip) => <ValueChip key={chip.label} label={chip.label} color={chip.tone} />);
}
