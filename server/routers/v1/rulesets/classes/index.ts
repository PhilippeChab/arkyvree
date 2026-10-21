import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Class, v1ClassPage, v1ClassProgression, v1NamedList } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { classParams, CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { ClassProgressionService } from "@/server/services/rulesets/classes/progression/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";

/** A ruleset's classes: a page of them, one, its progression, its skills and its spell lists. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/classes",
    describeRoute({ response: v1ClassPage, status: 200, summary: "A ruleset's classes, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        kind: z.string().optional().meta({ description: "Only those of a kind: `pc`, `npc`, a bonded creature's" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, kind, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const classes = await ClassesService.getClasses(
        id,
        { childOnly, kind, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(classes, V1.class), 200);
    },
  )
  .get(
    "/:id/classes/:classId",
    describeRoute({ response: v1Class, status: 200, summary: "A class of a ruleset's" }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(V1.class(await ClassesService.getClass(id, classId)), 200);
    },
  )
  .get(
    "/:id/classes/:classId/progression",
    describeRoute({
      response: v1ClassProgression,
      status: 200,
      summary:
        "A class's whole progression: its levels (fields, base saves, granted feats), its pools' picks by level and its " +
        "spell tables, as `PUT …/progression` takes it back",
    }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(V1.classProgression(await ClassProgressionService.getFullProgression(id, classId)), 200);
    },
  )
  .get(
    "/:id/classes/:classId/skills",
    describeRoute({ response: v1NamedList, status: 200, summary: "A class's skills" }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(V1.classSkills(await ClassSkillsService.getClassSkills(id, classId)), 200);
    },
  )
  .get(
    "/:id/classes/:classId/spell-lists",
    describeRoute({ response: v1NamedList, status: 200, summary: "The aptitudes (spell lists) a class casts from" }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(V1.names(await ClassLevelsService.getClassSpellLists(id, classId)), 200);
    },
  );
