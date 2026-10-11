import type { CharacterInput, SheetRequest } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35CharacterBuilder, { type CharacterKind } from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";

import DetailedCharacterSheet from "./DetailedCharacterSheet.tsx";

/** A character's printed sheet: the PDF document the server renders. */
export default class CharacterSheet {
  /**
   * A character's printed sheet, from its rows: its pages as the PDF document the server renders, with its portrait
   * (`portraitUrl`), and the diagnostics page with `diagnostics` (a development server's).
   */
  static describeSheet(view: RulesetView, character: CharacterInput, request: SheetRequest) {
    return (
      <DetailedCharacterSheet
        detailedCharacter={Dnd35CharacterBuilder.build(view, character)}
        kind={character.record.kind as CharacterKind}
        {...request}
      />
    );
  }
}
