import { Hono } from "hono";
import { z } from "zod";

import { validate } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { classParams } from "@/server/routers/api/rulesets/classes/validation.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";

import classLevels from "./levels/index.ts";
import classSkills from "./skills/index.ts";

const hitDie = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)], {
  error: () => "Hit die must be one of: 4, 6, 8, 10, 12",
});

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
        hd: hitDie.optional(),
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
        hd: hitDie.optional(),
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
