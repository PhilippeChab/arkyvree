/**
 * A character's choices at its next level as v1 answers them: the classes it can take, and for a planned level, each
 * step's offer named, the options of each pool limited to those the character qualifies for.
 */

import type { AbilityIncrease } from "@/engine/index.ts";
import type { CharacterLevelsService, StepQuery } from "@/server/services/characters/levels/index.ts";

/** A class the character can take a level in next: that level, and whether it qualifies for it. */
interface V1ClassChoice {
  eligible: boolean;
  hitDie: number;
  id: string;
  maxLevel: number;
  name: string;
  nextLevel: number;
  /** The class's requirements, those the character doesn't meet marked, when it doesn't qualify. */
  requirements: string | null;
}

/** What the planned level offers, step by step. */
interface V1PlannedLevel {
  /** Whether the level takes one, and whether the increases sent are the level's as its save takes them (`picked`) */
  abilityIncrease: { abilities: { id: string; name: string; score: number }[]; due: boolean; picked: boolean };
  class: { id: string; level: number; name: string };
  feats: { granted: { id: string; name: string }[]; picked: { featId: string; poolId: string }[]; slots: V1Slot[] };
  skills: { points: number; skills: V1SkillChoice[] };
  spells: {
    granted: { id: string; name: string }[];
    picked: { poolId: string; spellId: string }[];
    slots: (V1Slot & { spellLevel: number | null })[];
  };
}

/**
 * A skill the planned level's points may go to: its ranks before the level, the most it may reach with the level's
 * points spent on it alone, what a point buys, and what the points sent for it (`skillPoints`) come to, as a save spreads
 * them: the points it keeps, and the ranks they buy.
 */
interface V1SkillChoice {
  classSkill: boolean;
  id: string;
  maxRanks: number;
  name: string;
  pointsSpent: number;
  ranks: number;
  ranksAdded: number;
  ranksPerPoint: number;
}

/**
 * A pool's room at the level (a class's bonus feats, General, a spell list at a spell level), the picks so far that fit
 * in it counted in (`picked`), and the options that qualify for it.
 */
interface V1Slot {
  count: number;
  options: { id: string; name: string }[];
  pool: { id: string; name: string };
}

/** The choices, as the levels' service answers them. */
type LevelChoices = Awaited<ReturnType<typeof CharacterLevelsService.getLevelChoices>>;

/** The planned level's choices, as the levels' service answers them. */
type PlannedLevel = NonNullable<LevelChoices["level"]>;

/** A character's choices at its next level, as v1 answers them. */
export interface V1LevelChoices {
  classes: V1ClassChoice[];
  level: V1PlannedLevel | null;
}

/** What a v1 request for a character's choices asks: the planned level's class, and its picks so far, by id. */
export interface V1LevelChoicesQuery {
  abilityIncreases?: AbilityIncrease[];
  classId?: string;
  feats?: { aptitudeId: string; featId: string }[];
  skillPoints?: Record<string, number>;
  spells?: { aptitudeId: string; spellId: string }[];
}

/** A named thing (a feat, a spell, a pool), by its id and name alone. */
function toNamed({ id, name }: { id: string; name: string }) {
  return { id, name };
}

/** The picks so far that fit in their pools, by pool, as the request's own pairs. */
function toPicked(fitted: Record<string, string[]>) {
  return Object.entries(fitted).flatMap(([poolId, ids]) => ids.map((id) => ({ id, poolId })));
}

/** The planned level's offer, step by step. */
function toPlannedLevel(level: PlannedLevel): V1PlannedLevel {
  const { abilities, class: klass, featSlots, feats, powerSlots, powers, skills } = level;
  return {
    abilityIncrease: {
      abilities: abilities.attributes.map(({ abilityId, name, total }) => ({ id: abilityId, name, score: total })),
      due: abilities.isAvailable,
      picked: abilities.picked,
    },
    class: klass,
    feats: {
      granted: feats.autoGrantedFeats.map(toNamed),
      picked: toPicked(feats.fitted).map(({ id, poolId }) => ({ featId: id, poolId })),
      slots: featSlots.map(({ options, pool, room }) => ({ count: room, options: options.map(toNamed), pool })),
    },
    skills: {
      points: skills.skillPointsToSpend,
      skills: skills.skills.map((skill) => ({
        classSkill: skill.classSkill,
        id: skill.id,
        maxRanks: skill.currentRank + skill.maxPoints * skill.rankStep,
        name: skill.name,
        pointsSpent: skill.points,
        ranks: skill.currentRank,
        ranksAdded: skill.ranks,
        ranksPerPoint: skill.rankStep,
      })),
    },
    spells: {
      granted: powers.autoGrantedPowers.map(toNamed),
      picked: toPicked(powers.fitted).map(({ id, poolId }) => ({ poolId, spellId: id })),
      slots: powerSlots.map(({ options, pool, powerLevel, room }) => ({
        count: room,
        options: options.map(toNamed),
        pool,
        spellLevel: powerLevel ?? null,
      })),
    },
  };
}

/** A v1 request for a character's choices, as the level-up wizard's services take it: its spells are its powers. */
export function toLevelChoicesQuery({ feats, spells, ...query }: V1LevelChoicesQuery): StepQuery {
  return {
    ...query,
    featPicks: feats,
    powerPicks: spells?.map(({ aptitudeId, spellId }) => ({ aptitudeId, powerId: spellId })),
  };
}

/** A character's choices at its next level, as v1 answers them. */
export function toV1LevelChoices({ classes, level }: LevelChoices): V1LevelChoices {
  return {
    classes: classes.map((klass) => ({
      eligible: klass.eligible,
      hitDie: klass.hd,
      id: klass.id,
      maxLevel: klass.maxLevel,
      name: klass.name,
      nextLevel: klass.nextLevel,
      requirements: klass.eligible ? null : (klass.requirementTree ?? null),
    })),
    level: level && toPlannedLevel(level),
  };
}
