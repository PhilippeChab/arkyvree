/** What the loader reads of the ruleset's view: its rows, its fields and the 3.5 meaning of its properties. */

import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";

/** What a character's load reads of its ruleset: its lists, its properties and its ability scores. */
export default class RulesetReadings {
  /** A character ability's score, with its ability's name. */
  static buildAbilityScore(record: CharacterRows["abilities"][number], abilityLookup: Map<string, string>) {
    return { abilityId: record.abilityId, name: abilityLookup.get(record.abilityId) ?? "Unknown", score: record.score };
  }

  /**
   * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
   * their saves, and classes and their skills (one per level), and its classes once each. languagesById is wrapped by
   * RulesetComposition — stored pre-COW language ids auto-resolve on lookup.
   */
  static readCachedRows(rows: CharacterRows, rulesetData: RulesetData, klassLevelIds: string[]) {
    const klassLevelsRaw = klassLevelIds.flatMap((id) => rulesetData.klassLevelsById.get(id) ?? []);
    const klassIds = klassLevelsRaw.map((level) => level.klassId);
    return {
      languages: rows.languages.flatMap((l) => rulesetData.languagesById.get(l.languageId) ?? []),
      klassLevelsRaw,
      klassLevelSaves: klassLevelIds.flatMap((id) => rulesetData.klassLevelSavesByKlassLevel.get(id) ?? []),
      klasses: klassIds.flatMap((id) => rulesetData.klassesById.get(id) ?? []),
      klassSkills: klassIds.flatMap((id) => rulesetData.klassSkillsByKlass.get(id) ?? []),
      klassEntityIds: [...new Set(klassIds)],
    };
  }

  /** Each class's fields: its bonus spell ability, by the ability's name, and its caster type. */
  static readKlassProperties(klassEntityIds: string[], rulesetData: RulesetData, abilityLookup: Map<string, string>) {
    const klassBonusSpellAbilityMap = new Map<string, string>();
    const klassCasterTypeMap = new Map<string, "Arcane" | "Divine">();
    for (const klassId of klassEntityIds) {
      const { bonusSpellAbilityId, casterType } = CLASS_FIELDS.read(rulesetData.propertiesByEntity.get(klassId) ?? []);
      const abilityName = bonusSpellAbilityId ? abilityLookup.get(bonusSpellAbilityId) : undefined;
      if (abilityName) klassBonusSpellAbilityMap.set(klassId, abilityName);
      if (casterType) klassCasterTypeMap.set(klassId, casterType);
    }
    return { klassBonusSpellAbilityMap, klassCasterTypeMap };
  }

  /** The ruleset's own lists, as the loaded data carries them. */
  static readRulesetLists(rulesetData: RulesetData) {
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
      leveledAptitudeIds: new Set([...rulesetData.leveledAptitudeIds, ...SpellLists.collectClassListIds(rulesetData)]),
      featListIds: SpellLists.collectFeatListIds(rulesetData),
    };
  }

  /** The D&D 3.5 reading of the cache's raw property rows: the fields of each skill that has any, and the skill-point ability. */
  static readRulesetProperties(rulesetData: RulesetData, resolveId: (id: string) => string) {
    const propertiesBySkillId = Map.groupBy(
      rulesetData.propertiesByEntityType.get("skills") ?? [],
      (row) => row.entityId,
    );
    const skillFields = new Map([...propertiesBySkillId].map(([skillId, rows]) => [skillId, SKILL_FIELDS.read(rows)]));

    // The skill-point ability is a field of whichever ruleset in the source chain declares it (usually the base), so read
    // every "rulesets"-scoped row rather than just the fork's own
    const { skillPointAbilityId: storedId } = RULESET_FIELDS.read(
      rulesetData.propertiesByEntityType.get("rulesets") ?? [],
    );
    const skillPointAbilityId = storedId ? resolveId(storedId) : null;
    return { skillFields, skillPointAbilityId };
  }
}
