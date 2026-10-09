import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";

import { type After, getRulesetModule } from "./modules.ts";

/** The ruleset's entities: what its module answers of them. */
type Entities = ReturnType<typeof getRulesetModule>["entities"];

/** What a refusal calls an entity of each table. */
const ENTITY_LABELS: Record<keyof ViewEntities, string> = {
  abilities: "Ability",
  aptitudes: "Aptitude",
  feats: "Feat",
  items: "Item",
  klass_levels: "Class level",
  klasses: "Class",
  languages: "Language",
  mechanics: "Mechanic",
  powers: "Power",
  races: "Race",
  saves: "Save",
  skills: "Skill",
};

/** The ruleset's entities. */
function entitiesOf(view: RulesetView): Entities {
  return getRulesetModule(view.ruleset.baseRules).entities;
}

/** A class of the ruleset with its fields, and the ids of the properties that keep them: refused when there's none. */
export function describeClass(view: RulesetView, klassId: string) {
  return entitiesOf(view).describeClass(view, klassId);
}

/** A class's levels, each with what its feat pools hold by then. */
export function describeClassFeatPools(view: RulesetView, ...args: After<Entities["describeClassFeatPools"]>) {
  return entitiesOf(view).describeClassFeatPools(view, ...args);
}

/** A class's level with its details: refused when the class isn't the ruleset's, or the level isn't the class's. */
export function describeClassLevel(view: RulesetView, klassId: string, levelId: string) {
  return entitiesOf(view).describeClassLevel(view, klassId, levelId);
}

/** A class's levels, each with its fields, the feats it grants and its saves' base bonuses. */
export function describeClassLevels(view: RulesetView, klassId: string) {
  return entitiesOf(view).describeClassLevels(view, klassId);
}

/** A class level by its id alone, with its details, its class's name and the ruleset that holds its class. */
export function describeClassLevelWithClass(view: RulesetView, levelId: string) {
  return entitiesOf(view).describeClassLevelWithClass(view, levelId);
}

