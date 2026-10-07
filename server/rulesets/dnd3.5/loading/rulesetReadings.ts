/** What the loader reads of the ruleset's view: its rows, its fields and the 3.5 meaning of its properties. */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { readClassFields } from "@/server/rulesets/dnd3.5/classes/classFields.ts";
import { readSkillFields } from "@/server/rulesets/dnd3.5/skills/skillFields.ts";
import { collectClassListIds, collectFeatListIds } from "@/server/rulesets/dnd3.5/spellcasting/spellLists.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";

import type { SharedCharacterData } from "./DetailedCharacterDataLoader.ts";

/** A character ability's score, with its ability's name. */
export function buildAbilityScore(
  record: SharedCharacterData["characterAbilityRecords"][number],
  abilityLookup: Map<string, string>,
) {
  return { abilityId: record.abilityId, name: abilityLookup.get(record.abilityId) ?? "Unknown", score: record.score };
}

/**
 * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
 * their saves, and classes and their skills (one per level), and its classes once each. languagesById is wrapped by
 * RulesetComposition — stored pre-COW language ids auto-resolve on lookup.
 */
export function readCachedRows(shared: SharedCharacterData, klassLevelIds: string[]) {
  const { rulesetData } = shared;
  const klassLevelsRaw = klassLevelIds.flatMap((id) => rulesetData.klassLevelsById.get(id) ?? []);
  const klassIds = klassLevelsRaw.map((level) => level.klassId);
  return {
    languages: shared.characterLanguages.flatMap((l) => rulesetData.languagesById.get(l.languageId) ?? []),
    klassLevelsRaw,
    klassLevelSaves: klassLevelIds.flatMap((id) => rulesetData.klassLevelSavesByKlassLevelId.get(id) ?? []),
    klasses: klassIds.flatMap((id) => rulesetData.klassesById.get(id) ?? []),
    klassSkills: klassIds.flatMap((id) => rulesetData.klassSkillsByKlassId.get(id) ?? []),
    klassEntityIds: [...new Set(klassIds)],
  };
}

/** Each class's fields: its bonus spell ability, by the ability's name, and its caster type. */
export function readKlassProperties(
  klassEntityIds: string[],
  rulesetData: RulesetData,
  abilityLookup: Map<string, string>,
) {
  const klassBonusSpellAbilityMap = new Map<string, string>();
  const klassCasterTypeMap = new Map<string, "Arcane" | "Divine">();
  for (const klassId of klassEntityIds) {
    const { bonusSpellAbilityId, casterType } = readClassFields(rulesetData.propertiesByEntity.get(klassId) ?? []);
    const abilityName = bonusSpellAbilityId ? abilityLookup.get(bonusSpellAbilityId) : undefined;
    if (abilityName) klassBonusSpellAbilityMap.set(klassId, abilityName);
    if (casterType) klassCasterTypeMap.set(klassId, casterType);
  }
  return { klassBonusSpellAbilityMap, klassCasterTypeMap };
}

/** The ruleset's own lists, as the loaded data carries them. */
export function readRulesetFields(rulesetData: RulesetData) {
  return {
    rulesetAbilities: rulesetData.abilities,
    rulesetSaves: rulesetData.saves,
    rulesetSkills: rulesetData.skills,
    rulesetFeats: rulesetData.feats,
    rulesetFeatProperties: rulesetData.propertiesByEntityType.get("feats") ?? [],
    rulesetPowers: rulesetData.powers,
    rulesetPowerProperties: rulesetData.propertiesByEntityType.get("powers") ?? [],
    rulesetAptitudes: rulesetData.aptitudes,
    rulesetKlasses: rulesetData.klasses,
    // A list with spells at a level, or one a class gives slots in before it has any
    leveledAptitudeIds: new Set([...rulesetData.leveledAptitudeIds, ...collectClassListIds(rulesetData)]),
    featListIds: collectFeatListIds(rulesetData),
  };
}

/** The D&D 3.5 reading of the cache's raw property rows: the fields of each skill that has any, and the skill-point ability. */
export function readRulesetProperties(rulesetData: RulesetData, resolveId: (id: string) => string) {
  const propertiesBySkillId = Map.groupBy(
    rulesetData.propertiesByEntityType.get("skills") ?? [],
    (row) => row.entityId,
  );
  const skillFields = new Map([...propertiesBySkillId].map(([skillId, rows]) => [skillId, readSkillFields(rows)]));

  // The skill-point-ability property is attached to whichever ruleset in the
  // source chain declares it (usually the base), so look across every
  // "rulesets"-scoped row rather than just the fork's own ID.
  const skillPointAbilityProp = (rulesetData.propertiesByEntityType.get("rulesets") ?? []).find(
    (p) => p.type === RULESET_SKILL_POINT_ABILITY_ID,
  );
  const skillPointAbilityId = skillPointAbilityProp?.value ? resolveId(skillPointAbilityProp.value) : null;
  return { skillFields, skillPointAbilityId };
}
