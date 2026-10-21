/**
 * A ruleset's content as v1 answers it: each kind's columns named, and the fields its ruleset declares for it under
 * `fields`, without the database's timestamps or the links the app's screens read.
 */

import { getTableColumns } from "drizzle-orm";
import type { z } from "zod";

import {
  featsInRules,
  itemsInRules,
  klassesInRules,
  klassLevelsInRules,
  powersInRules,
  racesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type {
  v1Class,
  v1ClassLevel,
  v1ClassProgression,
  v1Feat,
  v1Item,
  v1Language,
  v1Modifier,
  v1Race,
  v1Requirement,
  v1Save,
  v1Skill,
  v1Spell,
  v1TargetPath,
} from "@/server/routers/v1/schemas/content.ts";
import type { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import type { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import type { ClassProgressionService } from "@/server/services/rulesets/classes/progression/index.ts";
import type { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";
import type { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import type { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import type { ItemsService } from "@/server/services/rulesets/items/index.ts";
import type { LanguagesService } from "@/server/services/rulesets/languages/index.ts";
import type { PowersService } from "@/server/services/rulesets/powers/index.ts";
import type { RacesService } from "@/server/services/rulesets/races/index.ts";
import type { SavesService } from "@/server/services/rulesets/saves/index.ts";
import type { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import type { PathCompletion } from "@/shared/customization/target.ts";

import type { Answer } from "./answers.ts";

/** A modifier as the services describe one (an entity's, a character's own): its target's segments named. */
interface LabeledModifier {
  id: string;
  operator: string;
  target: string;
  targetLabels: Record<string, string>;
  value: string;
  valueLabel?: string | null;
  valueType: string;
}

/** A class level, as its class's levels list it or on its own. */
type ClassLevel =
  | Answer<typeof ClassLevelsService.getClassLevel>
  | Answer<typeof ClassLevelsService.getClassLevels>[number];

/** An item of a page a service answers. */
type ItemOf<F extends (...args: never[]) => Promise<{ items: unknown[] }>> = Answer<F>["items"][number];

/** Each kind's columns: what v1 gives a place of its own, or leaves out. The rest of a row is its `fields`. */
const CLASS_COLUMNS = new Set(Object.keys(getTableColumns(klassesInRules)));

const CLASS_LEVEL_COLUMNS = new Set([
  ...Object.keys(getTableColumns(klassLevelsInRules)),
  "babLabel",
  "feats",
  "modifiers",
  "requirements",
  "saves",
]);

const FEAT_COLUMNS = new Set([
  ...Object.keys(getTableColumns(featsInRules)),
  "featsAptitudesInRules",
  "modifiers",
  "requirements",
]);

const ITEM_COLUMNS = new Set([
  ...Object.keys(getTableColumns(itemsInRules)),
  "modifiers",
  "placement",
  "properties",
  "requirements",
  "templateName",
]);

const RACE_COLUMNS = new Set([...Object.keys(getTableColumns(racesInRules)), "modifiers", "requirements"]);

const SKILL_COLUMNS = new Set(Object.keys(getTableColumns(skillsInRules)));

const SPELL_COLUMNS = new Set([
  ...Object.keys(getTableColumns(powersInRules)),
  "modifiers",
  "powersAptitudesInRules",
  "requirements",
]);

/** The fields of a row: what's left of it past its kind's columns, which its ruleset declares. */
function toFields(row: object, columns: Set<string>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !columns.has(key)));
}

/** A spells-known total as a progression's save takes it: `all` for every spell of its level, none (null) for none. */
function toKnownCount(total: number | "All" | undefined) {
  if (total === undefined) return null;
  return total === "All" ? "all" : total;
}

/** A spells-a-day total as a progression's save takes it: none (null) for none. */
function toPerDayCount(total: number | "All" | undefined) {
  return typeof total === "number" ? total : null;
}

/** A target's segments, each named, in the path's order. */
function toTargetLabels(target: string | null, labels: Record<string, string>) {
  return target ? target.split(".").map((segment) => labels[segment] ?? segment) : [];
}

/** A class of a ruleset's. */
export function toV1Class(klass: Answer<typeof ClassesService.getClass>): z.infer<typeof v1Class> {
  return {
    description: klass.description,
    fields: toFields(klass, CLASS_COLUMNS),
    hitDie: klass.hd,
    id: klass.id,
    kind: klass.kind,
    name: klass.name,
    parentId: klass.parentId,
  };
}

/** A class's level: its base saves, the feats it grants and its fields. */
export function toV1ClassLevel(level: ClassLevel): z.infer<typeof v1ClassLevel> {
  return {
    feats: level.feats.map(({ aptitudeId, free, id, name }) => ({ aptitudeId, featId: id, free, name })),
    fields: toFields(level, CLASS_LEVEL_COLUMNS),
    id: level.id,
    level: level.level,
    saves: level.saves.map(({ base, saveId }) => ({ base, saveId })),
  };
}

/** A class's whole progression, as its save takes it back: its levels, its pools' picks and its spell tables. */
export function toV1ClassProgression({
  known,
  levels,
  perDay,
  progression,
}: Answer<typeof ClassProgressionService.getFullProgression>): z.infer<typeof v1ClassProgression> {
  // Every level's row as wide as the class's highest spell level
  const totals = [...known.map(({ spellsKnown }) => spellsKnown), ...perDay.map(({ spellsPerDay }) => spellsPerDay)];
  const width = Math.max(0, ...totals.flatMap((row) => Object.keys(row).map((spellLevel) => Number(spellLevel) + 1)));
  const spellLevels = Array.from({ length: width }, (_, spellLevel) => spellLevel);
  return {
    featPicks: Object.entries(progression.featPicks).map(([featId, picks]) => ({
      aptitudes: Object.entries(picks).map(([name, count]) => ({ count, name })),
      featId,
    })),
    levels: levels.map(toV1ClassLevel),
    pools: progression.pools.map(({ aptitudeId, name, picks }) => ({
      aptitudeId,
      name,
      picks: Object.entries(picks).map(([levelId, count]) => ({ count, levelId })),
    })),
    severalSpellLists: progression.severalSpellLists,
    spellList: progression.spellList ? { id: progression.spellList.id, name: progression.spellList.name } : null,
    spells: {
      known: known.map(({ id, spellsKnown }) => ({
        counts: spellLevels.map((spellLevel) => toKnownCount(spellsKnown[spellLevel])),
        levelId: id,
      })),
      perDay: perDay.map(({ id, spellsPerDay }) => ({
        counts: spellLevels.map((spellLevel) => toPerDayCount(spellsPerDay[spellLevel])),
        levelId: id,
      })),
    },
  };
}

/** A class's skills, each named. */
export function toV1ClassSkills(skills: Answer<typeof ClassSkillsService.getClassSkills>) {
  return skills.map(({ skillsInRule }) => ({ id: skillsInRule.id, name: skillsInRule.name }));
}

/** An entity that's its name and its description alone: an ability, an aptitude, a mechanic. */
export function toV1Entity({ description, id, name }: { description: string | null; id: string; name: string }) {
  return { description, id, name };
}

/** A feat of a ruleset's. */
export function toV1Feat(
  feat: Answer<typeof FeatsService.getFeat> | ItemOf<typeof FeatsService.getFeats>,
): z.infer<typeof v1Feat> {
  return {
    aptitudes: feat.featsAptitudesInRules.map(({ aptitudesInRule }) => ({
      id: aptitudesInRule.id,
      name: aptitudesInRule.name,
    })),
    description: feat.description,
    fields: toFields(feat, FEAT_COLUMNS),
    id: feat.id,
    name: feat.name,
    selectable: feat.selectable,
    stackable: feat.stackable,
  };
}

/** An item of a ruleset's. */
export function toV1Item(
  item: Answer<typeof ItemsService.getItem> | ItemOf<typeof ItemsService.getItems>,
): z.infer<typeof v1Item> {
  return {
    cost: toV1Number(item.costGp),
    description: item.description,
    fields: toFields(item, ITEM_COLUMNS),
    id: item.id,
    name: item.name,
    slot: item.slot,
    template: item.isTemplate,
    templateId: item.sourceItemId,
    type: item.type,
    weight: toV1Number(item.weight),
  };
}

/** A language of a ruleset's. */
export function toV1Language({
  description,
  id,
  name,
  type,
}: Answer<typeof LanguagesService.getLanguage>): z.infer<typeof v1Language> {
  return { description, id, name, type };
}

/** A modifier, its target's segments named. */
export function toV1Modifier(modifier: LabeledModifier): z.infer<typeof v1Modifier> {
  return {
    id: modifier.id,
    operator: modifier.operator,
    target: modifier.target,
    targetLabels: toTargetLabels(modifier.target, modifier.targetLabels),
    value: modifier.value,
    valueLabel: modifier.valueLabel ?? null,
    valueType: modifier.valueType as z.infer<typeof v1Modifier>["valueType"],
  };
}

/** Things named (a class's spell lists), each by its id and its name. */
export function toV1Names(named: { id: string; name: string }[]) {
  return named.map(({ id, name }) => ({ id, name }));
}

/** A decimal column (an item's cost, its weight) as a number: none when it's empty. */
export function toV1Number(value: string | null) {
  return value === null ? null : Number(value);
}

/** A race of a ruleset's. */
export function toV1Race(
  race: Answer<typeof RacesService.getRace> | ItemOf<typeof RacesService.getRaces>,
): z.infer<typeof v1Race> {
  return {
    description: race.description,
    fields: toFields(race, RACE_COLUMNS),
    id: race.id,
    kind: race.kind,
    name: race.name,
    parentId: race.parentId,
    size: race.size,
    speed: race.baseSpeed,
  };
}

/** A requirement of an entity's tree, its target's segments named. */
export function toV1Requirement(
  requirement: Answer<typeof RequirementsService.getRequirements>[number],
): z.infer<typeof v1Requirement> {
  return {
    chainingOperator: requirement.chainingOperator as z.infer<typeof v1Requirement>["chainingOperator"],
    group: requirement.level,
    id: requirement.id,
    operator: requirement.operator,
    target: requirement.target,
    targetLabels: toTargetLabels(requirement.target, requirement.targetLabels),
    value: requirement.value,
    valueLabel: requirement.valueLabel ?? null,
    valueType: requirement.valueType as z.infer<typeof v1Requirement>["valueType"],
  };
}

/** A saving throw of a ruleset's. */
export function toV1Save({
  abilityId,
  description,
  id,
  name,
}: Answer<typeof SavesService.getSave>): z.infer<typeof v1Save> {
  return { abilityId, description, id, name };
}

/** A skill of a ruleset's. */
export function toV1Skill(
  skill: Answer<typeof SkillsService.getSkill> | ItemOf<typeof SkillsService.getSkills>,
): z.infer<typeof v1Skill> {
  return {
    abilityId: skill.primaryAbilityId,
    description: skill.description,
    fields: toFields(skill, SKILL_COLUMNS),
    id: skill.id,
    name: skill.name,
  };
}

/** A spell of a ruleset's. */
export function toV1Spell(
  spell: Answer<typeof PowersService.getPower> | ItemOf<typeof PowersService.getPowers>,
): z.infer<typeof v1Spell> {
  return {
    aptitudes: spell.powersAptitudesInRules.map(({ aptitudesInRule, level }) => ({
      id: aptitudesInRule.id,
      level,
      name: aptitudesInRule.name,
    })),
    description: spell.description,
    fields: toFields(spell, SPELL_COLUMNS),
    id: spell.id,
    name: spell.name,
    saveEffect: spell.saveEffect,
    saveId: spell.saveId,
  };
}

/** A target path, or a segment of one, that completes the path given. */
export function toV1TargetPath(completion: PathCompletion): z.infer<typeof v1TargetPath> {
  return {
    description: completion.documentation,
    detail: completion.detail,
    insertText: completion.insertText,
    kind: completion.kind,
    label: completion.label,
    operators: completion.operators ?? [],
    path: completion.path ?? null,
    setValues: completion.setValues ?? [],
    values: completion.possibleValues ?? [],
    valueType: completion.valueType ?? null,
  };
}
