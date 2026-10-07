/**
 * Level-up preview query.
 *
 * - getLevelUpPreview — computes merged pools, per-level skill points, and slot distributions for the level-up wizard
 */

import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { buildPlannedLevels } from "./plannedLevels.ts";

export async function getLevelUpPreview(
  session: Session,
  characterId: string,
  levels: Array<{ klassId: string; level: number }>,
  abilityIds: (string | null)[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const klassLevelEntries = rulesetModule.levelUp.getPlannedKlassLevels(
      rulesetData,
      levels.map((level, i) => ({ ...level, abilityId: abilityIds[i] ?? null })),
    );
    const existingLevels = await CharacterLevels.findMany(db, { characterId });
    const planned = await buildPlannedLevels(
      db,
      rulesetModule,
      characterRecord,
      scope,
      klassLevelEntries,
      existingLevels.length,
    );
    return rulesetModule.levelUp.buildLevelUpPreview(planned, rulesetData);
  });
}
