import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Aptitude, v1AptitudePage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription } from "@/server/routers/v1/validation.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";

/** An aptitude, its create's and its update's. */
const aptitudeBody = z.object({ description: entityDescription, name: z.string().min(1) });

const aptitudeParams = idParam.extend({ aptitudeId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/aptitudes",
    describeRoute({
      response: v1AptitudePage,
      status: 200,
      summary: "A ruleset's aptitudes (the pools feats and spells are picked in), a page at a time",
    }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        scope: z
          .enum(["feats", "spells"])
          .optional()
          .meta({ description: "Only those feats, or spells, are picked in" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, scope, search } = c.req.valid("query");
      const aptitudes = await AptitudesService.getAptitudes(
        id,
        { childOnly, orderBy, orderDir, scope, search },
        { limit, page },
      );
      return c.json(V1.page(aptitudes, V1.entity), 200);
    },
  )
  .get(
    "/:id/aptitudes/:aptitudeId",
    describeRoute({ response: v1Aptitude, status: 200, summary: "An aptitude of a ruleset's" }),
    validate("param", aptitudeParams),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");
      return c.json(V1.entity(await AptitudesService.getAptitude(id, aptitudeId)), 200);
    },
  )
  .post(
    "/:id/aptitudes",
    describeRoute({ response: v1Aptitude, status: 201, summary: "Adds an aptitude to a ruleset" }),
    validate("param", idParam),
    validate("json", aptitudeBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await AptitudesService.createAptitude(c.var.requestSession, id, body);
      return c.json(V1.entity(await AptitudesService.getAptitude(id, created.id)), 201);
    },
  )
  .put(
    "/:id/aptitudes/:aptitudeId",
    describeRoute({
      response: v1Aptitude,
      status: 200,
      summary: "Changes an aptitude of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", aptitudeParams),
    validate("json", aptitudeBody),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await AptitudesService.updateAptitude(c.var.requestSession, id, aptitudeId, body);
      return c.json(V1.entity(await AptitudesService.getAptitude(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/aptitudes/:aptitudeId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes an aptitude of a ruleset's: refused while a character has it",
    }),
    validate("param", aptitudeParams),
    async (c) => {
      const { id, aptitudeId } = c.req.valid("param");
      await AptitudesService.deleteAptitude(c.var.requestSession, id, aptitudeId);
      return c.body(null, 204);
    },
  );
