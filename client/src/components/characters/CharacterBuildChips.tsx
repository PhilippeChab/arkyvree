import { ValueChip } from "@/client/src/components/common/index.ts";
import type { CharacterListItem } from "@/client/src/lib/queries.ts";

interface CharacterBuildChipsProps {
  /** Its card's chips, in its ruleset's order: 3.5's race, in the secondary color, then each class at its level. */
  chips: CharacterListItem["chips"];
}

/** A character card's build, among its chips, as its ruleset describes it. */
export function CharacterBuildChips({ chips }: CharacterBuildChipsProps) {
  // A race and a class may share a name: their tone tells them apart
  return chips.map((chip) => <ValueChip key={`${chip.tone} ${chip.label}`} label={chip.label} color={chip.tone} />);
}
