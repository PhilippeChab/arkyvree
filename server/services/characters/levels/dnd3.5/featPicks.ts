/**
 * Feats a level-up can pick: those available for an aptitude pool, flat or grouped by feat family.
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Feats } from "@/server/repositories/index.ts";
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/types.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Character, Ruleset, Session } from "@/shared/relations.ts";

import { getKlassLevel } from "./classes.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedFeatsFromPicks,
  buildProjectedGivenFeats,
  type FeatPick,
  getLevelIdsFromOnward,
  loadFeatCustomizations,
} from "./projection.ts";
import { annotateRequirements } from "./validation.ts";

/** Resolves aptitude-targeting modifiers (aptitudes.<slug>.allowed) for feats, grouped by feat ID. */
export function resolveAptitudeModifiers(featIds: string[], rulesetData: CachedRulesetData) {
  const result = new Map<string, { aptitudeId: string; value: number; operator: string }[]>();
  if (featIds.length === 0) return result;

  for (const featId of featIds) {
    const mods = rulesetData.modifiersBySource.get(featId);
    if (!mods) continue;
    for (const mod of mods) {
      if (mod.sourceType !== "feats") continue;
      const match = mod.target.match(/^aptitudes\.([a-z0-9]+)\.allowed$/);
      if (!match) continue;
      const resolvedAptitudeId = rulesetData.aptitudeIdBySlug.get(match[1]);
      if (!resolvedAptitudeId) continue;

      let group = result.get(mod.sourceId);
      if (!group) {
        group = [];
        result.set(mod.sourceId, group);
      }
      group.push({ aptitudeId: resolvedAptitudeId, value: Number(mod.value), operator: mod.operator });
    }
  }

  return result;
}

/** Computes non-stackable feat IDs to exclude from browsing (existing, auto-granted, selected, virtual). */
async function getExcludeNonStackableFeatIds(
  database: typeof db,
  allCharacterLevels: { id: string; klassLevelId: string }[],
  excludeIdSet: Set<string>,
  autoGrantedRecords: Array<{ featsInRule: { id: string; stackable: boolean } }>,
  selectedNonStackableFeatIds: string[],
  detailedCharacter: DetailedCharacterInterface,
) {
  const characterLevels =
    excludeIdSet.size > 0 ? allCharacterLevels.filter((l) => !excludeIdSet.has(l.id)) : allCharacterLevels;
  const characterLevelIds = characterLevels.map((lvl) => lvl.id);
  const pickedFeats = await Feats.findPicks(database, { characterLevelIds });
  const givenFeats = await Feats.findGrants(database, { levels: characterLevels });
  const excludeFeatIds = [...pickedFeats, ...givenFeats].filter((feat) => !feat.stackable).map((feat) => feat.id);

  for (const rec of autoGrantedRecords) {
    if (!rec.featsInRule.stackable) {
      excludeFeatIds.push(rec.featsInRule.id);
    }
  }

  excludeFeatIds.push(...selectedNonStackableFeatIds);

  const virtualFeatIds = detailedCharacter.getVirtuallyPossessedFeatIds();
  if (virtualFeatIds.length > 0) {
    const virtualFeats = await Feats.findMany(database, { ids: virtualFeatIds });
    for (const feat of virtualFeats) {
      if (!feat.stackable) {
        excludeFeatIds.push(feat.id);
      }
    }
  }

  return excludeFeatIds;
}

/**
 * The character a feat pick is made for, and the feats it can't pick again. The projection has the levels planned
 * before this one, then this class level, the feats picked so far and every feat those class levels grant: granted
 * feats count for requirements (a weapon proficiency for Weapon Focus) and aren't offered. Editing a level leaves out
 * it and the levels after it.
 */
async function projectFeatPick(
  characterRecord: Character,
  ruleset: Ruleset,
  rulesetData: CachedRulesetData,
  klassLevelId: string,
  featPicks: FeatPick[],
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  const characterId = characterRecord.id;
  const grantingKlassLevelIds = [...new Set([klassLevelId, ...(pendingLevelKlassLevelIds ?? [])])];
  const grantedRecords = grantingKlassLevelIds.flatMap(
    (id) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? [],
  );
  const grantedCustomizations = loadFeatCustomizations(
    rulesetData,
    grantedRecords.map((rec) => rec.featsInRule.id),
  );

  const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
  const excludeIds = excludeCharacterLevelId ? getLevelIdsFromOnward(allCharacterLevels, excludeCharacterLevelId) : [];
  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
    : [];

  const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevelId);
  const { projectedFeats, nonStackableFeatIds } = buildProjectedFeatsFromPicks(
    featPicks,
    klassLevelId,
    projectedCharacterLevel.id,
    rulesetData,
  );
  const projectedData: Dnd35ProjectedCharacterData = {
    ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
    characterLevels: [...pendingLevels, projectedCharacterLevel],
    ...(projectedFeats.length > 0 && { feats: projectedFeats }),
    givenFeats: buildProjectedGivenFeats(grantedRecords, projectedCharacterLevel.id, grantedCustomizations),
  };

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(undefined, projectedData);

  const excludeFeatIds = await getExcludeNonStackableFeatIds(
    db,
    allCharacterLevels,
    new Set(excludeIds),
    grantedRecords,
    nonStackableFeatIds,
    detailedCharacter,
  );
  return { detailedCharacter, excludeFeatIds };
}

