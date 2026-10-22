import { LANGUAGE_COLUMNS, LANGUAGE_LIST, NAMED_LIST, SAVE_COLUMNS, SAVE_LIST } from "@/engine/core/entities/index.ts";
import type { RulesDescription } from "@/engine/core/module/index.ts";
import { CLASS_COLUMNS, CLASS_LEVEL_COLUMNS, CLASS_LIST } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd3.5/entities/classes/progression.ts";
import { FEAT_COLUMNS } from "@/engine/rulesets/dnd3.5/entities/feats/columns.ts";
import { ITEM_COLUMNS, ITEM_LIST } from "@/engine/rulesets/dnd3.5/entities/items/columns.ts";
import { POWER_COLUMNS, POWER_LIST } from "@/engine/rulesets/dnd3.5/entities/powers/columns.ts";
import { RACE_COLUMNS, RACE_LIST } from "@/engine/rulesets/dnd3.5/entities/races/columns.ts";
import { SKILL_COLUMNS, SKILL_LIST } from "@/engine/rulesets/dnd3.5/entities/skills/columns.ts";
import { LEVEL_WIZARD } from "@/engine/rulesets/dnd3.5/levelUp/wizard.ts";
import { MAX_ABILITY_SCORE, MIN_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { BONDED_KINDS } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { MAX_ITEM_VARIANTS } from "@/vocabulary/dnd3.5/itemTemplates.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/**
 * What every 3.5 ruleset shares: its entity kinds, in its page's order, and their words (its powers are spells), its
 * entities' columns (a class's hit die, an item's slot…), a race or a class is for a player character or a creature
 * bonded to one, a class has 20 levels and a spell 0 to 9, and its system rulesets' SRD content is Open Game Content.
 */
export const RULES: RulesDescription = {
  abilityScores: { max: MAX_ABILITY_SCORE, min: MIN_ABILITY_SCORE },
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
  kinds: [
    { icon: "face", opens: "customization", partitioned: true, type: "races" },
    { icon: "translate", opens: "page", type: "languages" },
    { icon: "psychology", opens: "page", type: "skills" },
    { icon: "spoke", opens: "customization", type: "feats" },
    { icon: "bolt", opens: "customization", type: "powers" },
    { icon: "construction", opens: "customization", type: "items" },
    {
      help: "Pools of choosable options at certain class levels (e.g., Fighter Bonus Feats, Rogue Special Abilities).",
      icon: "stars",
      opens: "page",
      type: "aptitudes",
    },
    { fieldHelp: true, icon: "accessibility", opens: "progression", partitioned: true, type: "klasses" },
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
  lastClassLevel: MAX_CLASS_LEVEL,
  levelUp: LEVEL_WIZARD,
  lists: {
    abilities: NAMED_LIST,
    aptitudes: NAMED_LIST,
    items: ITEM_LIST,
    klasses: CLASS_LIST,
    languages: LANGUAGE_LIST,
    mechanics: NAMED_LIST,
    powers: POWER_LIST,
    races: RACE_LIST,
    saves: SAVE_LIST,
    skills: SKILL_LIST,
  },
  maxItemVariants: MAX_ITEM_VARIANTS,
  license: {
    notice:
      "This notice applies to the SRD-derived Open Game Content in this system source package. It does not license the application code or designate independent user-created content as Open Game Content.",
    text: "ogl",
  },
  powerLevels: SPELL_LEVELS.map((level) => ({ label: SPELL_LEVEL_LABELS[level], level })),
  progression: PROGRESSION,
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
