import { Hono } from "hono";
import { z } from "zod";

import { ENTITY_FIELDS, RULESET_LIMITS } from "@/engine/index.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";

/** The aptitudes a power is linked to, each at its spell level. */
const aptitudeLinks = z.array(
  z.object({
    id: z.string().uuid(),
    level: z.number().int().min(0).max(RULESET_LIMITS.spellLevel).optional(),
  }),
);

/** A power's fields, its create's and its update's. */
const powerFields = {
  name: z.string().min(1),
  description: z
    .string()
    .optional()
    .transform((v) => v || null),
  saveId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => v || null),
  saveEffect: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || null),
  ...ENTITY_FIELDS.powers,
};

const powerParams = idParam.extend({ powerId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/powers",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        aptitudeId: z.string().uuid().optional(),
        level: z.coerce.number().min(0).max(RULESET_LIMITS.spellLevel).optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, aptitudeId, level, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await PowersService.getPowers(id, { search, childOnly, aptitudeId, level, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/powers/:powerId", validate("param", powerParams), async (c) => {
    const { id, powerId } = c.req.valid("param");
    return c.json(await PowersService.getPower(id, powerId), 200);
  })
  .post(
    "/:id/powers",
    validate("param", idParam),
    validate(
      "json",
      z.object({ ...powerFields, aptitudes: aptitudeLinks.min(1, "At least one aptitude must be selected") }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await PowersService.createPower(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/powers/:powerId",
    validate("param", powerParams),
    validate(
      "json",
      z.object({ ...powerFields, aptitudes: aptitudeLinks.optional(), updatedAt: z.string().optional() }),
    ),
    async (c) => {
      const { id, powerId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await PowersService.updatePower(c.var.requestSession, id, powerId, body), 200);
    },
  )
  .delete("/:id/powers/:powerId", validate("param", powerParams), async (c) => {
    const { id, powerId } = c.req.valid("param");
    return c.json(await PowersService.deletePower(c.var.requestSession, id, powerId), 200);
  });
