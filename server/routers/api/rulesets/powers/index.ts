import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";

/** A power's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const powerBody = entityBody;

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
        level: z.coerce.number().optional(),
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
  .post("/:id/powers", validate("param", idParam), validate("json", powerBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await PowersService.createPower(c.var.requestSession, id, body), 200);
  })
  .put("/:id/powers/:powerId", validate("param", powerParams), validate("json", powerBody), async (c) => {
    const { id, powerId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await PowersService.updatePower(c.var.requestSession, id, powerId, body), 200);
  })
  .delete("/:id/powers/:powerId", validate("param", powerParams), async (c) => {
    const { id, powerId } = c.req.valid("param");
    return c.json(await PowersService.deletePower(c.var.requestSession, id, powerId), 200);
  });
