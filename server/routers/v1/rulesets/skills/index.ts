import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Skill, v1SkillPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS } from "@/server/routers/v1/validation.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";

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
  );
