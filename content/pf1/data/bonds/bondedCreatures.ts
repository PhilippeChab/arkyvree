/**
 * What the bonded creatures' content is written with: a kind's races, read off their stat blocks, and the animal
 * companion's class features, which a paladin's bonded mount has too, since it functions as one.
 */

import { bonus, setNum } from "@/content/core/builders/customization/modifiers.ts";
import { gte, lt } from "@/content/core/builders/customization/requirements.ts";
import type { Partitioned } from "@/content/pf1/builders/bonds/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { QUADRUPED_FIELDS } from "@/content/pf1/builders/races/fields.ts";
import type { RaceSeed } from "@/content/pf1/builders/races/types.ts";
import { BONDED_RACE_STATS } from "@/vocabulary/pf1/bondedCreatures.ts";
import { FEAT_FAMILY, FEAT_SELECTABLE, RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/pf1/fields/index.ts";

/** An animal companion's class feature: its level, its name, and what it does. */
interface CompanionFeature {
  description: string;
  family?: string;
  level: number;
  modifiers?: FeatSeed["modifiers"];
  name: string;
}

/** A bonded creature's race as its content describes it: its summary, and whether it walks on four legs. */
export interface BondedRaceEntry {
  description: string;
  quadruped?: true;
}

/**
 * The animal companion's class features, by its effective druid level, as the Core Rulebook's table gives them; its
 * ability score increases, bonus tricks and its numbers its sheet works out (`ANIMAL_COMPANION_BASICS`).
 */
const COMPANION_FEATURES: CompanionFeature[] = [
  {
    level: 1,
    name: "Link",
    description:
      "Its master can handle it as a free action, or push it as a move action, even without ranks in Handle Animal, and gains a +4 circumstance bonus on wild empathy and Handle Animal checks made regarding it.",
  },
  {
    level: 1,
    name: "Share Spells",
    description:
      'Its master may cast a spell with a target of "You" on it (as a touch spell) instead of on herself, and may cast spells on it even if they don\'t normally affect animals.',
  },
  {
    level: 3,
    name: "Evasion",
    family: "Evasion",
    description:
      "If it makes a successful Reflex saving throw against an attack that normally deals half damage on a successful save, it takes no damage instead.",
  },
  {
    level: 6,
    name: "Devotion",
    description: "It gains a +4 morale bonus on Will saves against enchantment spells and effects.",
  },
  {
    level: 9,
    name: "Multiattack",
    description:
      "It gains Multiattack as a bonus feat if it has three or more natural attacks: its secondary attacks take a -2 penalty instead of -5. If it has fewer, it instead gains a second attack with one of its natural weapons, at a -5 penalty.",
    // Multiattack: its secondary attacks at -2; without three attacks, a second one with a natural weapon
    modifiers: [
      {
        ...setNum("combat.naturalattacks.secondarypenalty", -2),
        requirements: [gte("combat.naturalattacks.count", 3)],
      },
      {
        ...bonus("combat.naturalattacks.extraattacks", 1),
        requirements: [gte("combat.naturalattacks.count", 1), lt("combat.naturalattacks.count", 3)],
      },
    ],
  },
  {
    level: 15,
    name: "Improved Evasion",
    description:
      "When subjected to an attack that allows a Reflex saving throw for half damage, it takes no damage on a successful save and only half damage on a failed one.",
  },
];

/**
 * A kind's races (`partition`), each by its stat block's name (`BONDED_RACE_STATS`), its size and speed read off it: its
 * land speed, or the speed it has instead (a shark's swim speed).
 */
export function buildBondedRaces(partition: string, races: Record<string, BondedRaceEntry>): Partitioned<RaceSeed>[] {
  return Object.entries(races).map(([name, { description, quadruped }]) => {
    const stats = BONDED_RACE_STATS[name];
    if (!stats?.size || !stats.speeds) throw new Error(`${name} has no stat block with a size and speeds`);
    const speed = stats.speeds.land ?? Math.max(...Object.values(stats.speeds));
    return {
      name,
      description,
      fields: { [RACE_SIZE]: stats.size, [RACE_BASE_SPEED]: speed, ...(quadruped && QUADRUPED_FIELDS) },
      partition,
    };
  });
}

/** The animal companion's class features, as a kind of bonded creature (`kind`: "Animal Companion") names them. */
export function buildCompanionFeatures(kind: string, aptitude: string): FeatSeed[] {
  return COMPANION_FEATURES.map(({ description, family, modifiers, name }) => ({
    name: `${name} (${kind})`,
    description,
    fields: { [FEAT_SELECTABLE]: false, ...(family && { [FEAT_FAMILY]: [family] }) },
    aptitudes: [aptitude],
    ...(modifiers && { modifiers }),
  }));
}

/** The levels a kind's class grants the animal companion's class features at (`buildCompanionFeatures`' names). */
export function listCompanionFeatures(kind: string): [number, string][] {
  return COMPANION_FEATURES.map(({ level, name }) => [level, `${name} (${kind})`]);
}
