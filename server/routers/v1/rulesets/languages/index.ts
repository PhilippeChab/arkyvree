import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Language, v1LanguagePage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription } from "@/server/routers/v1/validation.ts";
import { LanguagesService } from "@/server/services/rulesets/languages/index.ts";

/** A language, its create's and its update's. */
const languageBody = z.object({
  description: entityDescription,
  name: z.string().min(1),
  type: z.string().meta({ description: "`Common`, `Exotic`…" }),
});

const languageParams = idParam.extend({ languageId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/languages",
    describeRoute({ response: v1LanguagePage, status: 200, summary: "A ruleset's languages, a page at a time" }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const languages = await LanguagesService.getLanguages(
        id,
        { childOnly, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(languages, V1.language), 200);
    },
  )
  .get(
    "/:id/languages/:languageId",
    describeRoute({ response: v1Language, status: 200, summary: "A language of a ruleset's" }),
    validate("param", languageParams),
    async (c) => {
      const { id, languageId } = c.req.valid("param");
      return c.json(V1.language(await LanguagesService.getLanguage(id, languageId)), 200);
    },
  )
  .post(
    "/:id/languages",
    describeRoute({ response: v1Language, status: 201, summary: "Adds a language to a ruleset" }),
    validate("param", idParam),
    validate("json", languageBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await LanguagesService.createLanguage(c.var.requestSession, id, body);
      return c.json(V1.language(await LanguagesService.getLanguage(id, created.id)), 201);
    },
  )
  .put(
    "/:id/languages/:languageId",
    describeRoute({
      response: v1Language,
      status: 200,
      summary: "Changes a language of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", languageParams),
    validate("json", languageBody),
    async (c) => {
      const { id, languageId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await LanguagesService.updateLanguage(c.var.requestSession, id, languageId, body);
      return c.json(V1.language(await LanguagesService.getLanguage(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/languages/:languageId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a language of a ruleset's: refused while a character has it",
    }),
    validate("param", languageParams),
    async (c) => {
      const { id, languageId } = c.req.valid("param");
      await LanguagesService.deleteLanguage(c.var.requestSession, id, languageId);
      return c.body(null, 204);
    },
  );
