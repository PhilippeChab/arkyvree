import { Hono } from "hono";
import { z } from "zod";

import { validate } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";

const saveParams = idParam.extend({ saveId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/saves",
    validate("param", idParam),
    validate(
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
      return c.json(await SavesService.getSaves(id, { search, childOnly, orderBy, orderDir }, { limit, page }), 200);
    },
  )
  .get("/:id/saves/:saveId", validate("param", saveParams), async (c) => {
    const { id, saveId } = c.req.valid("param");
    return c.json(await SavesService.getSave(id, saveId), 200);
  })
  .post(
    "/:id/saves",
    validate("param", idParam),
    validate(
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
      return c.json(await SavesService.createSave(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/saves/:saveId",
    validate("param", saveParams),
    validate(
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
      return c.json(await SavesService.updateSave(c.var.requestSession, id, saveId, body), 200);
    },
  )
  .delete("/:id/saves/:saveId", validate("param", saveParams), async (c) => {
    const { id, saveId } = c.req.valid("param");
    return c.json(await SavesService.deleteSave(c.var.requestSession, id, saveId), 200);
  });
