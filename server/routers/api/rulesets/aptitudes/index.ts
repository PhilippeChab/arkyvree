import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/aptitudes",
    zValidator("param", idParam),
    zValidator(
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
        await AptitudesService.getRulesetAptitudes(
          id,
          { search, childOnly, scope, orderBy, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get(
    "/:id/aptitudes/:aptitudeId",
    zValidator("param", z.object({ id: z.string().uuid(), aptitudeId: z.string().uuid() })),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");
      return c.json(await AptitudesService.getRulesetAptitude(id, aptitudeId), 200);
    },
  )
  .post(
    "/:id/aptitudes",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await AptitudesService.createRulesetAptitude(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/aptitudes/:aptitudeId",
    zValidator("param", z.object({ id: z.string().uuid(), aptitudeId: z.string().uuid() })),
    zValidator(
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
      return c.json(await AptitudesService.updateRulesetAptitude(c.var.requestSession, id, aptitudeId, body), 200);
    },
  )
  .delete(
    "/:id/aptitudes/:aptitudeId",
    zValidator("param", z.object({ id: z.string().uuid(), aptitudeId: z.string().uuid() })),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");
      return c.json(await AptitudesService.deleteRulesetAptitude(c.var.requestSession, id, aptitudeId), 200);
    },
  );
