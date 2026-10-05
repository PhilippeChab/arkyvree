/**
 * An existing character level's saved selections.
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { resolveAptitudeModifiers } from "@/server/services/characters/levels/dnd3.5/aptitudeModifiers.ts";
import { getSavedKlassLevel } from "@/server/services/characters/levels/dnd3.5/classes.ts";
import { buildPowerLevelLookup } from "@/server/services/characters/levels/dnd3.5/distribution.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

type AptitudeModifier = { aptitudeId: string; value: number; operator: string };

/** A level's picked feats by pool, each with the pools its modifiers add slots to. */
function featSelections(levelFeats: { featId: string; aptitudeId: string }[], rulesetData: CachedRulesetData) {
  const aptitudeModByFeat =
    levelFeats.length > 0
      ? resolveAptitudeModifiers(
          levelFeats.map((f) => f.featId),
          rulesetData,
        )
      : new Map<string, AptitudeModifier[]>();

  const feats: Record<
    string,
    Array<{ id: string; name: string; description?: string; aptitudeModifiers: AptitudeModifier[] }>
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
  return feats;
}

/** A level's picked powers by pool, each with its spell level in the pool when it has one. */
function powerSelections(levelPowers: { powerId: string; aptitudeId: string }[], rulesetData: CachedRulesetData) {
  // All IDs are post-COW on both sides.
  const powerLevelMap = buildPowerLevelLookup(
    rulesetData,
    levelPowers.map((p) => p.powerId),
  );

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
  return powers;
}

/** A saved level with its picks, for editing it. */
export function ReadsLevels<B extends Constructor>(Base: B) {
  abstract class ReadingLevels extends Base {
    async getLevel(session: Session, characterId: string, characterLevelId: string) {
      const characterRecord = await getEditableCharacter(db, session, characterId);

      const characterLevel = await CharacterLevels.findOne(db, { id: characterLevelId });
      if (!characterLevel || characterLevel.characterId !== characterId) {
        throw new NotFoundError("Character level not found");
      }

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

        const { klassLevel, klass } = getSavedKlassLevel(rulesetData, refreshedCharacterLevel);

        const skills: Record<string, number> = {};
        for (const s of levelSkills) {
          skills[s.skillId] = s.rank;
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
          feats: featSelections(levelFeats, rulesetData),
          powers: powerSelections(levelPowers, rulesetData),
        };
      });
    }
  }
  return ReadingLevels;
}
