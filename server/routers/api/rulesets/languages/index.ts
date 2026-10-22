import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { LanguagesService } from "@/server/services/rulesets/languages/index.ts";

/** A language's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const languageBody = entityBody;

const languageParams = idParam.extend({ languageId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/languages",
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
      return c.json(
        await LanguagesService.getLanguages(id, { search, childOnly, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/languages/:languageId", validate("param", languageParams), async (c) => {
    const { id, languageId } = c.req.valid("param");
    return c.json(await LanguagesService.getLanguage(id, languageId), 200);
  })
  .post("/:id/languages", validate("param", idParam), validate("json", languageBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await LanguagesService.createLanguage(c.var.requestSession, id, body), 200);
  })
  .put("/:id/languages/:languageId", validate("param", languageParams), validate("json", languageBody), async (c) => {
    const { id, languageId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await LanguagesService.updateLanguage(c.var.requestSession, id, languageId, body), 200);
  })
  .delete("/:id/languages/:languageId", validate("param", languageParams), async (c) => {
    const { id, languageId } = c.req.valid("param");
    return c.json(await LanguagesService.deleteLanguage(c.var.requestSession, id, languageId), 200);
  });
