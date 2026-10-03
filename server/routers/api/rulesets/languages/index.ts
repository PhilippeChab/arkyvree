import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { LanguagesService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/languages",
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

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call(
        "getRulesetLanguages",
        id,
        { search, childOnly, orderBy, orderDir },
        { limit, page },
      );
      return respond(c, result, 200);
    },
  )
  .get(
    "/:id/languages/:languageId",
    zValidator("param", z.object({ id: z.string().uuid(), languageId: z.string().uuid() })),
    async (c) => {
      const { id, languageId } = c.req.valid("param");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call("getRulesetLanguage", id, languageId);
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/languages",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        type: z.string(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call("createRulesetLanguage", c.var.requestSession, id, body);
      return respond(c, result, 200);
    },
  )
  .put(
    "/:id/languages/:languageId",
    zValidator("param", z.object({ id: z.string().uuid(), languageId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        type: z.string(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, languageId } = c.req.valid("param");
      const body = c.req.valid("json");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call("updateRulesetLanguage", c.var.requestSession, id, languageId, body);
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/languages/:languageId",
    zValidator("param", z.object({ id: z.string().uuid(), languageId: z.string().uuid() })),
    async (c) => {
      const { id, languageId } = c.req.valid("param");

      const languagesService = LanguagesService.initialize();
      const result = await languagesService.call("deleteRulesetLanguage", c.var.requestSession, id, languageId);
      return respond(c, result, 200);
    },
  );
