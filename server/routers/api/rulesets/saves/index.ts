import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";

/** A save's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const saveBody = entityBody;

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
  .post("/:id/saves", validate("param", idParam), validate("json", saveBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await SavesService.createSave(c.var.requestSession, id, body), 200);
  })
  .put("/:id/saves/:saveId", validate("param", saveParams), validate("json", saveBody), async (c) => {
    const { id, saveId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await SavesService.updateSave(c.var.requestSession, id, saveId, body), 200);
  })
  .delete("/:id/saves/:saveId", validate("param", saveParams), async (c) => {
    const { id, saveId } = c.req.valid("param");
    return c.json(await SavesService.deleteSave(c.var.requestSession, id, saveId), 200);
  });
