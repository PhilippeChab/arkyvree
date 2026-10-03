/**
 * An existing character level's saved selections.
 */

import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

import { resolveAptitudeModifiers } from "./featPicks.ts";

export async function getLevel(session: Session, characterId: string, characterLevelId: string) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  const characterLevel = await CharacterLevels.findOne(db, { id: characterLevelId });
  if (!characterLevel || characterLevel.characterId !== characterId) {
    throw new NotFoundError("Character level not found");
  }

  // oxlint-disable-next-line arkyvree/function-length -- a long function to split into steps
  return await withRulesetScope(db, characterRecord.rulesetId, async ({ rulesetData }) => {
    // Inside withRulesetScope every Character* repo read below returns rows
    // with *Id fields already remapped to post-COW, and rulesetData's id
    // Maps auto-resolve stored pre-COW keys. No manual canonicalize calls.
    const [refreshedCharacterLevel, levelSkills, levelFeats, levelPowers] = await Promise.all([
      // Re-fetch the character level inside the context so its klassLevelId /
      // abilityId come back post-COW.
      CharacterLevels.findOne(db, { id: characterLevelId }),
      CharacterLevelSkills.findMany(db, { characterLevelIds: [characterLevelId] }),
      CharacterLevelFeats.findMany(db, { characterLevelIds: [characterLevelId] }),
      CharacterLevelPowers.findMany(db, { characterLevelIds: [characterLevelId] }),
    ]);
    if (!refreshedCharacterLevel) {
      throw new NotFoundError("Character level not found");
    }

    const klassLevel = rulesetData.klassLevelsById.get(refreshedCharacterLevel.klassLevelId);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }
    const klass = rulesetData.klassesById.get(klassLevel.klassId);
    if (!klass) {
      throw new NotFoundError("Class not found");
    }

    const skills: Record<string, number> = {};
    for (const s of levelSkills) {
      skills[s.skillId] = s.rank;
    }

    const aptitudeModByFeat =
      levelFeats.length > 0
        ? resolveAptitudeModifiers(
            levelFeats.map((f) => f.featId),
            rulesetData,
          )
        : new Map<string, { aptitudeId: string; value: number; operator: string }[]>();

    const feats: Record<
      string,
      Array<{
        id: string;
        name: string;
        description?: string;
        aptitudeModifiers: { aptitudeId: string; value: number; operator: string }[];
      }>
    > = {};
    for (const f of levelFeats) {
      if (!feats[f.aptitudeId]) feats[f.aptitudeId] = [];
      const feat = rulesetData.featsById.get(f.featId);
      feats[f.aptitudeId].push({
        id: f.featId,
        name: feat?.name ?? f.featId,
        description: feat?.description ?? undefined,
        aptitudeModifiers: aptitudeModByFeat.get(f.featId) ?? [],
      });
    }

    // Power→aptitude level links: read straight off the composed cache's inline
    // powersAptitudesInRules join rows. All IDs are post-COW on both sides.
    const powerLevelMap = new Map<string, number | null>();
    for (const p of levelPowers) {
      const power = rulesetData.powersById.get(p.powerId);
      if (!power) continue;
      for (const pa of power.powersAptitudesInRules) {
        powerLevelMap.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
      }
    }

    const powers: Record<string, Array<{ id: string; name: string; description?: string; powerLevel?: number }>> = {};
    for (const p of levelPowers) {
      if (!powers[p.aptitudeId]) powers[p.aptitudeId] = [];
      const level = powerLevelMap.get(`${p.powerId}:${p.aptitudeId}`);
      const power = rulesetData.powersById.get(p.powerId);
      powers[p.aptitudeId].push({
        id: p.powerId,
        name: power?.name ?? p.powerId,
        description: power?.description ?? undefined,
        ...(level != null && { powerLevel: level }),
      });
    }

    return {
      characterLevelId: refreshedCharacterLevel.id,
      klassId: klass.id,
      klassName: klass.name,
      level: klassLevel.level,
      hd: klass.hd,
      hp: refreshedCharacterLevel.hp,
      abilityId: refreshedCharacterLevel.abilityId,
      skills,
      feats,
      powers,
    };
  });
}
