/**
 * A character's choices at its next level as v1 answers them: the classes it can take, and for a planned level, each
 * step's offer named, the options of each aptitude limited to those the character qualifies for.
 */

import type { z } from "zod";

import type { AbilityIncrease } from "@/engine/index.ts";
import type { v1LevelChoices } from "@/server/routers/v1/schemas/levelChoices.ts";
import type { CharacterLevelsService, StepQuery } from "@/server/services/characters/levels/index.ts";

/** The choices, as the levels' service answers them. */
type LevelChoices = Awaited<ReturnType<typeof CharacterLevelsService.getLevelChoices>>;

/** The planned level's choices, as the levels' service answers them. */
type PlannedLevel = NonNullable<LevelChoices["level"]>;

/** A character's choices at its next level, as v1 answers them. */
type V1LevelChoices = z.infer<typeof v1LevelChoices>;

/** What a v1 request for a character's choices asks: the planned level's class, and its picks so far, by id. */
export interface V1LevelChoicesQuery {
  abilityIncreases?: AbilityIncrease[];
  classId?: string;
  feats?: { aptitudeId: string; featId: string }[];
  skillPoints?: Record<string, number>;
  spells?: { aptitudeId: string; spellId: string }[];
}

/** A named thing (a feat, a spell, an aptitude), by its id and name alone. */
function toNamed({ id, name }: { id: string; name: string }) {
  return { id, name };
}

/** The picks so far that fit in their aptitudes, by aptitude, as the request's own pairs. */
function toPicked(fitted: Record<string, string[]>) {
  return Object.entries(fitted).flatMap(([aptitudeId, ids]) => ids.map((id) => ({ aptitudeId, id })));
}

/** The planned level's offer, step by step. */
function toPlannedLevel(level: PlannedLevel): NonNullable<V1LevelChoices["level"]> {
  const { abilities, class: klass, featSlots, feats, powerSlots, powers, skills } = level;
  return {
    abilityIncrease: {
      abilities: abilities.attributes.map(({ abilityId, name, total }) => ({ id: abilityId, name, score: total })),
      due: abilities.isAvailable,
    },
    class: klass,
    feats: {
      granted: feats.autoGrantedFeats.map(toNamed),
      picked: toPicked(feats.fitted).map(({ aptitudeId, id }) => ({ aptitudeId, featId: id })),
      slots: featSlots.map(({ options, pool, room, shared }) => ({
        aptitude: pool,
        count: room,
        options: options.map(toNamed),
        shared,
      })),
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
      picked: toPicked(powers.fitted).map(({ aptitudeId, id }) => ({ aptitudeId, spellId: id })),
      slots: powerSlots.map(({ options, pool, powerLevel, room, shared }) => ({
        aptitude: pool,
        count: room,
        options: options.map(toNamed),
        shared,
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
      eligible: klass.eligible && klass.levelsLeft > 0,
      hitDie: klass.hd,
      id: klass.id,
      maxLevel: klass.maxLevel,
      name: klass.name,
      nextLevel: klass.nextLevel,
      requirements: klass.eligible ? null : (klass.requirementTree ?? null),
    })),
    level: level && toPlannedLevel(level),
    levelsLeft: classes[0]?.levelsLeft ?? null,
  };
}
