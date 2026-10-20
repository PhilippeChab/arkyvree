/**
 * A character's choices at its next level as v1 answers them: the classes it can take, and for a planned level, each
 * step's offer named, the options of each pool limited to those the character qualifies for.
 */

import { z } from "zod";

import { v1Id, v1Named } from "./references.ts";

const v1ClassChoice = z
  .strictObject({
    eligible: z.boolean().meta({ description: "Whether the character meets its requirements and has a level left" }),
    hitDie: z.number().int(),
    id: v1Id,
    maxLevel: z.number().int(),
    name: z.string(),
    nextLevel: z.number().int(),
    requirements: z
      .string()
      .nullable()
      .meta({ description: "The class's requirements, those the character doesn't meet marked `[UNMET]`" }),
  })
  .meta({
    description: "A class the character can take a level in next: that level, and whether it qualifies",
    id: "ClassChoice",
  });

const v1SkillChoice = z
  .strictObject({
    classSkill: z.boolean(),
    id: v1Id,
    maxRanks: z.number().meta({ description: "The most it may reach with the level's points spent on it alone" }),
    name: z.string(),
    pointsSpent: z.number().int().meta({ description: "The points sent for it (`skillPoints`) a save keeps" }),
    ranks: z.number().meta({ description: "Its ranks before the level" }),
    ranksAdded: z.number().meta({ description: "The ranks the points sent for it buy" }),
    ranksPerPoint: z.number(),
  })
  .meta({ description: "A skill the planned level's points may go to", id: "SkillChoice" });

const v1Slot = z
  .strictObject({
    count: z.number().int().meta({ description: "The aptitude's room at the level, the picks so far counted in it" }),
    options: z.array(v1Named).meta({ description: "The options the character qualifies for" }),
    aptitude: v1Named,
    shared: z.boolean().meta({ description: "An aptitude a feat or a spell fills: a feat slot and a spell slot both" }),
  })
  .meta({ description: "An aptitude's room at the level (a class's bonus feats, General, a spell list)", id: "Slot" });

const v1PlannedLevel = z
  .strictObject({
    abilityIncrease: z.strictObject({
      abilities: z.array(z.strictObject({ id: v1Id, name: z.string(), score: z.number().int() })),
      due: z
        .boolean()
        .meta({ description: "Whether the level takes one: increases that aren't the level's are refused" }),
    }),
    class: z.strictObject({ id: v1Id, level: z.number().int(), name: z.string() }),
    feats: z.strictObject({
      granted: z.array(v1Named),
      picked: z.array(z.strictObject({ aptitudeId: v1Id, featId: v1Id })).meta({ description: "The picks that fit" }),
      slots: z.array(v1Slot),
    }),
    skills: z.strictObject({ points: z.number().int(), skills: z.array(v1SkillChoice) }),
    spells: z.strictObject({
      granted: z.array(v1Named),
      picked: z.array(z.strictObject({ aptitudeId: v1Id, spellId: v1Id })).meta({ description: "The picks that fit" }),
      slots: z.array(v1Slot.extend({ spellLevel: z.number().int().nullable() })),
    }),
  })
  .meta({ description: "What the planned level offers, step by step", id: "PlannedLevel" });

export const v1LevelChoices = z
  .strictObject({
    classes: z.array(v1ClassChoice),
    level: v1PlannedLevel.nullable().meta({ description: "The planned level of `classId`, null without one" }),
    levelsLeft: z
      .number()
      .int()
      .nullable()
      .meta({ description: "The levels the character has left to take, whatever their classes (null: no class)" }),
  })
  .meta({ description: "A character's choices at its next level", id: "LevelChoices" });
