/**
 * D&D 3.5 Monster Manual base stats for bonded creatures (familiars, animal
 * companions, mounts), keyed by race name. These describe what the animal IS
 * before progression bonuses are applied at compose time.
 *
 * Familiars derive their HP/BAB/saves from the master; for them the
 * combat-relevant fields are `naturalAttacks`, `baseFeats`, and
 * `baseSkillTotals`. Animal companions use the full block: `baseHD` adds to
 * the AC's total HD on top of the basics-table bonus, `baseNaturalArmor`
 * stacks with the table NA delta, and natural attacks replace the generic
 * "Unarmed Strike" weapon entry.
 *
 * `abilities` is the SRD stat block's absolute ability scores. Compose
 * overrides the bonded character's base ability scores with these values
 * (replacing the default 10 placeholder); modifiers from feats/items still
 * apply on top via the `misc` channel.
 *
 * `baseSkillTotals` stores the SRD-listed total bonus for each skill (the
 * final number you see in the stat block — e.g. Cat Hide +12 → 12). Compose
 * sets `skill.misc = total - skill.ability` so the on-sheet total matches
 * SRD regardless of the engine's canonical ability-association for the skill
 * (handles cases like Cat using Dex instead of Str for Climb).
 *
 * Per-HD scaling:
 *   - Feat count at total HD N = 1 + floor((N-1)/3). Compose applies
 *     `baseFeats`, then appends `featPriority` items in order until count met.
 *   - Skill total bumps: pool = max(0, N - baseHD); compose cycles
 *     `skillPriority` in order, +1 to total each pass, until pool empty.
 *     Each skill capped at N + 3 per RAW.
 *
 * Source: SRD Monster Manual entries (cross-checked via d20srd.org).
 */

export type NaturalAttack = {
  name: string;
  damage: string;
  type: string;
  count?: number;
};

export type BondedRaceAbilities = {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};

export type BondedRaceStatBlock = {
  baseHD: number;
  baseNaturalArmor: number;
  /** SRD-listed ability scores — applied as the bonded character's base. */
  abilities: BondedRaceAbilities;
  naturalAttacks: NaturalAttack[];
  /** Feats the animal has at its base HD, per the SRD MM stat block. */
  baseFeats?: string[];
  /** Feats appended in order as total HD crosses 4, 7, 10, 13, 16, 19. */
  featPriority?: string[];
  /** SRD-listed skill totals at base HD (the post-mods bonus on the stat block). */
  baseSkillTotals?: Record<string, number>;
  /** Order to distribute extra skill total bumps as total HD grows past baseHD. */
  skillPriority?: string[];
};

// Generic feat pool used as the tail of featPriority for animals whose
// per-race list runs out. These are all valid for an animal taking feats
// via Monster Manual advancement.
const GENERIC_TAIL = ["Toughness", "Iron Will", "Lightning Reflexes", "Great Fortitude"];

