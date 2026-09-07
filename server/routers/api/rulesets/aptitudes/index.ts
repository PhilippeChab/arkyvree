import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { AptitudesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/aptitudes",
    zValidator("param", z.object({ id: z.string().uuid() })),
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

      const aptitudesService = AptitudesService.initialize();
      const result = await aptitudesService.call("getRulesetAptitudes", id, { search, childOnly, scope, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/aptitudes/:aptitudeId",
    zValidator("param", z.object({ id: z.string().uuid(), aptitudeId: z.string().uuid() })),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");

      const aptitudesService = AptitudesService.initialize();
      const result = await aptitudesService.call("getRulesetAptitude", id, aptitudeId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/aptitudes",
    zValidator("param", z.object({ id: z.string().uuid() })),
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

      const aptitudesService = AptitudesService.initialize();
      const result = await aptitudesService.call(
        "createRulesetAptitude",
        c.var.requestSession,
        id,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
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

      const aptitudesService = AptitudesService.initialize();
      const result = await aptitudesService.call(
        "updateRulesetAptitude",
        c.var.requestSession,
        id,
        aptitudeId,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:id/aptitudes/:aptitudeId",
    zValidator("param", z.object({ id: z.string().uuid(), aptitudeId: z.string().uuid() })),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");

      const aptitudesService = AptitudesService.initialize();
      const result = await aptitudesService.call(
        "deleteRulesetAptitude",
        c.var.requestSession,
        id,
        aptitudeId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
