import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";

import classLevels from "./levels/index.ts";
import classSkills from "./skills/index.ts";
import { classParams } from "./validation.ts";

/** A class's hit die, its create's and its update's: its ruleset's rules check it. */
const hitDie = z.number().int().optional();

export default new Hono<SessionContext>()
  .route("/", classLevels)
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
  .post(
    "/:id/classes",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        hd: hitDie,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ClassesService.createClass(c.var.requestSession, id, body), 201);
    },
  )
  .put(
    "/:id/classes/:classId",
    validate("param", classParams),
    validate(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
        hd: hitDie,
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ClassesService.updateClass(c.var.requestSession, id, classId, body), 200);
    },
  )
  .delete("/:id/classes/:classId", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassesService.deleteClass(c.var.requestSession, id, classId), 200);
  });
