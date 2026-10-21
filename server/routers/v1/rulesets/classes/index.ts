import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { levelFeats, levelSaves } from "@/server/routers/api/rulesets/classes/validation.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import {
  v1Class,
  v1ClassFeatPools,
  v1ClassLevel,
  v1ClassLevels,
  v1ClassPage,
  v1ClassProgression,
  v1ClassSpellsKnown,
  v1ClassSpellsPerDay,
  v1NamedList,
} from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { classParams, CONTENT_FILTERS, entityDescription, fields } from "@/server/routers/v1/validation.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { ClassProgressionService } from "@/server/services/rulesets/classes/progression/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";

/** A class, its create's and its update's. */
const classBody = z.object({
  description: entityDescription,
  fields,
  hitDie: z.number().int().optional().meta({ description: "Its hit die's sides: `10` a d10" }),
  name: z.string().min(1),
});

/** A class level, its create's and its update's: its fields, its base saves and the feats it grants. */
const levelBody = z.object({
  feats: levelFeats.meta({
    description: "The feats it grants, each in its aptitude, `free` without taking a pick: its whole list",
  }),
  fields,
  saves: levelSaves.meta({ description: "Its base save bonuses: its whole list" }),
});

const levelParams = classParams.extend({ levelId: z.string().uuid() });

const skillParams = classParams.extend({ skillId: z.string().uuid() });

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
    "/:id/classes/:classId/progression",
    describeRoute({
      response: v1ClassProgression,
      status: 200,
      summary: "What a class's progression reads beside its levels and spell tables: its pools' picks by level",
    }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      return c.json(V1.classProgression(await ClassProgressionService.getProgression(id, classId)), 200);
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
  )
  .post(
    "/:id/classes",
    describeRoute({ response: v1Class, status: 201, summary: "Adds a class to a ruleset" }),
    validate("param", idParam),
    validate("json", classBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await ClassesService.createClass(c.var.requestSession, id, V1.classRequest(body));
      return c.json(V1.class(await ClassesService.getClass(id, created.id)), 201);
    },
  )
  .post(
    "/:id/classes/:classId/levels",
    describeRoute({ response: v1ClassLevel, status: 201, summary: "Adds a level to a class" }),
    validate("param", classParams),
    validate("json", levelBody.extend({ level: z.number().int().meta({ description: "The class's level it is" }) })),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await ClassLevelsService.createClassLevel(c.var.requestSession, id, classId, body);
      return c.json(V1.classLevel(await ClassLevelsService.getClassLevel(id, classId, created.id)), 201);
    },
  )
  .post(
    "/:id/classes/:classId/skills",
    describeRoute({
      response: v1NamedList,
      status: 201,
      summary: "Makes a skill one of a class's: answers its skills",
    }),
    validate("param", classParams),
    validate("json", z.object({ skillId: z.string().uuid() })),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      const { skillId } = c.req.valid("json");
      await ClassSkillsService.addClassSkill(c.var.requestSession, id, classId, skillId);
      return c.json(V1.classSkills(await ClassSkillsService.getClassSkills(id, classId)), 201);
    },
  )
  .put(
    "/:id/classes/:classId",
    describeRoute({
      response: v1Class,
      status: 200,
      summary: "Changes a class of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", classParams),
    validate("json", classBody),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await ClassesService.updateClass(c.var.requestSession, id, classId, V1.classRequest(body));
      return c.json(V1.class(await ClassesService.getClass(id, updated.id)), 200);
    },
  )
  .put(
    "/:id/classes/:classId/levels/:levelId",
    describeRoute({ response: v1ClassLevel, status: 200, summary: "Changes a class's level" }),
    validate("param", levelParams),
    validate("json", levelBody),
    async (c) => {
      const { classId, id, levelId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await ClassLevelsService.updateClassLevel(c.var.requestSession, id, classId, levelId, body);
      return c.json(V1.classLevel(await ClassLevelsService.getClassLevel(id, classId, updated.id)), 200);
    },
  )
  .put(
    "/:id/classes/:classId/progression",
    describeRoute({
      response: v1ClassLevels,
      status: 200,
      summary:
        "Saves a class's progression at once: its levels' fields, saves and granted feats, its pools' picks by level " +
        "and its spell tables, a copy of its own when it's inherited. Answers its levels",
    }),
    validate("param", classParams),
    validate(
      "json",
      z.object({
        levels: z
          .array(levelBody.extend({ levelId: z.string().uuid() }))
          .optional()
          .meta({ description: "The levels it changes, each by its id" }),
        pools: z
          .array(
            z.object({
              aptitudeId: z.string().uuid(),
              picks: z.array(z.object({ count: z.number().int(), levelId: z.string().uuid() })),
            }),
          )
          .optional()
          .meta({ description: "The picks each level gives in each of its pools" }),
        spells: z
          .object({
            known: z
              .array(
                z.object({
                  counts: z.array(z.union([z.number().int(), z.literal("all")]).nullable()),
                  levelId: z.string().uuid(),
                }),
              )
              .optional()
              .meta({ description: "Each level's spells known by spell level, from 0: `all`, or none (null)" }),
            perDay: z
              .array(z.object({ counts: z.array(z.number().int().nullable()), levelId: z.string().uuid() }))
              .optional()
              .meta({ description: "Each level's spells a day by spell level, from 0: none (null)" }),
          })
          .optional(),
      }),
    ),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      const body = c.req.valid("json");
      const { klassId } = await ClassProgressionService.updateProgression(c.var.requestSession, id, classId, body);
      return c.json((await ClassLevelsService.getClassLevels(id, klassId)).map(V1.classLevel), 200);
    },
  )
  .delete(
    "/:id/classes/:classId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a class of a ruleset's: refused while a character has a level in it",
    }),
    validate("param", classParams),
    async (c) => {
      const { classId, id } = c.req.valid("param");
      await ClassesService.deleteClass(c.var.requestSession, id, classId);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/classes/:classId/levels/:levelId",
    describeRoute({ response: null, status: 204, summary: "Deletes a class's level" }),
    validate("param", levelParams),
    async (c) => {
      const { classId, id, levelId } = c.req.valid("param");
      await ClassLevelsService.deleteClassLevel(c.var.requestSession, id, classId, levelId);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/classes/:classId/skills/:skillId",
    describeRoute({ response: null, status: 204, summary: "Makes a skill no longer one of a class's" }),
    validate("param", skillParams),
    async (c) => {
      const { classId, id, skillId } = c.req.valid("param");
      await ClassSkillsService.removeClassSkill(c.var.requestSession, id, classId, skillId);
      return c.body(null, 204);
    },
  );
