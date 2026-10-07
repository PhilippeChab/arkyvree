import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { Dnd35RulesetModule } from "@/engine/rulesets/dnd3.5/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Character } from "@/shared/relations.ts";

/** The aptitudes of the character as saved, before its planned levels: built from the rows its projection was. */
export async function buildBaselineAptitudes(
  rulesetModule: Dnd35RulesetModule,
  characterRecord: Character,
  rows: CharacterRows,
  scope: RulesetScope,
) {
  const baselineCharacter = await buildCharacter(rulesetModule, characterRecord, { rows, scope });
  return baselineCharacter.components.aptitudes.getAptitudes();
}
