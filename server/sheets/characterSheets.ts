import type { CharacterKind } from "@/engine/rulesets/dnd3.5/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import Dnd35DetailedCharacterSheet from "./dnd3.5/DetailedCharacterSheet.tsx";

/** Each base rules' printed character sheet, which renders the character its module builds. */
const CHARACTER_SHEETS = {
  "Dungeons & Dragons: 3.5": Dnd35DetailedCharacterSheet,
} satisfies Record<BaseRules, unknown>;

/** A character built by its ruleset's module, and the sheet its base rules print it with. */
export async function buildCharacterSheet(record: CharacterRecord, kind: CharacterKind = "pc") {
  const baseRules = await RulesetFactory.findBaseRules(record.rulesetId);
  const detailedCharacter = await buildCharacter(RulesetFactory.fromBaseRules(baseRules), record, { kind });
  return { detailedCharacter, CharacterSheetComponent: CHARACTER_SHEETS[baseRules] };
}
