import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";

/** A race's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const raceBody = entityBody;

const raceParams = idParam.extend({ raceId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/races",
    validate("param", idParam),
    validate(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        kind: z.string().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, kind, orderBy, orderDir } = c.req.valid("query");
      return c.json(
        await RacesService.getRaces(id, { search, childOnly, kind, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/races/:raceId", validate("param", raceParams), async (c) => {
    const { id, raceId } = c.req.valid("param");
    return c.json(await RacesService.getRace(id, raceId), 200);
  })
  .post("/:id/races", validate("param", idParam), validate("json", raceBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await RacesService.createRace(c.var.requestSession, id, body), 200);
  })
  .put("/:id/races/:raceId", validate("param", raceParams), validate("json", raceBody), async (c) => {
    const { id, raceId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await RacesService.updateRace(c.var.requestSession, id, raceId, body), 200);
  })
  .delete("/:id/races/:raceId", validate("param", raceParams), async (c) => {
    const { id, raceId } = c.req.valid("param");
    return c.json(await RacesService.deleteRace(c.var.requestSession, id, raceId), 200);
  });
