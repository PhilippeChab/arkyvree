import { NAMED_LIST } from "@/engine/core/entities/index.ts";
import type { KindWord, RulesDeclaration } from "@/engine/core/module/index.ts";
import { CHARACTER_FORM } from "@/engine/rulesets/dnd5/characters/form.ts";
import { BACKGROUND_LIST } from "@/engine/rulesets/dnd5/entities/backgrounds/lists.ts";
import { CLASS_LIST } from "@/engine/rulesets/dnd5/entities/classes/lists.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd5/entities/classes/progression.ts";
import { FEAT_LIST } from "@/engine/rulesets/dnd5/entities/feats/lists.ts";
import { ITEM_LIST } from "@/engine/rulesets/dnd5/entities/items/lists.ts";
import { LANGUAGE_LIST } from "@/engine/rulesets/dnd5/entities/languages/lists.ts";
import { SAVE_LIST } from "@/engine/rulesets/dnd5/entities/saves/lists.ts";
import { SKILL_LIST } from "@/engine/rulesets/dnd5/entities/skills/lists.ts";
import { SPECIES_LIST } from "@/engine/rulesets/dnd5/entities/species/lists.ts";
import { SPELL_LIST } from "@/engine/rulesets/dnd5/entities/spells/lists.ts";
import type { Dnd5Kinds } from "@/engine/rulesets/dnd5/view/rows.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5/characterKinds.ts";
import { LEVEL_WORD } from "@/vocabulary/dnd5/classes.ts";
import { ITEM_SLOT, ITEM_TYPE } from "@/vocabulary/dnd5/fields/index.ts";
import { MAX_ITEM_VARIANTS } from "@/vocabulary/dnd5/itemTemplates.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd5/spells.ts";

/** The attribution the SRD 5.2.1's license requires, in its own words, and no other. */
const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.";

/**
 * What every D&D 5th Edition ruleset shares: its entity kinds, in its page's order, and their words, its entities'
 * lists, a species or a class is a player character's, a class has 20 levels and a spell 0 to 9, its system rulesets'
 * content is the SRD 5.2.1's, under its Creative Commons license, and a new character's form.
 */
export const RULES: RulesDeclaration = {
  characterForm: CHARACTER_FORM,
  entityKinds: [{ label: "Player Character", value: PLAYER_CHARACTER_KIND }],
  expressionExample: "floor([classes.monk.level] / 2)",
  help: {
    modifiers:
      "Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc.",
    requirements:
      "Requirements are conditions that entities must meet to be usable/available. Examples include character level requirements, feat prerequisites, etc.",
    settings: "The ruleset's own rules. A fork starts from its source's and can change them.",
    templateExamples:
      "[abilities.constitution.modifier], [combat.proficiency.total], floor([classes.monk.level] / 2), max(1, [abilities.wisdom.modifier])",
  },
  kinds: [
    { icon: "face", type: "species" },
    { icon: "history", type: "backgrounds" },
    { icon: "translate", type: "languages" },
    { icon: "psychology", type: "skills" },
    { icon: "spoke", type: "feats" },
    { icon: "bolt", type: "spells", wideForm: "fixed" },
    {
      copies: { locked: [ITEM_SLOT, "madeFrom", ITEM_TYPE], most: MAX_ITEM_VARIANTS },
      icon: "construction",
      type: "items",
      wideForm: "fluid",
    },
    {
      help: "Choices a level gives (Fighting Style, Weapon Mastery…).",
      icon: "stars",
      type: "aptitudes",
    },
    { fieldHelp: true, icon: "accessibility", type: "classes" },
    { empty: "No saving throws available for this ruleset.", icon: "shield", type: "saves" },
    { icon: "fitness", type: "abilities" },
    {
      empty: "No mechanics documented for this ruleset.",
      help: "Rules the app doesn't apply (grappling, conditions…), written down for your table.",
      icon: "gavel",
      longDescription: true,
      type: "mechanics",
    },
  ],
  lists: {
    abilities: NAMED_LIST,
    aptitudes: NAMED_LIST,
    feats: FEAT_LIST,
    items: ITEM_LIST,
    classes: CLASS_LIST,
    languages: LANGUAGE_LIST,
    mechanics: NAMED_LIST,
    spells: SPELL_LIST,
    saves: SAVE_LIST,
    skills: SKILL_LIST,
    species: SPECIES_LIST,
    backgrounds: BACKGROUND_LIST,
  },
  license: { notice: SRD_ATTRIBUTION, text: "cc-by-4.0" },
  progression: PROGRESSION,
  tiers: SPELL_LEVELS.map((level) => ({ label: SPELL_LEVEL_LABELS[level], tier: level })),
  tierWord: LEVEL_WORD,
  // Every kind its word, and no other type
  words: {
    abilities: { many: "Abilities", one: "Ability" },
    aptitudes: { many: "Aptitudes", one: "Aptitude" },
    feats: { many: "Feats", one: "Feat" },
    items: { many: "Items", one: "Item" },
    "class-levels": { many: "Class Levels", one: "Class Level", position: LEVEL_WORD },
    classes: { many: "Classes", one: "Class" },
    languages: { many: "Languages", one: "Language" },
    mechanics: { many: "Mechanics", one: "Mechanic" },
    spells: { many: "Spells", one: "Spell" },
    saves: { many: "Saving Throws", one: "Saving Throw" },
    skills: { many: "Skills", one: "Skill" },
    species: { many: "Species", one: "Species" },
    backgrounds: { many: "Backgrounds", one: "Background" },
  } satisfies Record<keyof Dnd5Kinds, KindWord>,
};
