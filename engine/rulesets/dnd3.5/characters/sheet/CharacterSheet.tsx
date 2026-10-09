import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CharacterBuilder, { type CharacterKind } from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";

import DetailedCharacterSheet from "./DetailedCharacterSheet.tsx";

/** A character's printed sheet: the PDF document the server renders. */
export default class CharacterSheet {
  /**
   * A character's printed sheet, from its rows: its pages as the PDF document the server renders, with its portrait
   * (`portraitUrl`), and the diagnostics page with `diagnostics` (a development server's).
   */
  static describe(
    view: RulesetView,
    character: CharacterInput,
    options: { diagnostics: boolean; portraitUrl?: string | null },
  ) {
    return (
      <DetailedCharacterSheet
        detailedCharacter={CharacterBuilder.build(view, character)}
        kind={character.record.kind as CharacterKind}
        {...options}
      />
    );
  }
}
