import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";

const aptitudeParams = idParam.extend({ aptitudeId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/aptitudes",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        scope: z.enum(["feats", "spells"]).optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, scope, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await AptitudesService.getAptitudes(id, { search, childOnly, scope, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/aptitudes/:aptitudeId", validate("param", aptitudeParams), async (c) => {
    const { id, aptitudeId } = c.req.valid("param");
    return c.json(await AptitudesService.getAptitude(id, aptitudeId), 200);
  })
  .post(
    "/:id/aptitudes",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await AptitudesService.createAptitude(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/aptitudes/:aptitudeId",
    validate("param", aptitudeParams),
    validate(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await AptitudesService.updateAptitude(c.var.requestSession, id, aptitudeId, body), 200);
    },
  )
  .delete("/:id/aptitudes/:aptitudeId", validate("param", aptitudeParams), async (c) => {
    const { id, aptitudeId } = c.req.valid("param");
    return c.json(await AptitudesService.deleteAptitude(c.var.requestSession, id, aptitudeId), 200);
  });
