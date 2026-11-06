/**
 * The words the parser reads a Core Rulebook class's page by: the names its table writes a feature by, the features
 * that are no feature of their own, the pools a feature picks feats in, and the skills its class skills' sentence names
 * otherwise than the skill list.
 */

import type { BondedKind } from "@/vocabulary/pf1/bondedKinds.ts";

/**
 * What a bond's feature offers instead of its creature, which its owner picks between in a pool the feature names: the
 * option its creature is, the other option, and the other's rules, which the table applies.
 */
export interface BondChoice {
  creature: string;
  other: string;
  otherText: string;
}

/**
 * A class's feature that bonds its owner to a creature of a kind: its class, its feature, the kind, how many levels
 * below the class's the creature's master level is (a ranger's companion's is his level - 3), and what it offers
 * instead of the creature, if anything (`choice`).
 */
export interface BondFeature {
  choice?: BondChoice;
  className: string;
  feature: string;
  kind: BondedKind;
  levelsBelow: number;
}

/** A pool a class's feature picks a feat in at each of its levels, of a type of feat: its class, its feature, its aptitude. */
export interface FeatTypePool {
  aptitude: string;
  className: string;
  feature: string;
}

/**
 * A pool of feats a class's feature names, which grows with its levels: the feats it adds at each of the levels it
 * opens at.
 */
export interface TieredFeats {
  [level: number]: string[];
}

/** The picks a class's levels give in a pool no feature names: a wizard's arcane school, at his first level. */
export const APTITUDE_PICKS: { aptitude: string; className: string; levels: number[] }[] = [
  { className: "Wizard", aptitude: "Arcane School", levels: [1] },
];

/**
 * The features that bond their owner to a creature: a wizard's arcane bond and an adept's familiar, a druid's nature
 * bond and a ranger's hunter's bond (an animal companion), a paladin's divine bond (a mount). All but the adept's offer
 * something else instead (a bonded object, a domain, a bond with his allies, a bonded weapon): a pick between the two.
 */
export const BOND_FEATURES: BondFeature[] = [
  { className: "Adept", feature: "Summon Familiar", kind: "familiar", levelsBelow: 0 },
  {
    className: "Druid",
    feature: "Nature Bond",
    kind: "animalcompanion",
    levelsBelow: 0,
    choice: {
      creature: "Animal Companion",
      other: "Domain",
      otherText:
        "You bond with nature instead of an animal companion: you choose one cleric domain from Air, Animal, Earth, Fire, Plant, Water or Weather, whose granted powers you use with your druid level as your cleric level, and you get one domain spell slot of each spell level you can cast, for that domain's spells.",
    },
  },
  {
    className: "Paladin",
    feature: "Divine Bond",
    kind: "mount",
    levelsBelow: 0,
    choice: {
      creature: "Mount",
      other: "Bonded Weapon",
      otherText:
        "Your divine bond is with your weapon instead of a mount: once a day per three paladin levels past the 5th, as a standard action, you call a celestial spirit into it for 1 minute per paladin level, granting it a +1 enhancement bonus, +1 more every three levels past the 5th, which you spend on its bonus or on weapon special abilities.",
    },
  },
  {
    className: "Ranger",
    feature: "Hunter's Bond",
    kind: "animalcompanion",
    levelsBelow: 3,
    choice: {
      creature: "Animal Companion",
      other: "Companions",
      otherText:
        "Your bond is with your companions instead of an animal companion: as a move action, you grant your allies within 30 feet who can see or hear you half your favored enemy bonus against a target of one of your favored enemy types, for as many rounds as your Wisdom modifier.",
    },
  },
  {
    className: "Wizard",
    feature: "Arcane Bond",
    kind: "familiar",
    levelsBelow: 0,
    choice: {
      creature: "Familiar",
      other: "Bonded Object",
      otherText:
        "Your arcane bond is with an object instead of a familiar (an amulet, a ring, a staff, a wand or a weapon): once a day, it lets you cast any spell in your spellbook that you could cast, and casting a spell without it in hand calls for a DC 20 + spell level concentration check.",
    },
  },
];

/** The pools of a type of feat a class's bonus feats are picked in: the fighter's and the eldritch knight's combat feats. */
export const FEAT_TYPE_POOLS: FeatTypePool[] = [
  { className: "Eldritch Knight", feature: "Bonus Feat", aptitude: "Fighter Bonus Feat" },
  { className: "Fighter", feature: "Bonus Feats", aptitude: "Fighter Bonus Feat" },
  { className: "Wizard", feature: "Bonus Feats", aptitude: "Wizard Bonus Feat" },
];

/** The name a table's Special column writes a feature by, lowercased, by the feature's own: the chronicler's, the eldritch knight's. */
export const FEATURE_ALIASES: Record<string, string> = {
  "bonus combat feat": "bonus feat",
  "inspired action": "inspire action",
};

/**
 * The features each of whose levels after its first grants a feat the core rules hold: a ranger's favored enemy, a
 * specialization in one of his favored enemies.
 */
export const LATER_GRANTS: { className: string; feat: string; feature: string }[] = [
  { className: "Ranger", feature: "Favored Enemy", feat: "Favored Enemy Specialization (Ranger)" },
];

/**
 * A class's features that are none of its own, by their label: a paladin's mount's statistics, and a prestige class's
 * spells per day, which its caster level advancement gives.
 */
export const LEFT_OUT_FEATURES = ["Medium Paladins", "Small Paladins", "Spells per Day", "Spells per Day/Spells Known"];

/**
 * The ranger's combat style feats, each style's (archery, two-weapon combat) together, by the level they're open at:
 * its page links them, and names none.
 */
export const RANGER_COMBAT_STYLE_FEATS: TieredFeats = {
  2: [
    "Double Slice",
    "Far Shot",
    "Improved Shield Bash",
    "Point-Blank Shot",
    "Precise Shot",
    "Quick Draw",
    "Rapid Shot",
    "Two-Weapon Fighting",
  ],
  6: ["Improved Precise Shot", "Improved Two-Weapon Fighting", "Manyshot", "Two-Weapon Defense"],
  10: ["Greater Two-Weapon Fighting", "Pinpoint Targeting", "Shot on the Run", "Two-Weapon Rend"],
};

/** The skills a class skills' sentence names otherwise than the skill list, lowercased, by the list's name. */
export const SKILL_ALIASES: Record<string, string> = {
  "handle animals": "Handle Animal",
  "knowledge (nobility and royalty)": "Knowledge (Nobility)",
};

/**
 * The pools of a class's bonus feats that name their feats and grow with its levels: a monk's (its text lists them), a
 * ranger's combat style's (`RANGER_COMBAT_STYLE_FEATS`). Each tier is a pool of its own, named after the level it
 * opens at ("Monk Bonus Feat (6th)"), which holds the feats of the tiers before it.
 */
export const TIERED_POOLS: { aptitude: string; className: string; feats?: TieredFeats; feature: string }[] = [
  { className: "Monk", feature: "Bonus Feat", aptitude: "Monk Bonus Feat" },
  {
    className: "Ranger",
    feature: "Combat Style Feat",
    aptitude: "Ranger Combat Style",
    feats: RANGER_COMBAT_STYLE_FEATS,
  },
];
