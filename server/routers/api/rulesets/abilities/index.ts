import { respond } from "@/server/routers/respond.ts";
import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { AbilitiesService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
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
      return respond(c, result, 200);
    },
  )
  .get(
    "/:id/abilities/:abilityId",
    zValidator("param", z.object({ id: z.string().uuid(), abilityId: z.string().uuid() })),
    async (c) => {
      const { id, abilityId } = c.req.valid("param");

      const abilitiesService = AbilitiesService.initialize();
      const result = await abilitiesService.call("getRulesetAbility", id, abilityId);
      return respond(c, result, 200);
    },
  );
