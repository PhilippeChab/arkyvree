import { buildCharacter, readCharacterRows } from "@/server/builds/index.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type { RulesetModuleOf } from "@/server/rulesets/RulesetFactory.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * A level-up's planned levels, built from the character's rows: the character with them, and as saved, without them, which the engine plans the level-up from (`buildLevelUpPreview`, `distributePlannedPicks`).
 */
export async function buildPlannedLevels(
  database: Db,
  rulesetModule: RulesetModuleOf,
  characterRecord: Character,
  scope: RulesetScope,
  klassLevelEntries: ReturnType<RulesetModuleOf["levelUp"]["getPlannedKlassLevels"]>,
  existingLevelCount: number,
): Promise<Parameters<RulesetModuleOf["levelUp"]["buildLevelUpPreview"]>[0]> {
  const { projectedData, allAutoGrantedFeatRecords } = rulesetModule.levelUp.projectPlannedLevels(
    characterRecord.id,
    klassLevelEntries,
    scope.rulesetData,
  );
  const rows = await readCharacterRows(database, characterRecord);
  const character = await buildCharacter(rulesetModule, characterRecord, { projected: projectedData, rows, scope });
  const saved = await buildCharacter(rulesetModule, characterRecord, { rows, scope });
  return { autoGrantedRecords: allAutoGrantedFeatRecords, character, existingLevelCount, klassLevelEntries, saved };
}
