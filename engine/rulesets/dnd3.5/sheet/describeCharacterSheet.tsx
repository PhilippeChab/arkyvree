import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import { buildCharacter } from "@/engine/rulesets/dnd3.5/character/buildCharacter.ts";
import type { CharacterKind } from "@/engine/rulesets/dnd3.5/types.ts";

import DetailedCharacterSheet from "./DetailedCharacterSheet.tsx";

/**
 * A character's printed sheet, from its rows: its pages as the PDF document the server renders, with its portrait
 * (`portraitUrl`), and the diagnostics page with `diagnostics` (a development server's).
 */
export function describeCharacterSheet(
  view: RulesetView,
  character: CharacterInput,
  options: { diagnostics: boolean; portraitUrl?: string | null },
) {
  return (
    <DetailedCharacterSheet
      detailedCharacter={buildCharacter(view, character)}
      kind={character.record.kind as CharacterKind}
      {...options}
    />
  );
}
