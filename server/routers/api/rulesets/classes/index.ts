import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";

import classLevels from "./levels/index.ts";
import classProgression from "./progression/index.ts";
import classSkills from "./skills/index.ts";
import { classParams } from "./validation.ts";

/** A class's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const classBody = entityBody;

export default new Hono<SessionContext>()
  .route("/", classLevels)
  .route("/", classProgression)
  .route("/", classSkills)
  .get(
    "/:id/classes",
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
        await ClassesService.getClasses(id, { search, childOnly, kind, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/classes/:classId", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassesService.getClass(id, classId), 200);
  })
  .post("/:id/classes", validate("param", idParam), validate("json", classBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await ClassesService.createClass(c.var.requestSession, id, body), 201);
  })
  .put("/:id/classes/:classId", validate("param", classParams), validate("json", classBody), async (c) => {
    const { id, classId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await ClassesService.updateClass(c.var.requestSession, id, classId, body), 200);
  })
  .delete("/:id/classes/:classId", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassesService.deleteClass(c.var.requestSession, id, classId), 200);
  });
