import { NAMED_LIST } from "@/engine/core/entities/index.ts";
import type { EntityPoolsDescription, RulesDeclaration } from "@/engine/core/module/index.ts";
import { CHARACTER_FORM } from "@/engine/rulesets/dnd3.5/characters/form.ts";
import { CLASS_COLUMNS, CLASS_LEVEL_COLUMNS, CLASS_LIST } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd3.5/entities/classes/progression.ts";
import { FEAT_COLUMNS, FEAT_LIST } from "@/engine/rulesets/dnd3.5/entities/feats/columns.ts";
import { ITEM_COLUMNS, ITEM_LIST } from "@/engine/rulesets/dnd3.5/entities/items/columns.ts";
import { LANGUAGE_COLUMNS, LANGUAGE_LIST } from "@/engine/rulesets/dnd3.5/entities/languages/columns.ts";
import { POWER_COLUMNS, POWER_LIST } from "@/engine/rulesets/dnd3.5/entities/powers/columns.ts";
import { RACE_COLUMNS, RACE_LIST } from "@/engine/rulesets/dnd3.5/entities/races/columns.ts";
import { SAVE_COLUMNS, SAVE_LIST } from "@/engine/rulesets/dnd3.5/entities/saves/columns.ts";
import { SKILL_COLUMNS, SKILL_LIST } from "@/engine/rulesets/dnd3.5/entities/skills/columns.ts";
import { BONDED_KINDS } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { MAX_ITEM_VARIANTS } from "@/vocabulary/dnd3.5/itemTemplates.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/** The pools a feats' or a spells' list narrows by: its aptitudes, one at a time, by their id (`?aptitude=`). */
const APTITUDE_POOLS: Omit<EntityPoolsDescription, "scope"> = {
  key: "aptitudeId",
  param: "aptitude",
  type: "aptitudes",
};

/**
 * What every 3.5 ruleset shares: its entity kinds, in its page's order, and their words (its powers are spells), its
 * entities' columns (a class's hit die, an item's slot…), a race or a class is for a player character or a creature
 * bonded to one, a class has 20 levels and a spell 0 to 9, its system rulesets' SRD content is Open Game Content, and a
 * new character's form.
 */
export const RULES: RulesDeclaration = {
  characterForm: CHARACTER_FORM,
  columns: {
    feats: FEAT_COLUMNS,
    items: ITEM_COLUMNS,
    klass_levels: CLASS_LEVEL_COLUMNS,
    klasses: CLASS_COLUMNS,
    languages: LANGUAGE_COLUMNS,
    powers: POWER_COLUMNS,
    races: RACE_COLUMNS,
    saves: SAVE_COLUMNS,
    skills: SKILL_COLUMNS,
  },
  entityKinds: [
    { label: "Player Character", value: "pc" },
    ...BONDED_KINDS.map((kind) => ({ label: kind.label, value: kind.slug })),
  ],
  help: {
    modifiers:
      "Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc.",
    requirements:
      "Requirements are conditions that entities must meet to be usable/available. Examples include character level requirements, feat prerequisites, etc.",
    settings:
      "The ruleset's own rules, such as the ability a character's skill points come from. A fork starts from its source's and can change them.",
    templateExamples:
      "[abilities.charisma.modifier], floor([classes.ranger.level] / 2), max(0, [classes.beastmaster.level] + 3)",
  },
  kinds: [
    { icon: "face", opens: "customization", partitioned: true, type: "races" },
    { icon: "translate", opens: "page", type: "languages" },
    { icon: "psychology", opens: "page", type: "skills" },
    {
      families: true,
      icon: "spoke",
      lockedName: { flag: "generated", reason: "A generated feat keeps its name" },
      opens: "customization",
      pools: { ...APTITUDE_POOLS, scope: "feats" },
      type: "feats",
    },
    {
      icon: "bolt",
      levels: true,
      opens: "customization",
      pools: { ...APTITUDE_POOLS, scope: "spells" },
      type: "powers",
      wideForm: "fixed",
    },
    {
      copies: {
        locked: ["slot", "sourceItemId", "type"],
        most: MAX_ITEM_VARIANTS,
        source: "sourceItemId",
        template: "isTemplate",
      },
      icon: "construction",
      opens: "customization",
      type: "items",
      wideForm: "fluid",
    },
    {
      help: "Pools of choosable options at certain class levels (e.g., Fighter Bonus Feats, Rogue Special Abilities).",
      icon: "stars",
      opens: "page",
      type: "aptitudes",
    },
    {
      fieldHelp: true,
      icon: "accessibility",
      links: { key: "skillId", owner: "klassId", target: "skillsInRule", type: "skills" },
      opens: "progression",
      partitioned: true,
      type: "klasses",
    },
    { empty: "No saving throws available for this ruleset.", icon: "shield", opens: "page", type: "saves" },
    { icon: "fitness", opens: "page", readOnly: true, type: "abilities" },
    {
      empty: "No mechanics documented for this ruleset.",
      help: "Free-form rule entries for base game mechanics the app doesn't enforce (e.g., trip, disarm, grapple). Use them to document or override situational rules for your table.",
      icon: "gavel",
      longDescription: true,
      opens: "page",
      type: "mechanics",
    },
  ],
  lists: {
    abilities: NAMED_LIST,
    aptitudes: NAMED_LIST,
    feats: FEAT_LIST,
    items: ITEM_LIST,
    klasses: CLASS_LIST,
    languages: LANGUAGE_LIST,
    mechanics: NAMED_LIST,
    powers: POWER_LIST,
    races: RACE_LIST,
    saves: SAVE_LIST,
    skills: SKILL_LIST,
  },
  license: {
    notice:
      "This notice applies to the SRD-derived Open Game Content in this system source package. It does not license the application code or designate independent user-created content as Open Game Content.",
    text: "ogl",
  },
  progression: PROGRESSION,
  tiers: SPELL_LEVELS.map((level) => ({ label: SPELL_LEVEL_LABELS[level], level })),
  words: {
    abilities: { many: "Abilities", one: "Ability" },
    aptitudes: { many: "Aptitudes", one: "Aptitude" },
    feats: { many: "Feats", one: "Feat" },
    items: { many: "Items", one: "Item" },
    klass_levels: { many: "Class Levels", one: "Class Level" },
    klasses: { many: "Classes", one: "Class" },
    languages: { many: "Languages", one: "Language" },
    mechanics: { many: "Mechanics", one: "Mechanic" },
    powers: { many: "Spells", one: "Spell" },
    races: { many: "Races", one: "Race" },
    saves: { many: "Saves", one: "Save" },
    skills: { many: "Skills", one: "Skill" },
  },
};
