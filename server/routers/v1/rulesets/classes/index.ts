import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import {
  v1Class,
  v1ClassFeatPools,
  v1ClassLevel,
  v1ClassLevels,
  v1ClassPage,
  v1ClassSpellsKnown,
  v1ClassSpellsPerDay,
  v1NamedList,
} from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { classParams, CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";

const levelParams = classParams.extend({ levelId: z.string().uuid() });

/** A ruleset's classes: a page of them, one, and its levels, skills, spells and feat pools. */
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
    "/:id/classes/:classId/feat-pools",
    describeRoute({
      response: v1ClassFeatPools,
      status: 200,
      summary: "The feats a class's levels give to pick, each level's by aptitude",
    }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(V1.classFeatPools(await ClassLevelsService.getClassLevelFeatPools(id, classId)), 200);
    },
  )
  .get(
    "/:id/classes/:classId/levels",
    describeRoute({ response: v1ClassLevels, status: 200, summary: "A class's levels" }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json((await ClassLevelsService.getClassLevels(id, classId)).map(V1.classLevel), 200);
    },
  )
  .get(
    "/:id/classes/:classId/levels/:levelId",
    describeRoute({ response: v1ClassLevel, status: 200, summary: "A class's level" }),
    validate("param", levelParams),
    async (c) => {
      const { classId, id, levelId } = c.req.valid("param");
      return c.json(V1.classLevel(await ClassLevelsService.getClassLevel(id, classId, levelId)), 200);
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
  )
  .get(
    "/:id/classes/:classId/spells-known",
    describeRoute({
      response: v1ClassSpellsKnown,
      status: 200,
      summary: "The spells a class's levels know, each level's by spell level",
    }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(
        V1.classSpellCounts(await ClassLevelsService.getClassLevelSpellsKnown(id, classId), "spellsKnown"),
        200,
      );
    },
  )
  .get(
    "/:id/classes/:classId/spells-per-day",
    describeRoute({
      response: v1ClassSpellsPerDay,
      status: 200,
      summary: "The spells a class's levels cast a day, each level's by spell level",
    }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(
        V1.classSpellCounts(await ClassLevelsService.getClassLevelSpells(id, classId), "spellsPerDay"),
        200,
      );
    },
  );
