import type { RulesetView } from "@/engine/core/types.ts";

import { type After, getRulesetModule } from "./modules.ts";

/** The ruleset's entities: what its module answers of them. */
type Entities = ReturnType<typeof getRulesetModule>["entities"];

/** The ruleset's entities. */
function entitiesOf(view: RulesetView): Entities {
  return getRulesetModule(view.ruleset.baseRules).entities;
}

/** Refuses an aptitude's rename, or its delete without a name, when the ruleset's characters count on its name. */
export function checkAptitudeEdit(view: RulesetView, ...args: After<Entities["checkAptitudeEdit"]>) {
  entitiesOf(view).checkAptitudeEdit(view, ...args);
}

/** A class with its fields, and the ids of the properties that keep them. */
export function describeClass<T extends { id: string }>(view: RulesetView, klass: T) {
  return entitiesOf(view).describeClass(view, klass);
}

/** A class's levels, each with what its feat pools hold by then. */
export function describeClassFeatPools(view: RulesetView, ...args: After<Entities["describeClassFeatPools"]>) {
  return entitiesOf(view).describeClassFeatPools(view, ...args);
}

/** A class's levels with the fields their properties keep: those given (a save's), or the view's. */
export function describeClassLevels<T extends { id: string }>(
  view: RulesetView,
  levels: T[],
  properties?: { entityId: string; type: string; value: string }[],
) {
  return entitiesOf(view).describeClassLevels(view, levels, properties);
}

/** The spell lists a class's levels give slots in, its own first. */
export function describeClassSpellLists(view: RulesetView, ...args: After<Entities["describeClassSpellLists"]>) {
  return entitiesOf(view).describeClassSpellLists(view, ...args);
}

/** A class's levels, each with its spells per day by then. */
export function describeClassSpells(view: RulesetView, ...args: After<Entities["describeClassSpells"]>) {
  return entitiesOf(view).describeClassSpells(view, ...args);
}

/** A class's levels, each with the spells it knows by then. */
export function describeClassSpellsKnown(view: RulesetView, ...args: After<Entities["describeClassSpellsKnown"]>) {
  return entitiesOf(view).describeClassSpellsKnown(view, ...args);
}

/** The skills with the fields their properties keep: those given (a save's), or the view's. */
export function describeSkills<T extends { id: string }>(
  view: RulesetView,
  skills: T[],
  properties?: { entityId: string; type: string; value: string }[],
) {
  return entitiesOf(view).describeSkills(view, skills, properties);
}

/** The property type that names a feat's family, which groups a family's variants. */
export function getFeatFamilyType(view: RulesetView) {
  return entitiesOf(view).getFeatFamilyType(view);
}

/** What saving a class's level writes beside its row. */
export function planClassLevelSave(view: RulesetView, ...args: After<Entities["planClassLevelSave"]>) {
  return entitiesOf(view).planClassLevelSave(view, ...args);
}

/** What saving an item writes beside its row: the slot its type takes. */
export function planItemSave(view: RulesetView, ...args: After<Entities["planItemSave"]>) {
  return entitiesOf(view).planItemSave(view, ...args);
}

/** What saving a power writes beside its row: its fields, and the feats of its grouping. */
export function planPowerSave(view: RulesetView, ...args: After<Entities["planPowerSave"]>) {
  return entitiesOf(view).planPowerSave(view, ...args);
}

/** What deleting a skill writes beside its row: the feats made with it. */
export function planSkillDelete(view: RulesetView, ...args: After<Entities["planSkillDelete"]>) {
  return entitiesOf(view).planSkillDelete(view, ...args);
}

/** What saving a skill writes beside its row: its fields, and the feats made with it. */
export function planSkillSave(view: RulesetView, ...args: After<Entities["planSkillSave"]>) {
  return entitiesOf(view).planSkillSave(view, ...args);
}
