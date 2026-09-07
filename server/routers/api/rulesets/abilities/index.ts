import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { AbilitiesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/abilities",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir } = c.req.valid("query");

      const abilitiesService = AbilitiesService.initialize();
      const result = await abilitiesService.call("getRulesetAbilities", id, { search, childOnly, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/abilities/:abilityId",
    zValidator("param", z.object({ id: z.string().uuid(), abilityId: z.string().uuid() })),
    async (c) => {
      const { id, abilityId } = c.req.valid("param");

      const abilitiesService = AbilitiesService.initialize();
      const result = await abilitiesService.call("getRulesetAbility", id, abilityId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
