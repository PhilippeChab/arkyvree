import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { idList, idParam, orderDirDesc, page, planSteps } from "@/server/routers/api/validation.ts";
import {
  v1Character,
  v1CharacterPage,
  v1Inventory,
  v1LevelPlan,
  v1LevelPlanAnswer,
  v1LevelSteps,
  v1LinkRoom,
  v1Modifiers,
  v1StepOptions,
} from "@/server/routers/v1/schemas/characters.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";

const levelParams = idParam.extend({ advancementId: z.string().uuid() });

/** A level plan, as a body sends it: each step's payload by its name, and the level it edits, when it edits one. */
const levelPlan = z.object({
  editedLevelId: z.string().uuid().optional().meta({ description: "The saved level it edits, none for new levels" }),
  steps: planSteps.meta({ description: "Each step's payload, by its name, in its mechanic's shape" }),
});

/** A character's links of a role (3.5's `speaks`, the languages it speaks). */
const roleParams = idParam.extend({
  role: z.string().meta({ description: "The links' role, as the ruleset names it: `speaks`" }),
});

/** A step's name, as its ruleset lists it. */
const stepParams = idParam.extend({ step: z.string().min(1).meta({ description: "The step's name: `feats`…" }) });

/**
 * The key's user's characters: a page of them, one's sheet, the parts its edits change (its inventory, its own
 * modifiers, its links of a role), and its levels: a level's steps, a saved level's plan, a plan's answer and a step's
 * options over it.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/",
    describeRoute({ response: v1CharacterPage, status: 200, summary: "The key's user's characters, a page at a time" }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        accessRole: z
          .enum(["owner", "contributor"])
          .optional()
          .meta({ description: "Only those the user owns, or only those they contribute to" }),
        orderBy: z.enum(["name", "createdAt", "lastChangedAt"]).default("lastChangedAt"),
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the name" }),
        visibility: z
          .enum(["active", "archived", "all"])
          .default("active")
          .meta({ description: "Its active characters, its archived ones, or both" }),
      }),
    ),
    async (c) => {
      const { accessRole, limit, orderBy, orderDir, page, search, visibility } = c.req.valid("query");
      const characters = await CharactersService.getCharacters(
        c.var.requestSession,
        { accessRole, orderBy, orderDir, search, visibility },
        { limit, page },
      );
      return c.json(V1.characters(characters), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({
      response: v1Character,
      status: 200,
      summary: "A character's sheet: its sections, as the app shows them, and what the rules find wrong with it",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.character(await CharactersService.getCharacter(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/inventory",
    describeRoute({ response: v1Inventory, status: 200, summary: "A character's inventory" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.inventory(await CharacterInventoryService.getInventory(c.var.requestSession, id)), 200);
    },
  )
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
  .get(
    "/:id/links/:role",
    describeRoute({
      response: v1LinkRoom,
      status: 200,
      summary:
        "A character's links of a role (the languages it speaks): those it picked, those it has anyway, and those " +
        "it may pick",
    }),
    validate("param", roleParams),
    validate(
      "query",
      z.object({
        entityIds: idList.meta({
          description:
            "The picks being made, comma-separated, whose room it weighs: none when it's left out (the sheet's " +
            "identity section lists the character's own)",
        }),
      }),
    ),
    async (c) => {
      const { id, role } = c.req.valid("param");
      const { entityIds = [] } = c.req.valid("query");
      const room = await CharactersService.getLinkPicks(c.var.requestSession, id, role, entityIds);
      return c.json(V1.linkRoom(room), 200);
    },
  )
  .get(
    "/:id/modifiers",
    describeRoute({ response: v1Modifiers, status: 200, summary: "A character's own modifiers" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.modifiers(await CharacterModifiersService.getModifiers(c.var.requestSession, id)), 200);
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
          .meta({ description: "Which of the plan's levels it picks for, from 0" }),
        group: z.string().optional().meta({ description: "A group whose options it opens, from a grouped page" }),
        plan: levelPlan,
        pool: z.string().uuid().optional().meta({ description: "The pool it picks in (an aptitude)" }),
        tier: z.string().optional().meta({ description: "The pool's tier it picks in (a spell level)" }),
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
  );
