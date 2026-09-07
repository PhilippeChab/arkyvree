import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { SavesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/saves",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir } = c.req.valid("query");

      const savesService = SavesService.initialize();
      const result = await savesService.call("getRulesetSaves", id, { search, childOnly, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/saves/:saveId",
    zValidator("param", z.object({ id: z.string().uuid(), saveId: z.string().uuid() })),
    async (c) => {
      const { id, saveId } = c.req.valid("param");

      const savesService = SavesService.initialize();
      const result = await savesService.call("getRulesetSave", id, saveId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/saves",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        abilityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const savesService = SavesService.initialize();
      const result = await savesService.call("createRulesetSave", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/saves/:saveId",
    zValidator("param", z.object({ id: z.string().uuid(), saveId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        abilityId: z.string().uuid(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, saveId } = c.req.valid("param");
      const body = c.req.valid("json");

      const savesService = SavesService.initialize();
      const result = await savesService.call(
        "updateRulesetSave",
        c.var.requestSession,
        id,
        saveId,
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
    "/:id/saves/:saveId",
    zValidator("param", z.object({ id: z.string().uuid(), saveId: z.string().uuid() })),
    async (c) => {
      const { id, saveId } = c.req.valid("param");

      const savesService = SavesService.initialize();
      const result = await savesService.call(
        "deleteRulesetSave",
        c.var.requestSession,
        id,
        saveId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
