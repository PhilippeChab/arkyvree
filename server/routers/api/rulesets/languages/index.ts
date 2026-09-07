import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { LanguagesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/languages",
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

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call(
        "getRulesetLanguages",
        id,
        { search, childOnly, orderBy, orderDir },
        { limit, page },
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/languages/:languageId",
    zValidator("param", z.object({ id: z.string().uuid(), languageId: z.string().uuid() })),
    async (c) => {
      const { id, languageId } = c.req.valid("param");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call("getRulesetLanguage", id, languageId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/languages",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        type: z.string(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call(
        "createRulesetLanguage",
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
    "/:id/languages/:languageId",
    zValidator("param", z.object({ id: z.string().uuid(), languageId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        type: z.string(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, languageId } = c.req.valid("param");
      const body = c.req.valid("json");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call(
        "updateRulesetLanguage",
        c.var.requestSession,
        id,
        languageId,
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
    "/:id/languages/:languageId",
    zValidator("param", z.object({ id: z.string().uuid(), languageId: z.string().uuid() })),
    async (c) => {
      const { id, languageId } = c.req.valid("param");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call(
        "deleteRulesetLanguage",
        c.var.requestSession,
        id,
        languageId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
