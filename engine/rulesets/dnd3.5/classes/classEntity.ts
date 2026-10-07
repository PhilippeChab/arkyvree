/** A class and its levels as a ruleset's entities: their fields, and what saving a level writes. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

import ClassesPaths from "./ClassesPaths.ts";
import { readClassFields } from "./classFields.ts";
import {
  CLASS_LEVEL_FIELD_PROPERTY_TYPES,
  type ClassLevelFields,
  readClassLevelFields,
  toClassLevelProperties,
} from "./classLevelFields.ts";

/**
 * A class with its fields, and the ids of the properties that keep them, which its page edits them through: the
 * ability its bonus spells use, and the spells it casts.
 */
export function describeClass<T extends { id: string }>(view: RulesetView, klass: T) {
  const properties = view.rulesetData.propertiesByEntity.get(klass.id) ?? [];
  const { bonusSpellAbilityId, casterType } = readClassFields(properties);
  const idOf = (type: string) => properties.find((property) => property.type === type)?.id ?? null;
  return {
    ...klass,
    bonusSpellAbilityId,
    bonusSpellPropertyId: idOf(KLASS_BONUS_SPELL_ABILITY_ID),
    casterTypeValue: casterType,
    casterTypePropertyId: idOf(KLASS_CASTER_TYPE),
  };
}

/** A class's levels with the fields their properties keep: those given (`properties`, a save's), or the view's. */
export function describeClassLevels<T extends { id: string }>(
  view: RulesetView,
  levels: T[],
  properties: { entityId: string; type: string; value: string }[] = levels.flatMap(
    (level) => view.rulesetData.propertiesByEntity.get(level.id) ?? [],
  ),
): (T & ClassLevelFields)[] {
  const propertiesByLevelId = Map.groupBy(properties, (property) => property.entityId);
  return levels.map((level) => ({ ...level, ...readClassLevelFields(propertiesByLevelId.get(level.id) ?? []) }));
}

/**
 * What saving a level of `klass` writes (`before`: the properties it kept, for an edit): its base attack and skill
 * points, those an edit doesn't give kept, and, made with a level past the class's first, its requirement of the
 * class's previous level (`classes.<slug>.level` above it). An edit that gives neither keeps them.
 */
export function planClassLevelSave(
  _view: RulesetView,
  klass: { name: string },
  level: Partial<ClassLevelFields> & { level?: number },
  before?: { properties: { type: string; value: string }[] },
): EntityWrites {
  const writes: EntityWrites = { columns: {}, generatedFeats: [], removedFeats: [] };
  if (!before && level.level !== undefined && level.level > 1) {
    writes.requirement = {
      level: "1",
      target: ClassesPaths.level(klass.name),
      value: (level.level - 1).toString(),
      valueType: "number",
      operator: "greater_than",
    };
  }
  if (level.bab === undefined && level.skills === undefined) return writes;
  const kept = readClassLevelFields(before?.properties ?? []);
  const fields = { bab: level.bab ?? kept.bab, skills: level.skills ?? kept.skills };
  return { ...writes, properties: { types: CLASS_LEVEL_FIELD_PROPERTY_TYPES, values: toClassLevelProperties(fields) } };
}