/**
 * Runs a feat picker's query in the character's ruleset. `run` gets the character projected with the level's picks so
 * far (for each feat's eligibility) and the filters every picker shares: the pool's feats in the ruleset, but those the
 * character can't take again and the sibling losers.
 */
async function withFeatPicker<R>(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  picks: { selectedFeatPicks?: FeatPick[]; pendingLevelFeatPicks?: FeatPick[] },
  excludeCharacterLevelId: string | undefined,
  pendingLevelKlassLevelIds: string[] | undefined,
  pendingLevelAbilityIds: (string | undefined)[] | undefined,
  run: (
    detailedCharacter: DetailedCharacterInterface,
    rulesetData: CachedRulesetData,
    filters: {
      rulesetId: string;
      ancestorRulesetIds: string[];
      aptitudeId: string;
      excludeFeatIds: string[];
      siblingLoserIds: Set<string>;
    },
  ) => Promise<R>,
): Promise<R> {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const klassLevel = getKlassLevel(rulesetData, klassId, level);

    const { detailedCharacter, excludeFeatIds } = await projectFeatPick(
      characterRecord,
      ruleset,
      rulesetData,
      klassLevel.id,
      [...(picks.pendingLevelFeatPicks ?? []), ...(picks.selectedFeatPicks ?? [])],
      excludeCharacterLevelId,
      pendingLevelKlassLevelIds,
      pendingLevelAbilityIds,
    );
    return await run(detailedCharacter, rulesetData, {
      rulesetId: characterRecord.rulesetId,
      ancestorRulesetIds: rulesetData.cow.sourceChain,
      aptitudeId,
      excludeFeatIds,
      siblingLoserIds: rulesetData.cow.siblingIds,
    });
  });
}

export async function getAvailableFeats(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { search?: string; family?: string; selectedFeatPicks?: FeatPick[]; pendingLevelFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  return await withFeatPicker(
    session,
    characterId,
    aptitudeId,
    klassId,
    level,
    where,
    excludeCharacterLevelId,
    pendingLevelKlassLevelIds,
    pendingLevelAbilityIds,
    async (detailedCharacter, rulesetData, filters) => {
      const result = await Feats.findOptionPage(
        db,
        { ...filters, family: where.family, search: where.search },
        pagination,
      );

      const items = annotateRequirements(detailedCharacter, result.items, rulesetData);
      const aptitudeModByFeat = resolveAptitudeModifiers(
        items.map((f) => f.id),
        rulesetData,
      );
      const itemsWithModifiers = items.map((item) => ({
        ...item,
        aptitudeModifiers: aptitudeModByFeat.get(item.id) ?? [],
      }));

      return { items: itemsWithModifiers, page: result.page, nextPage: result.nextPage };
    },
  );
}

export async function getAvailableFeatsGrouped(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { search?: string; selectedFeatPicks?: FeatPick[]; pendingLevelFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  return await withFeatPicker(
    session,
    characterId,
    aptitudeId,
    klassId,
    level,
    where,
    excludeCharacterLevelId,
    pendingLevelKlassLevelIds,
    pendingLevelAbilityIds,
    async (detailedCharacter, rulesetData, filters) => {
      const result = await Feats.findOptionGroupPage(db, { ...filters, search: where.search }, pagination);

      // Annotate single-feat rows with eligibility + aptitude modifiers
      const singleRows = result.items.filter((r) => r.variantCount === 1);
      if (singleRows.length === 0) {
        const items = result.items.map((row) => ({
          ...row,
          eligible: true as boolean,
          aptitudeModifiers: [] as { aptitudeId: string; value: number; operator: string }[],
        }));
        return { items, page: result.page, nextPage: result.nextPage };
      }

      const singleIds = singleRows.map((r) => ({ id: r.representativeId }));
      const annotated = annotateRequirements(detailedCharacter, singleIds, rulesetData);
      const eligibilityMap = new Map(annotated.map((a) => [a.id, a.eligible]));
      const requirementTreeMap = new Map(
        annotated.filter((a) => a.requirementTree).map((a) => [a.id, a.requirementTree!]),
      );

      const aptitudeModByFeat = resolveAptitudeModifiers(
        singleRows.map((r) => r.representativeId),
        rulesetData,
      );

      const items = result.items.map((row) => {
        if (row.variantCount === 1) {
          const eligible = eligibilityMap.get(row.representativeId) ?? true;
          return {
            ...row,
            eligible,
            aptitudeModifiers: aptitudeModByFeat.get(row.representativeId) ?? [],
            ...(!eligible ? { requirementTree: requirementTreeMap.get(row.representativeId) } : {}),
          };
        }
        return {
          ...row,
          eligible: true as boolean,
          aptitudeModifiers: [] as { aptitudeId: string; value: number; operator: string }[],
        };
      });

      return { items, page: result.page, nextPage: result.nextPage };
    },
  );
}
