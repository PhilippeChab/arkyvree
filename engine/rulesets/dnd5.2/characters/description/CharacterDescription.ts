import type { CharacterInput, PartialReading } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import IdentityFields from "@/engine/rulesets/dnd5.2/characters/IdentityFields.ts";
import Dnd52CharacterBuilder from "@/engine/rulesets/dnd5.2/model/Dnd52CharacterBuilder.ts";

import CharacterResponse from "./CharacterResponse.ts";
import SheetSummaries from "./SheetSummaries.ts";

/**
 * A character described from the rows the server read: its sheet, or its public part, past its row's columns, which the
 * characters part writes. Its private notes are as its rows have them: the characters part reads them as the viewer
 * does (`CharactersPart.describe`).
 */
export default class CharacterDescription {
  /**
   * A character's sheet, as the API answers it past its row's columns. The SRD 5.2.1 has no class that levels a
   * companion, so a character has no bonded creature to describe with it (`_bonded`, none).
   */
  static describeFull(view: RulesetView, character: CharacterInput, _bonded: CharacterInput[]) {
    return CharacterResponse.toResponse(CharacterResponse.buildSheet(Dnd52CharacterBuilder.build(view, character)));
  }

  /**
   * What a campaign member who only sees a character partly reads of its sheet: who it is, its species and physical
   * traits (age, gender, height, weight: its identity's block as such a reader reads it), and its summary, with no
   * classes. The characters part writes the rest of what such a reader reads, an allowlist (`PartialSheet`).
   */
  static describePartial(view: RulesetView, character: CharacterInput): PartialReading {
    const { identity } = CharacterResponse.buildSheet(Dnd52CharacterBuilder.build(view, character));
    return { identity: IdentityFields.describe(identity, true), summary: SheetSummaries.describe({}) };
  }
}
