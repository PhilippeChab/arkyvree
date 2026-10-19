import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, validate } from "@/server/middlewares/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";

/** A page of a ruleset's content, searched by name. */
const contentQuery = z.object({ limit, page, search: z.string().optional() });

/** The rulesets the key's user reads: a page of them, one, and its content, a page at a time. */
export default new Hono<ApiKeyContext>()
  .get(
    "/",
    validate(
      "query",
      z.object({
        limit,
        page,
        scope: z.enum(["base", "community", "createdByMe", "contributedTo", "starred"]).optional(),
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { limit, page, scope, search } = c.req.valid("query");
      const rulesets = await RulesetsService.getRulesets(c.var.requestSession, { scope, search }, { limit, page });
      return c.json(V1.rulesets(rulesets), 200);
    },
  )
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
  })
  .get("/:id/classes", validate("param", idParam), validate("query", contentQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { limit, page, search } = c.req.valid("query");
    return c.json(V1.classes(await ClassesService.getClasses(id, { search }, { limit, page })), 200);
  })
  .get("/:id/feats", validate("param", idParam), validate("query", contentQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { limit, page, search } = c.req.valid("query");
    return c.json(V1.feats(await FeatsService.getFeats(id, { search }, { limit, page })), 200);
  })
  .get("/:id/races", validate("param", idParam), validate("query", contentQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { limit, page, search } = c.req.valid("query");
    return c.json(V1.races(await RacesService.getRaces(id, { search }, { limit, page })), 200);
  })
  .get("/:id/skills", validate("param", idParam), validate("query", contentQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { limit, page, search } = c.req.valid("query");
    return c.json(V1.skills(await SkillsService.getSkills(id, { search }, { limit, page })), 200);
  })
  .get("/:id/spells", validate("param", idParam), validate("query", contentQuery), async (c) => {
    const { id } = c.req.valid("param");
    const { limit, page, search } = c.req.valid("query");
    return c.json(V1.spells(await PowersService.getPowers(id, { search }, { limit, page })), 200);
  });