/** A class's class skills, each with its skill: refused when the class isn't the ruleset's. */
export function describeClassSkills(view: RulesetView, klassId: string) {
  return entitiesOf(view).describeClassSkills(view, klassId);
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

/** An entity of the ruleset's view with its customizations: its modifiers, properties and requirements. */
export function describeEntity<K extends keyof ViewEntities>(view: RulesetView, type: K, id: string) {
  const entity = getEntity(view, type, id);
  return { ...entity, ...view.rulesetData.customizationsOf(entity.id) };
}

/** An item of the ruleset with its modifiers, its template's properties under its own, and both's requirements. */
export function describeItem(view: RulesetView, itemId: string) {
  return entitiesOf(view).describeItem(view, itemId);
}

/** A page of the ruleset's items, each with its template's name. */
export function describeItems<T extends { sourceItemId: string | null }>(view: RulesetView, rows: T[]) {
  return entitiesOf(view).describeItems(view, rows);
}

/** A skill of the ruleset, with the fields its properties keep: refused when the view has none. */
export function describeSkill(view: RulesetView, skillId: string) {
  return entitiesOf(view).describeSkill(view, skillId);
}

/** The skills with the fields their properties keep: those given (a save's), or the view's. */
export function describeSkills<T extends { id: string }>(
  view: RulesetView,
  skills: T[],
  properties?: { entityId: string; type: string; value: string }[],
) {
  return entitiesOf(view).describeSkills(view, skills, properties);
}

/**
 * The entity of `type` an id names in the ruleset's view: its own, or one its source chain gives it (a stored id its
 * copy or winner). Refused as not found otherwise.
 */
export function getEntity<K extends keyof ViewEntities>(view: RulesetView, type: K, id: string): ViewEntities[K] {
  const entity = view.rulesetData.find(type, id);
  if (!entity) throw new RulesError("not-found", `${ENTITY_LABELS[type]} not found in this ruleset`);
  return entity;
}

/**
 * A page of the ruleset's feats, as its form asks for it: what it's read with (a pool's feats, a family's, or grouped
 * by family), and its rows described, each inherited feat with its pools as the ruleset composes them.
 */
export function openFeatList(view: RulesetView, ...args: After<Entities["openFeatList"]>) {
  return entitiesOf(view).openFeatList(view, ...args);
}

/**
 * A page of the ruleset's powers, as its form asks for it: what it's read with (a list's powers, at a level), and its
 * rows described, each inherited power with its lists as the ruleset composes them.
 */
export function openPowerList(view: RulesetView, ...args: After<Entities["openPowerList"]>) {
  return entitiesOf(view).openPowerList(view, ...args);
}

/** Deleting an aptitude: the aptitude, refused when the ruleset's characters count on it by name. */
export function planAptitudeDelete(view: RulesetView, ...args: After<Entities["planAptitudeDelete"]>) {
  return entitiesOf(view).planAptitudeDelete(view, ...args);
}

/** An aptitude's edit: the aptitude, refused when the ruleset's characters count on its name. */
export function planAptitudeEdit(view: RulesetView, ...args: After<Entities["planAptitudeEdit"]>) {
  return entitiesOf(view).planAptitudeEdit(view, ...args);
}

/** A new class's row: its hit die 8 when the form gives none. */
export function planClassCreate(view: RulesetView, ...args: After<Entities["planClassCreate"]>) {
  return entitiesOf(view).planClassCreate(view, ...args);
}

/** A new class level: its class, its row and join rows, what its save writes, and the level it answers once saved. */
export function planClassLevelCreate(view: RulesetView, ...args: After<Entities["planClassLevelCreate"]>) {
  return entitiesOf(view).planClassLevelCreate(view, ...args);
}

/** Deleting a class's level: the class and the level, refused when either isn't the ruleset's. */
export function planClassLevelDelete(view: RulesetView, ...args: After<Entities["planClassLevelDelete"]>) {
  return entitiesOf(view).planClassLevelDelete(view, ...args);
}

/** A class level's edit: its class and itself, its new join rows, what its save writes, and what it answers. */
export function planClassLevelEdit(view: RulesetView, ...args: After<Entities["planClassLevelEdit"]>) {
  return entitiesOf(view).planClassLevelEdit(view, ...args);
}

/** Assigning a skill to a class: refused when either isn't the ruleset's, or the class has the skill already. */
export function planClassSkillAdd(view: RulesetView, ...args: After<Entities["planClassSkillAdd"]>) {
  return entitiesOf(view).planClassSkillAdd(view, ...args);
}

/** Removing a skill from a class: refused when the class isn't the ruleset's, or doesn't have the skill. */
export function planClassSkillRemove(view: RulesetView, ...args: After<Entities["planClassSkillRemove"]>) {
  return entitiesOf(view).planClassSkillRemove(view, ...args);
}

/** A new feat's row and pools: refused without a pool, or with a pool a spell uses. */
export function planFeatCreate(view: RulesetView, ...args: After<Entities["planFeatCreate"]>) {
  return entitiesOf(view).planFeatCreate(view, ...args);
}

/** A feat's edit: the feat, its new row and pools; refused when a generated feat is renamed, or a spell's pool linked. */
export function planFeatEdit(view: RulesetView, ...args: After<Entities["planFeatEdit"]>) {
  return entitiesOf(view).planFeatEdit(view, ...args);
}

/** A new item's row, or a duplicate's, and whose customizations it copies: refused when a template has a source. */
export function planItemCreate(view: RulesetView, ...args: After<Entities["planItemCreate"]>) {
  return entitiesOf(view).planItemCreate(view, ...args);
}

/** Deleting an item: the item, and, a template, the item whose copies refuse its delete. */
export function planItemDelete(view: RulesetView, ...args: After<Entities["planItemDelete"]>) {
  return entitiesOf(view).planItemDelete(view, ...args);
}

/** An item's edit: the item and its new row; refused when a template is given a source. */
export function planItemEdit(view: RulesetView, ...args: After<Entities["planItemEdit"]>) {
  return entitiesOf(view).planItemEdit(view, ...args);
}

/** An item's variants: each one's row, copied from its source; refused with two of a name. */
export function planItemVariants(view: RulesetView, ...args: After<Entities["planItemVariants"]>) {
  return entitiesOf(view).planItemVariants(view, ...args);
}

/** A new power's row, pool links and what its save writes beside them: refused without a pool, or a feat's pool. */
export function planPowerCreate(view: RulesetView, ...args: After<Entities["planPowerCreate"]>) {
  return entitiesOf(view).planPowerCreate(view, ...args);
}

/** A power's edit: the power, its new row and pool links, and what its save writes; refused when a feat's pool is linked. */
export function planPowerEdit(view: RulesetView, ...args: After<Entities["planPowerEdit"]>) {
  return entitiesOf(view).planPowerEdit(view, ...args);
}

/** A new skill's row, what its save writes beside it, and the skill it answers once saved: refused under a reserved name. */
export function planSkillCreate(view: RulesetView, ...args: After<Entities["planSkillCreate"]>) {
  return entitiesOf(view).planSkillCreate(view, ...args);
}

/** A skill's delete: the skill as the view has it, and what its delete writes (its Skill Focus removed). */
export function planSkillDelete(view: RulesetView, ...args: After<Entities["planSkillDelete"]>) {
  return entitiesOf(view).planSkillDelete(view, ...args);
}

/** A skill's edit: the skill, its new row, what its save writes, and the skill it answers once saved. */
export function planSkillEdit(view: RulesetView, ...args: After<Entities["planSkillEdit"]>) {
  return entitiesOf(view).planSkillEdit(view, ...args);
}
