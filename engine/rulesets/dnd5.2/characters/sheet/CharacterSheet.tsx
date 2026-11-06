import type { CharacterInput, SheetRequest } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CharacterResponse from "@/engine/rulesets/dnd5.2/characters/description/CharacterResponse.ts";
import Dnd52CharacterBuilder from "@/engine/rulesets/dnd5.2/model/Dnd52CharacterBuilder.ts";

import DetailedCharacterSheet from "./DetailedCharacterSheet.tsx";

/** A character's printed sheet: the PDF document the server renders. */
export default class CharacterSheet {
  /**
   * A character's printed sheet, from its rows: its pages as the PDF document the server renders, from its sheet as the
   * API describes it (`CharacterResponse.buildSheet`: its blocks, which its pages render), with its portrait
   * (`portraitUrl`), and the diagnostics page with `diagnostics` (a development server's).
   */
  static describeSheet(view: RulesetView, character: CharacterInput, request: SheetRequest) {
    const detailedCharacter = Dnd52CharacterBuilder.build(view, character);
    return (
      <DetailedCharacterSheet
        detailedCharacter={detailedCharacter}
        sheet={CharacterResponse.buildSheet(detailedCharacter)}
        {...request}
      />
    );
  }
}
