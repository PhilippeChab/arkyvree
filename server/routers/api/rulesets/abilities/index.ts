import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { AbilitiesService } from "@/server/services/rulesets/abilities/index.ts";

const abilityParams = idParam.extend({ abilityId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/abilities",
    validate("param", idParam),
    validate(
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
      return c.json(
        await AbilitiesService.getAbilities(id, { search, childOnly, orderBy, orderDir }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/abilities/:abilityId", validate("param", abilityParams), async (c) => {
    const { id, abilityId } = c.req.valid("param");
    return c.json(await AbilitiesService.getAbility(id, abilityId), 200);
  });
