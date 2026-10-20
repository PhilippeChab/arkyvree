import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Mechanic, v1MechanicPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription } from "@/server/routers/v1/validation.ts";
import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";

/** A mechanic, its create's and its update's. */
const mechanicBody = z.object({ description: entityDescription, name: z.string().min(1) });

const mechanicParams = idParam.extend({ mechanicId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/mechanics",
    describeRoute({ response: v1MechanicPage, status: 200, summary: "A ruleset's mechanics, a page at a time" }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const mechanics = await MechanicsService.getMechanics(
        id,
        { childOnly, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(mechanics, V1.entity), 200);
    },
  )
  .get(
    "/:id/mechanics/:mechanicId",
    describeRoute({ response: v1Mechanic, status: 200, summary: "A mechanic of a ruleset's" }),
    validate("param", mechanicParams),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      return c.json(V1.entity(await MechanicsService.getMechanic(id, mechanicId)), 200);
    },
  )
  .post(
    "/:id/mechanics",
    describeRoute({ response: v1Mechanic, status: 201, summary: "Adds a mechanic to a ruleset" }),
    validate("param", idParam),
    validate("json", mechanicBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await MechanicsService.createMechanic(c.var.requestSession, id, body);
      return c.json(V1.entity(await MechanicsService.getMechanic(id, created.id)), 201);
    },
  )
  .put(
    "/:id/mechanics/:mechanicId",
    describeRoute({
      response: v1Mechanic,
      status: 200,
      summary: "Changes a mechanic of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", mechanicParams),
    validate("json", mechanicBody),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await MechanicsService.updateMechanic(c.var.requestSession, id, mechanicId, body);
      return c.json(V1.entity(await MechanicsService.getMechanic(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/mechanics/:mechanicId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a mechanic of a ruleset's: refused while a character has it",
    }),
    validate("param", mechanicParams),
    async (c) => {
      const { id, mechanicId } = c.req.valid("param");
      await MechanicsService.deleteMechanic(c.var.requestSession, id, mechanicId);
      return c.body(null, 204);
    },
  );
