import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { SavesService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/saves",
    zValidator("param", idParam),
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
      const result = await savesService.call(
        "getRulesetSaves",
        id,
        { search, childOnly, orderBy, orderDir },
        { limit, page },
      );
      return respond(c, result, 200);
    },
  )
  .get(
    "/:id/saves/:saveId",
    zValidator("param", z.object({ id: z.string().uuid(), saveId: z.string().uuid() })),
    async (c) => {
      const { id, saveId } = c.req.valid("param");

      const savesService = SavesService.initialize();
      const result = await savesService.call("getRulesetSave", id, saveId);
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/saves",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        abilityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const savesService = SavesService.initialize();
      const result = await savesService.call("createRulesetSave", c.var.requestSession, id, body);
      return respond(c, result, 200);
    },
  )
  .put(
    "/:id/saves/:saveId",
    zValidator("param", z.object({ id: z.string().uuid(), saveId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        abilityId: z.string().uuid(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, saveId } = c.req.valid("param");
      const body = c.req.valid("json");

      const savesService = SavesService.initialize();
      const result = await savesService.call("updateRulesetSave", c.var.requestSession, id, saveId, body);
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/saves/:saveId",
    zValidator("param", z.object({ id: z.string().uuid(), saveId: z.string().uuid() })),
    async (c) => {
      const { id, saveId } = c.req.valid("param");

      const savesService = SavesService.initialize();
      const result = await savesService.call("deleteRulesetSave", c.var.requestSession, id, saveId);
      return respond(c, result, 200);
    },
  );
