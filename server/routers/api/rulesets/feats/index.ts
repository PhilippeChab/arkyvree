import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";

/** A feat's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const featBody = entityBody;

const featParams = idParam.extend({ featId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/feats",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        aptitudeId: z.string().uuid().optional(),
        family: z.string().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, aptitudeId, family, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await FeatsService.getFeats(id, { search, childOnly, aptitudeId, family, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:id/feats/grouped",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        aptitudeId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, aptitudeId } = c.req.valid("query");
      return c.json(await FeatsService.getFeatGroups(id, { search, childOnly, aptitudeId }, { limit, page }), 200);
    },
  )
  .get("/:id/feats/:featId", validate("param", featParams), async (c) => {
    const { id, featId } = c.req.valid("param");
    return c.json(await FeatsService.getFeat(id, featId), 200);
  })
  .post("/:id/feats", validate("param", idParam), validate("json", featBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await FeatsService.createFeat(c.var.requestSession, id, body), 200);
  })
  .put("/:id/feats/:featId", validate("param", featParams), validate("json", featBody), async (c) => {
    const { id, featId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await FeatsService.updateFeat(c.var.requestSession, id, featId, body), 200);
  })
  .delete("/:id/feats/:featId", validate("param", featParams), async (c) => {
    const { id, featId } = c.req.valid("param");
    return c.json(await FeatsService.deleteFeat(c.var.requestSession, id, featId), 200);
  });
