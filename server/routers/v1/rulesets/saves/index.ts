import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Save, v1SavePage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription } from "@/server/routers/v1/validation.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";

/** A saving throw, its create's and its update's. */
const saveBody = z.object({
  abilityId: z.string().uuid().meta({ description: "Its key ability" }),
  description: entityDescription,
  name: z.string().min(1),
});

const saveParams = idParam.extend({ saveId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/saves",
    describeRoute({ response: v1SavePage, status: 200, summary: "A ruleset's saving throws, a page at a time" }),
    validate("param", idParam),
    validate("query", z.object(CONTENT_FILTERS)),
    async (c) => {
      const { id } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const saves = await SavesService.getSaves(id, { childOnly, orderBy, orderDir, search }, { limit, page });
      return c.json(V1.page(saves, V1.save), 200);
    },
  )
  .get(
    "/:id/saves/:saveId",
    describeRoute({ response: v1Save, status: 200, summary: "A saving throw of a ruleset's" }),
    validate("param", saveParams),
    async (c) => {
      const { id, saveId } = c.req.valid("param");
      return c.json(V1.save(await SavesService.getSave(id, saveId)), 200);
    },
  )
  .post(
    "/:id/saves",
    describeRoute({ response: v1Save, status: 201, summary: "Adds a saving throw to a ruleset" }),
    validate("param", idParam),
    validate("json", saveBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await SavesService.createSave(c.var.requestSession, id, body);
      return c.json(V1.save(await SavesService.getSave(id, created.id)), 201);
    },
  )
  .put(
    "/:id/saves/:saveId",
    describeRoute({
      response: v1Save,
      status: 200,
      summary: "Changes a saving throw of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", saveParams),
    validate("json", saveBody),
    async (c) => {
      const { id, saveId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await SavesService.updateSave(c.var.requestSession, id, saveId, body);
      return c.json(V1.save(await SavesService.getSave(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/saves/:saveId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a saving throw of a ruleset's: refused while a character has it",
    }),
    validate("param", saveParams),
    async (c) => {
      const { id, saveId } = c.req.valid("param");
      await SavesService.deleteSave(c.var.requestSession, id, saveId);
      return c.body(null, 204);
    },
  );
