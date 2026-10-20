import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Feat, v1FeatPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription, fields } from "@/server/routers/v1/validation.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";

/** The aptitudes a feat is picked in, which a create names, and an update replaces when it names them. */
const featAptitudes = z.array(z.string().uuid()).meta({ description: "The aptitudes it's picked in: its whole list" });

/** A feat, its create's and its update's. */
const featBody = z.object({ description: entityDescription, fields, name: z.string().min(1) });

const featParams = idParam.extend({ featId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/feats",
    describeRoute({ response: v1FeatPage, status: 200, summary: "A ruleset's feats, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        aptitudeId: z.string().uuid().optional().meta({ description: "Only those picked in an aptitude" }),
        family: z.string().optional().meta({ description: "Only those of a family (`Weapon Focus`)" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { aptitudeId, childOnly, family, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const feats = await FeatsService.getFeats(
        id,
        { aptitudeId, childOnly, family, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(feats, V1.feat), 200);
    },
  )
  .get(
    "/:id/feats/:featId",
    describeRoute({ response: v1Feat, status: 200, summary: "A feat of a ruleset's" }),
    validate("param", featParams),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      return c.json(V1.feat(await FeatsService.getFeat(id, featId)), 200);
    },
  )
  .post(
    "/:id/feats",
    describeRoute({ response: v1Feat, status: 201, summary: "Adds a feat to a ruleset" }),
    validate("param", idParam),
    validate("json", featBody.extend({ aptitudeIds: featAptitudes.min(1, "At least one aptitude must be selected") })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await FeatsService.createFeat(c.var.requestSession, id, body);
      return c.json(V1.feat(await FeatsService.getFeat(id, created.id)), 201);
    },
  )
  .put(
    "/:id/feats/:featId",
    describeRoute({
      response: v1Feat,
      status: 200,
      summary: "Changes a feat of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", featParams),
    validate("json", featBody.extend({ aptitudeIds: featAptitudes.optional() })),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await FeatsService.updateFeat(c.var.requestSession, id, featId, body);
      return c.json(V1.feat(await FeatsService.getFeat(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/feats/:featId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a feat of a ruleset's: refused while a character has it",
    }),
    validate("param", featParams),
    async (c) => {
      const { id, featId } = c.req.valid("param");
      await FeatsService.deleteFeat(c.var.requestSession, id, featId);
      return c.body(null, 204);
    },
  );
