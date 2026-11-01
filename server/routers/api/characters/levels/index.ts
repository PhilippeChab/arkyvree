import { Hono } from "hono";
import { z } from "zod";

import type { StepPayload } from "@/engine/index.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { characterIdParam, page } from "@/server/routers/api/validation.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

const levelParams = characterIdParam.extend({ advancementId: z.string().uuid() });

/**
 * A step's payload, as its wizard sends it: a list, which the engine reads by its step's mechanic (`Payloads`: a plan's
 * tracks, a value per advancement, the options chosen at each, the points spent on rows, the entities picked in their
 * pools), refusing as invalid one in another shape.
 */
const stepPayload = z.custom<StepPayload>((value) => Array.isArray(value), "Expected a step's answer: a list");

/** A plan's steps' payloads, by step: what a level wizard answered so far. */
const planSteps = z.record(z.string().min(1), stepPayload);

/** A step's name, as its ruleset lists it. */
const stepParams = characterIdParam.extend({ step: z.string().min(1) });

export default new Hono<SessionContext>()
  .get(
    "/:characterId/steps",
    validate("param", characterIdParam),
    validate("query", z.object({ editedLevelId: z.string().uuid().optional() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { editedLevelId } = c.req.valid("query");
      return c.json(await CharacterLevelsService.getPlanSteps(c.var.requestSession, characterId, editedLevelId), 200);
    },
  )
  .get("/:characterId/:advancementId/plan", validate("param", levelParams), async (c) => {
    const { characterId, advancementId } = c.req.valid("param");
    return c.json(await CharacterLevelsService.getLevelPlan(c.var.requestSession, characterId, advancementId), 200);
  })
  .post(
    "/:characterId",
    validate("param", characterIdParam),
    validate("json", z.object({ steps: planSteps, force: z.boolean().default(false) })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { steps, force } = c.req.valid("json");
      return c.json(await CharacterLevelsService.addLevels(c.var.requestSession, characterId, { steps }, force), 201);
    },
  )
  .post(
    "/:characterId/options/:step",
    validate("param", stepParams),
    validate("query", z.object({ limit: limitDefaultingTo(20), page, search: z.string().optional() })),
    validate(
      "json",
      z.object({
        advancement: z.number().int().min(0).optional(),
        group: z.string().optional(),
        plan: z.object({ editedLevelId: z.string().uuid().optional(), steps: planSteps }),
        pool: z.string().uuid().optional(),
        tier: z.string().optional(),
      }),
    ),
    async (c) => {
      const { characterId, step } = c.req.valid("param");
      const { limit, page, search } = c.req.valid("query");
      const body = c.req.valid("json");
      const picker = { ...body, search };
      return c.json(
        await CharacterLevelsService.getStepOptions(c.var.requestSession, characterId, step, picker, { limit, page }),
        200,
      );
    },
  )
  .post(
    "/:characterId/plan",
    validate("param", characterIdParam),
    validate("json", z.object({ editedLevelId: z.string().uuid().optional(), steps: planSteps })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await CharacterLevelsService.getPlan(c.var.requestSession, characterId, body), 200);
    },
  )
  .put(
    "/:characterId/:advancementId",
    validate("param", levelParams),
    validate("json", z.object({ steps: planSteps, force: z.boolean().default(false) })),
    async (c) => {
      const { characterId, advancementId } = c.req.valid("param");
      const { steps, force } = c.req.valid("json");
      return c.json(
        await CharacterLevelsService.updatePlannedLevel(
          c.var.requestSession,
          characterId,
          advancementId,
          { steps },
          force,
        ),
        200,
      );
    },
  )
  .delete("/:characterId", validate("param", characterIdParam), async (c) => {
    const { characterId } = c.req.valid("param");
    return c.json(await CharacterLevelsService.removeLevel(c.var.requestSession, characterId), 200);
  });
