import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { ClassesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import classLevels from "./levels/index.ts";
import classSkills from "./skills/index.ts";

const hdSchema = z.union(
  [z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)],
  { error: () => "Hit die must be one of: 4, 6, 8, 10, 12" },
);

export default new Hono<SessionContext>()
  .route("/", classLevels)
  .route("/", classSkills)
  .get(
    "/:id/classes",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
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
      const classesService = ClassesService.initialize();
      const result = await classesService.call("getRulesetKlasses", id, { search, childOnly, kind, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/classes/:classId",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classesService = ClassesService.initialize();
      const result = await classesService.call("getRulesetKlass", id, classId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/classes",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        hd: hdSchema.optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const classesService = ClassesService.initialize();
      const result = await classesService.call(
        "createRulesetKlass",
        c.var.requestSession,
        id,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .put(
    "/:id/classes/:classId",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        hd: hdSchema.optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const body = c.req.valid("json");
      const classesService = ClassesService.initialize();
      const result = await classesService.call(
        "updateRulesetKlass",
        c.var.requestSession,
        id,
        classId,
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
    "/:id/classes/:classId",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classesService = ClassesService.initialize();
      const result = await classesService.call(
        "deleteRulesetKlass",
        c.var.requestSession,
        id,
        classId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
