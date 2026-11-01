import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { idParam, page, planSteps } from "@/server/routers/api/validation.ts";
import {
  v1Character,
  v1LevelPlan,
  v1LevelPlanAnswer,
  v1LevelSteps,
  v1StepOptions,
} from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

const levelParams = idParam.extend({ advancementId: z.string().uuid() });

/** A level plan, as a body sends it: each step's payload by its name, and the level it edits, when it edits one. */
const levelPlan = z.object({
  editedLevelId: z.string().uuid().optional().meta({ description: "The saved level it edits, none for new levels" }),
  steps: planSteps.meta({ description: "Each step's payload, by its name, in its mechanic's shape" }),
});

/** A plan's save: each step's payload by its name, and whether it's saved past the rules' issues. */
const levelSave = {
  force: z.boolean().default(false).meta({ description: "Saves it though the rules find issues with it" }),
  steps: planSteps.meta({ description: "Each step's payload, by its name, in its mechanic's shape" }),
};

/** A step's name, as its ruleset lists it. */
const stepParams = idParam.extend({
  step: z.string().min(1).meta({ description: "The step's name, as `GET …/levels/steps` lists it" }),
});

/**
 * A character's levels, read as the app's level wizard reads them: a level's steps, a saved level's plan, and reads
 * that take a plan (what it comes to, a step's options over it).
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/levels/steps",
    describeRoute({
      response: v1LevelSteps,
      status: 200,
      summary: "A level's steps, in their order: a plan's payloads are keyed by their names",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        editedLevelId: z
          .string()
          .uuid()
          .optional()
          .meta({ description: "A saved level, whose edit's steps (without its plan's) it lists" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { editedLevelId } = c.req.valid("query");
      const steps = await CharacterLevelsService.getPlanSteps(c.var.requestSession, id, editedLevelId);
      return c.json(V1.levelSteps(steps), 200);
    },
  )
  .get(
    "/:id/levels/:advancementId/plan",
    describeRoute({
      response: v1LevelPlan,
      status: 200,
      summary: "A saved level's plan, each step's payload as the level saved it: an edit's starting point",
    }),
    validate("param", levelParams),
    async (c) => {
      const { advancementId, id } = c.req.valid("param");
      const plan = await CharacterLevelsService.getLevelPlan(c.var.requestSession, id, advancementId);
      return c.json(V1.levelPlan(plan), 200);
    },
  )
  // Reads that take a plan, too long for a query: each answers what it comes to, and changes nothing
  .post(
    "/:id/level-plan",
    describeRoute({
      response: v1LevelPlanAnswer,
      status: 200,
      summary: "What a level plan comes to, saving nothing: the levels it adds, and each step's answer",
    }),
    validate("param", idParam),
    validate("json", z.object({ ...levelPlan.shape })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const answer = await CharacterLevelsService.getPlan(c.var.requestSession, id, body);
      return c.json(V1.levelPlanAnswer(answer), 200);
    },
  )
  .post(
    "/:id/level-plan/options/:step",
    describeRoute({
      response: v1StepOptions,
      status: 200,
      summary: "A page of a step's options over a plan, or of its groups of options, each eligible or not",
    }),
    validate("param", stepParams),
    validate(
      "query",
      z.object({
        limit: limitDefaultingTo(20).meta({ description: "How many to a page: 20 unless it says, 100 at most" }),
        page: page.meta({ description: "Which page, from 1" }),
        search: z.string().optional().meta({ description: "A part of the name" }),
      }),
    ),
    validate(
      "json",
      z.object({
        advancement: z
          .number()
          .int()
          .min(0)
          .optional()
          .meta({ description: "Which of the plan's advancements it picks for, from 0" }),
        group: z.string().optional().meta({ description: "A group whose options it opens, from a grouped page" }),
        plan: levelPlan,
        pool: z
          .string()
          .uuid()
          .optional()
          .meta({ description: "The pool it picks in, as a `pick` step's answer names it" }),
        tier: z
          .string()
          .optional()
          .meta({ description: "The pool's tier it picks in, as a `pick` step's answer names it" }),
      }),
    ),
    async (c) => {
      const { id, step } = c.req.valid("param");
      const { limit, page, search } = c.req.valid("query");
      const body = c.req.valid("json");
      const picker = { ...body, search };
      const options = await CharacterLevelsService.getStepOptions(c.var.requestSession, id, step, picker, {
        limit,
        page,
      });
      return c.json(V1.stepOptions(options), 200);
    },
  )
  .post(
    "/:id/levels",
    describeRoute({
      response: v1Character,
      status: 201,
      summary: "Saves a level plan's levels, answering the character's sheet",
    }),
    validate("param", idParam),
    validate("json", z.object(levelSave)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { force, steps } = c.req.valid("json");
      await CharacterLevelsService.addLevels(c.var.requestSession, id, { steps }, force);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 201);
    },
  )
  .put(
    "/:id/levels/:advancementId",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Saves a level's edit (its plan, without its plan step), answering the character's sheet",
    }),
    validate("param", levelParams),
    validate("json", z.object(levelSave)),
    async (c) => {
      const { advancementId, id } = c.req.valid("param");
      const { force, steps } = c.req.valid("json");
      await CharacterLevelsService.updatePlannedLevel(c.var.requestSession, id, advancementId, { steps }, force);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id/levels",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Removes a character's last level, answering its sheet",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharacterLevelsService.removeLevel(c.var.requestSession, id);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  );
