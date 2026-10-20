import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Skill, v1SkillPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription, fields } from "@/server/routers/v1/validation.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";

/** A skill, its create's and its update's. */
const skillBody = z.object({
  abilityId: z.string().uuid().meta({ description: "Its key ability" }),
  description: entityDescription,
  fields,
  name: z.string().min(1),
});

const skillParams = idParam.extend({ skillId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/skills",
    describeRoute({ response: v1SkillPage, status: 200, summary: "A ruleset's skills, a page at a time" }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const skills = await SkillsService.getSkills(id, { childOnly, orderBy, orderDir, search }, { limit, page });
      return c.json(V1.page(skills, V1.skill), 200);
    },
  )
  .get(
    "/:id/skills/:skillId",
    describeRoute({ response: v1Skill, status: 200, summary: "A skill of a ruleset's" }),
    validate("param", skillParams),
    async (c) => {
      const { id, skillId } = c.req.valid("param");
      return c.json(V1.skill(await SkillsService.getSkill(id, skillId)), 200);
    },
  )
  .post(
    "/:id/skills",
    describeRoute({ response: v1Skill, status: 201, summary: "Adds a skill to a ruleset" }),
    validate("param", idParam),
    validate("json", skillBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await SkillsService.createSkill(c.var.requestSession, id, V1.skillRequest(body));
      return c.json(V1.skill(await SkillsService.getSkill(id, created.id)), 201);
    },
  )
  .put(
    "/:id/skills/:skillId",
    describeRoute({
      response: v1Skill,
      status: 200,
      summary: "Changes a skill of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", skillParams),
    validate("json", skillBody),
    async (c) => {
      const { id, skillId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await SkillsService.updateSkill(c.var.requestSession, id, skillId, V1.skillRequest(body));
      return c.json(V1.skill(await SkillsService.getSkill(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/skills/:skillId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a skill of a ruleset's: refused while a character has it",
    }),
    validate("param", skillParams),
    async (c) => {
      const { id, skillId } = c.req.valid("param");
      await SkillsService.deleteSkill(c.var.requestSession, id, skillId);
      return c.body(null, 204);
    },
  );
