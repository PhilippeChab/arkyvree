import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { limitDefaultingTo } from "@/server/routers/api/schemaBuilders.ts";
import { characterIdParam, page, planSteps } from "@/server/routers/api/validation.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";

const advancementParams = characterIdParam.extend({ advancementId: z.string().uuid() });

/** A plan, as a read of what it comes to and of a step's options takes it: its steps, and the advancement it edits. */
const planFields = { editedAdvancementId: z.string().uuid().optional(), steps: planSteps };

/** An advancement's save, its add's and its edit's: its plan's steps, saved past the rules' issues with `force`. */
const saveFields = { steps: planSteps, force: z.boolean().default(false) };

/** A step's name, as its ruleset lists it. */
const stepParams = characterIdParam.extend({ step: z.string().min(1) });

export default new Hono<SessionContext>()
  .get(
    "/:characterId/steps",
    validate("param", characterIdParam),
    validate("query", z.object({ editedAdvancementId: z.string().uuid().optional() })),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { editedAdvancementId } = c.req.valid("query");
      return c.json(
        await CharacterAdvancementsService.getPlanSteps(c.var.requestSession, characterId, editedAdvancementId),
        200,
      );
    },
  )
  .get("/:characterId/:advancementId/plan", validate("param", advancementParams), async (c) => {
    const { characterId, advancementId } = c.req.valid("param");
    return c.json(
      await CharacterAdvancementsService.getAdvancementPlan(c.var.requestSession, characterId, advancementId),
      200,
    );
  })
  .post(
    "/:characterId",
    validate("param", characterIdParam),
    validate(
      "json",
      // The character's last advancement as the page read it (`null`: it had none)
      z.object({ ...saveFields, lastAdvancementId: z.string().uuid().nullable() }),
    ),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const { steps, force, lastAdvancementId } = c.req.valid("json");
      return c.json(
        await CharacterAdvancementsService.addAdvancements(
          c.var.requestSession,
          characterId,
          { steps },
          force,
          lastAdvancementId,
        ),
        201,
      );
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
        plan: z.object(planFields),
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
        await CharacterAdvancementsService.getStepOptions(c.var.requestSession, characterId, step, picker, {
          limit,
          page,
        }),
        200,
      );
    },
  )
  .post(
    "/:characterId/plan",
    validate("param", characterIdParam),
    validate("json", z.object(planFields)),
    async (c) => {
      const { characterId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await CharacterAdvancementsService.getPlan(c.var.requestSession, characterId, body), 200);
    },
  )
  .put(
    "/:characterId/:advancementId",
    validate("param", advancementParams),
    validate("json", z.object(saveFields)),
    async (c) => {
      const { characterId, advancementId } = c.req.valid("param");
      const { steps, force } = c.req.valid("json");
      return c.json(
        await CharacterAdvancementsService.updateSavedAdvancement(
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
  .delete("/:characterId/:advancementId", validate("param", advancementParams), async (c) => {
    const { characterId, advancementId } = c.req.valid("param");
    return c.json(
      await CharacterAdvancementsService.removeAdvancement(c.var.requestSession, characterId, advancementId),
      200,
    );
  });