export const BONDED_RACE_STATS: Record<string, BondedRaceStatBlock> = {
  // ───── Familiars (Tiny/Diminutive, fractional HD rounded up to 1)
  "Bat": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 1, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 14, charisma: 4 },
    naturalAttacks: [],
    baseFeats: ["Alertness"],
    featPriority: ["Weapon Finesse", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Hide": 14, "Listen": 8, "Move Silently": 6, "Spot": 8 },
    skillPriority: ["Listen", "Spot", "Hide", "Move Silently"],
  },
  "Cat": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 3, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 12, charisma: 7 },
    naturalAttacks: [
      { name: "Claw", damage: "1d2", type: "Slashing", count: 2 },
      { name: "Bite", damage: "1d3", type: "Slashing and piercing" },
    ],
    baseFeats: ["Stealthy", "Weapon Finesse"],
    featPriority: ["Alertness", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 10, "Climb": 6, "Hide": 12, "Jump": 10, "Listen": 3, "Move Silently": 8, "Spot": 3 },
    skillPriority: ["Hide", "Move Silently", "Spot", "Listen", "Climb", "Balance", "Jump"],
  },
  "Hawk": {
    baseHD: 1,
    baseNaturalArmor: 2,
    abilities: { strength: 6, dexterity: 17, constitution: 10, intelligence: 2, wisdom: 14, charisma: 6 },
    naturalAttacks: [{ name: "Talons", damage: "1d4", type: "Slashing" }],
    baseFeats: ["Alertness", "Weapon Finesse"],
    featPriority: ["Dodge", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 6, "Spot": 14 },
    skillPriority: ["Spot", "Listen"],
  },
  "Lizard": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 3, dexterity: 15, constitution: 10, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: "Bludgeoning and piercing" }],
    baseFeats: ["Stealthy", "Weapon Finesse"],
    featPriority: ["Alertness", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 10, "Climb": 12, "Hide": 12, "Listen": 3, "Move Silently": 4, "Spot": 3 },
    skillPriority: ["Climb", "Hide", "Balance", "Move Silently", "Listen", "Spot"],
  },
  "Owl": {
    baseHD: 1,
    baseNaturalArmor: 2,
    abilities: { strength: 4, dexterity: 17, constitution: 10, intelligence: 2, wisdom: 14, charisma: 4 },
    naturalAttacks: [{ name: "Talons", damage: "1d4", type: "Slashing" }],
    baseFeats: ["Alertness", "Weapon Finesse"],
    featPriority: ["Dodge", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 14, "Move Silently": 17, "Spot": 6 },
    skillPriority: ["Move Silently", "Listen", "Spot"],
  },
  "Rat": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 2, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: "Piercing" }],
    baseFeats: ["Stealthy", "Weapon Finesse"],
    featPriority: ["Alertness", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 10, "Climb": 12, "Hide": 16, "Move Silently": 10, "Swim": 10 },
    skillPriority: ["Hide", "Climb", "Move Silently", "Swim", "Balance"],
  },
  "Raven": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 1, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 14, charisma: 6 },
    naturalAttacks: [{ name: "Claws", damage: "1d2", type: "Slashing" }],
    baseFeats: ["Alertness", "Weapon Finesse"],
    featPriority: ["Dodge", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 5, "Spot": 7 },
    skillPriority: ["Spot", "Listen"],
  },
  "Toad": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 1, dexterity: 12, constitution: 11, intelligence: 1, wisdom: 14, charisma: 4 },
    naturalAttacks: [],
    baseFeats: [],
    featPriority: ["Alertness", ...GENERIC_TAIL],
    baseSkillTotals: { "Hide": 21, "Listen": 4, "Spot": 4 },
    skillPriority: ["Hide", "Spot", "Listen"],
  },
  "Viper": {
    baseHD: 1,
    baseNaturalArmor: 2,
    abilities: { strength: 4, dexterity: 17, constitution: 11, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1", type: "Piercing" }],
    baseFeats: ["Improved Initiative", "Weapon Finesse"],
    featPriority: ["Alertness", "Stealthy", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 11, "Climb": 11, "Hide": 15, "Listen": 6, "Spot": 6, "Swim": 5 },
    skillPriority: ["Hide", "Climb", "Balance", "Swim", "Listen", "Spot"],
  },
  "Weasel": {
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 3, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 12, charisma: 5 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: "Piercing" }],
    baseFeats: ["Agile", "Weapon Finesse"],
    featPriority: ["Stealthy", "Alertness", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 12, "Climb": 10, "Escape Artist": 4, "Hide": 11, "Move Silently": 8, "Spot": 3 },
    skillPriority: ["Hide", "Move Silently", "Climb", "Balance", "Escape Artist", "Spot"],
  },

  // ───── Animal Companions (L1 SRD list)
  "Badger": {
    baseHD: 1,
    baseNaturalArmor: 1,
    abilities: { strength: 8, dexterity: 17, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [
      { name: "Claw", damage: "1d2", type: "Slashing", count: 2 },
      { name: "Bite", damage: "1d3", type: "Piercing" },
    ],
    baseFeats: ["Agile", "Track", "Weapon Finesse"],
    featPriority: ["Alertness", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 5, "Escape Artist": 9, "Listen": 3, "Spot": 3 },
    skillPriority: ["Escape Artist", "Listen", "Spot", "Balance"],
  },
  "Camel": {
    baseHD: 3,
    baseNaturalArmor: 1,
    abilities: { strength: 18, dexterity: 16, constitution: 14, intelligence: 2, wisdom: 11, charisma: 4 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: "Bludgeoning" }],
    baseFeats: ["Alertness", "Endurance"],
    featPriority: ["Run", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 5, "Spot": 5 },
    skillPriority: ["Listen", "Spot"],
  },
  "Dire Rat": {
    baseHD: 1,
    baseNaturalArmor: 1,
    abilities: { strength: 10, dexterity: 17, constitution: 12, intelligence: 1, wisdom: 12, charisma: 4 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: "Piercing" }],
    baseFeats: ["Alertness", "Weapon Finesse"],
    featPriority: ["Stealthy", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Climb": 11, "Hide": 8, "Listen": 4, "Move Silently": 4, "Spot": 4, "Swim": 11 },
    skillPriority: ["Hide", "Move Silently", "Climb", "Swim", "Listen", "Spot"],
  },
  "Dog": {
    baseHD: 1,
    baseNaturalArmor: 1,
    abilities: { strength: 13, dexterity: 17, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: "Piercing" }],
    baseFeats: ["Alertness", "Track"],
    featPriority: ["Combat Reflexes", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Jump": 7, "Listen": 5, "Spot": 5, "Survival": 1 },
    skillPriority: ["Listen", "Spot", "Survival", "Jump"],
  },
  "Riding Dog": {
    baseHD: 2,
    baseNaturalArmor: 4,
    abilities: { strength: 15, dexterity: 15, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Bite", damage: "1d6", type: "Piercing" }],
    baseFeats: ["Alertness", "Track"],
    featPriority: ["Combat Reflexes", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Jump": 8, "Listen": 5, "Spot": 5, "Survival": 1, "Swim": 3 },
    skillPriority: ["Listen", "Spot", "Survival", "Jump", "Swim"],
  },
  "Eagle": {
    baseHD: 1,
    baseNaturalArmor: 1,
    abilities: { strength: 10, dexterity: 15, constitution: 12, intelligence: 2, wisdom: 14, charisma: 6 },
    naturalAttacks: [
      { name: "Talons", damage: "1d4", type: "Slashing", count: 2 },
      { name: "Bite", damage: "1d4", type: "Piercing" },
    ],
    baseFeats: ["Alertness", "Weapon Finesse"],
    featPriority: ["Dodge", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 4, "Spot": 16 },
    skillPriority: ["Spot", "Listen"],
  },
  "Horse, Light": {
    baseHD: 3,
    baseNaturalArmor: 3,
    abilities: { strength: 14, dexterity: 13, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Hoof", damage: "1d4", type: "Bludgeoning", count: 2 }],
    baseFeats: ["Endurance", "Run"],
    featPriority: ["Alertness", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 4, "Spot": 4 },
    skillPriority: ["Listen", "Spot"],
  },
  "Horse, Heavy": {
    baseHD: 3,
    baseNaturalArmor: 3,
    abilities: { strength: 16, dexterity: 13, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Hoof", damage: "1d6", type: "Bludgeoning", count: 2 }],
    baseFeats: ["Endurance", "Run"],
    featPriority: ["Alertness", "Power Attack", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 4, "Spot": 4 },
    skillPriority: ["Listen", "Spot"],
  },
  "Pony": {
    baseHD: 2,
    baseNaturalArmor: 2,
    abilities: { strength: 13, dexterity: 13, constitution: 12, intelligence: 2, wisdom: 11, charisma: 4 },
    naturalAttacks: [{ name: "Hoof", damage: "1d3", type: "Bludgeoning", count: 2 }],
    baseFeats: ["Endurance"],
    featPriority: ["Alertness", "Run", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 5, "Spot": 5 },
    skillPriority: ["Listen", "Spot"],
  },
  "Snake, Small Viper": {
    baseHD: 1,
    baseNaturalArmor: 3,
    abilities: { strength: 4, dexterity: 17, constitution: 11, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d2", type: "Piercing" }],
    baseFeats: ["Improved Initiative", "Weapon Finesse"],
    featPriority: ["Alertness", "Stealthy", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 11, "Climb": 11, "Hide": 11, "Listen": 7, "Spot": 7, "Swim": 6 },
    skillPriority: ["Hide", "Climb", "Balance", "Swim", "Listen", "Spot"],
  },
  "Snake, Medium Viper": {
    baseHD: 2,
    baseNaturalArmor: 3,
    abilities: { strength: 8, dexterity: 17, constitution: 11, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d4-1", type: "Piercing" }],
    baseFeats: ["Weapon Finesse"],
    featPriority: ["Alertness", "Improved Initiative", ...GENERIC_TAIL],
    baseSkillTotals: { "Balance": 11, "Climb": 11, "Hide": 12, "Listen": 5, "Spot": 5, "Swim": 7 },
    skillPriority: ["Hide", "Climb", "Balance", "Swim", "Listen", "Spot"],
  },
  "Wolf": {
    baseHD: 2,
    baseNaturalArmor: 2,
    abilities: { strength: 13, dexterity: 15, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Bite", damage: "1d6", type: "Piercing" }],
    baseFeats: ["Track", "Weapon Finesse"],
    featPriority: ["Alertness", "Improved Initiative", "Combat Reflexes", ...GENERIC_TAIL],
    baseSkillTotals: { "Hide": 2, "Listen": 3, "Move Silently": 3, "Spot": 3, "Survival": 1 },
    skillPriority: ["Listen", "Spot", "Move Silently", "Hide", "Survival"],
  },

  // ───── Paladin's Special Mount (SRD-listed defaults)
  "Heavy Warhorse": {
    baseHD: 4,
    baseNaturalArmor: 4,
    abilities: { strength: 18, dexterity: 13, constitution: 17, intelligence: 2, wisdom: 13, charisma: 6 },
    naturalAttacks: [
      { name: "Hoof", damage: "1d6", type: "Bludgeoning", count: 2 },
      { name: "Bite", damage: "1d4", type: "Bludgeoning and piercing" },
    ],
    baseFeats: ["Endurance", "Run"],
    featPriority: ["Alertness", "Power Attack", "Improved Bull Rush", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 5, "Spot": 4 },
    skillPriority: ["Listen", "Spot"],
  },
  "Warpony": {
    baseHD: 2,
    baseNaturalArmor: 2,
    abilities: { strength: 15, dexterity: 13, constitution: 14, intelligence: 2, wisdom: 11, charisma: 4 },
    naturalAttacks: [
      { name: "Hoof", damage: "1d3", type: "Bludgeoning", count: 2 },
    ],
    baseFeats: ["Endurance"],
    featPriority: ["Alertness", "Run", ...GENERIC_TAIL],
    baseSkillTotals: { "Listen": 5, "Spot": 5 },
    skillPriority: ["Listen", "Spot"],
  },
};

export function getBondedRaceStats(raceName: string | undefined | null): BondedRaceStatBlock | null {
  if (!raceName) return null;
  return BONDED_RACE_STATS[raceName] ?? null;
}
