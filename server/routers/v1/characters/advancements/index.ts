import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { idParam, page } from "@/server/routers/api/validation.ts";
import {
  v1AdvancementPlan,
  v1AdvancementPlanAnswer,
  v1AdvancementSteps,
  v1Character,
  v1StepOptions,
} from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { planSteps } from "@/server/routers/v1/validation.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";

const advancementParams = idParam.extend({ advancementId: z.string().uuid() });

/**
 * An advancement plan, as a body sends it: each step's payload by its name, and the advancement it edits, when it edits
 * one.
 */
const advancementPlan = z.object({
  editedAdvancementId: z
    .string()
    .uuid()
    .optional()
    .meta({ description: "The saved advancement it edits, none for new advancements" }),
  steps: planSteps.meta({ description: "Each step's payload, by its name, in its mechanic's shape" }),
});

/** A plan's save: each step's payload by its name, and whether it's saved past the rules' issues. */
const advancementSave = {
  force: z.boolean().default(false).meta({ description: "Saves it though the rules find issues with it" }),
  steps: planSteps.meta({ description: "Each step's payload, by its name, in its mechanic's shape" }),
};

/** A step's name, as its ruleset lists it. */
const stepParams = idParam.extend({
  step: z.string().min(1).meta({ description: "The step's name, as `GET …/advancements/steps` lists it" }),
});

/**
 * A character's advancements, read as the app's advancement wizard reads them: an advancement's steps, a saved
 * advancement's plan, and reads that take a plan (what it comes to, a step's options over it).
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/advancements/steps",
    describeRoute({
      response: v1AdvancementSteps,
      status: 200,
      summary: "An advancement's steps, in their order: a plan's payloads are keyed by their names",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        editedAdvancementId: z
          .string()
          .uuid()
          .optional()
          .meta({ description: "A saved advancement, whose edit's steps (without its plan's) it lists" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { editedAdvancementId } = c.req.valid("query");
      const steps = await CharacterAdvancementsService.getPlanSteps(c.var.requestSession, id, editedAdvancementId);
      return c.json(V1.advancementSteps(steps), 200);
    },
  )
  .get(
    "/:id/advancements/:advancementId/plan",
    describeRoute({
      response: v1AdvancementPlan,
      status: 200,
      summary: "A saved advancement's plan, each step's payload as the advancement saved it: an edit's starting point",
    }),
    validate("param", advancementParams),
    async (c) => {
      const { advancementId, id } = c.req.valid("param");
      const plan = await CharacterAdvancementsService.getAdvancementPlan(c.var.requestSession, id, advancementId);
      return c.json(V1.advancementPlan(plan), 200);
    },
  )
  // Reads that take a plan, too long for a query: each answers what it comes to, and changes nothing
  .post(
    "/:id/advancement-plan",
    describeRoute({
      effect: "reads",
      response: v1AdvancementPlanAnswer,
      status: 200,
      summary: "What an advancement plan comes to, saving nothing: the advancements it adds, and each step's answer",
    }),
    validate("param", idParam),
    validate("json", z.object({ ...advancementPlan.shape })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const answer = await CharacterAdvancementsService.getPlan(c.var.requestSession, id, body);
      return c.json(V1.advancementPlanAnswer(answer), 200);
    },
  )
  .post(
    "/:id/advancement-plan/options/:step",
    describeRoute({
      effect: "reads",
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
        plan: advancementPlan,
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
      const options = await CharacterAdvancementsService.getStepOptions(c.var.requestSession, id, step, picker, {
        limit,
        page,
      });
      return c.json(V1.stepOptions(options), 200);
    },
  )
  .post(
    "/:id/advancements",
    describeRoute({
      response: v1Character,
      status: 201,
      summary: "Saves an advancement plan's advancements, answering the character's sheet",
    }),
    validate("param", idParam),
    validate("json", z.object(advancementSave)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { force, steps } = c.req.valid("json");
      await CharacterAdvancementsService.addAdvancements(c.var.requestSession, id, { steps }, force);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 201);
    },
  )
  .put(
    "/:id/advancements/:advancementId",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Saves an advancement's edit (its plan, without its plan step), answering the character's sheet",
    }),
    validate("param", advancementParams),
    validate("json", z.object(advancementSave)),
    async (c) => {
      const { advancementId, id } = c.req.valid("param");
      const { force, steps } = c.req.valid("json");
      await CharacterAdvancementsService.updateSavedAdvancement(
        c.var.requestSession,
        id,
        advancementId,
        { steps },
        force,
      );
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id/advancements",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "Removes a character's last advancement, answering its sheet",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await CharacterAdvancementsService.removeAdvancement(c.var.requestSession, id);
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  );
