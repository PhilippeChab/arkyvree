import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Spell, v1SpellPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { CONTENT_FILTERS, entityDescription, fields } from "@/server/routers/v1/validation.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";

/** The aptitudes (spell lists) a spell is on, each at its level, one at least, which an update replaces whole. */
const spellAptitudes = z
  .array(z.object({ id: z.string().uuid(), level: z.number().int().optional() }))
  .min(1, "At least one aptitude must be selected")
  .meta({ description: "The aptitudes (spell lists) it's on, each at its spell level: its whole list, one at least" });

/** A spell, its create's and its update's. */
const spellBody = z.object({
  description: entityDescription,
  fields,
  name: z.string().min(1),
  saveEffect: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value))
    .meta({ description: "What a successful save does: `half`, `negates`…; none for a spell without a save" }),
  saveId: z
    .union([z.string().uuid(), z.literal("")])
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value))
    .meta({ description: "The saving throw it allows" }),
});

const spellParams = idParam.extend({ spellId: z.string().uuid() });

export default new Hono<ApiKeyContext>()
  .get(
    "/:id/spells",
    describeRoute({ response: v1SpellPage, status: 200, summary: "A ruleset's spells, a page at a time" }),
    validate("param", idParam),
    validate(
      "query",
      z.object({
        ...CONTENT_FILTERS,
        aptitudeId: z.string().uuid().optional().meta({ description: "Only those on an aptitude (a spell list)" }),
        // Digits alone: an empty `level=` coerced is 0, cantrips
        level: z
          .string()
          .regex(/^\d+$/)
          .transform(Number)
          .optional()
          .meta({ description: "Only those at a spell level (0 for cantrips), with `aptitudeId`" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { aptitudeId, childOnly, level, limit, orderBy, orderDir, page, search } = c.req.valid("query");
      const spells = await PowersService.getPowers(
        id,
        { aptitudeId, childOnly, level, orderBy, orderDir, search },
        { limit, page },
      );
      return c.json(V1.page(spells, V1.spell), 200);
    },
  )
  .get(
    "/:id/spells/:spellId",
    describeRoute({ response: v1Spell, status: 200, summary: "A spell of a ruleset's" }),
    validate("param", spellParams),
    async (c) => {
      const { id, spellId } = c.req.valid("param");
      return c.json(V1.spell(await PowersService.getPower(id, spellId)), 200);
    },
  )
  .post(
    "/:id/spells",
    describeRoute({ response: v1Spell, status: 201, summary: "Adds a spell to a ruleset" }),
    validate("param", idParam),
    validate("json", spellBody.extend({ aptitudes: spellAptitudes })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await PowersService.createPower(c.var.requestSession, id, body);
      return c.json(V1.spell(await PowersService.getPower(id, created.id)), 201);
    },
  )
  .put(
    "/:id/spells/:spellId",
    describeRoute({
      response: v1Spell,
      status: 200,
      summary: "Changes a spell of a ruleset's: a copy of its own, when it's inherited",
    }),
    validate("param", spellParams),
    validate("json", spellBody.extend({ aptitudes: spellAptitudes.optional() })),
    async (c) => {
      const { id, spellId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await PowersService.updatePower(c.var.requestSession, id, spellId, body);
      return c.json(V1.spell(await PowersService.getPower(id, updated.id)), 200);
    },
  )
  .delete(
    "/:id/spells/:spellId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a spell of a ruleset's: refused while a character has it",
    }),
    validate("param", spellParams),
    async (c) => {
      const { id, spellId } = c.req.valid("param");
      await PowersService.deletePower(c.var.requestSession, id, spellId);
      return c.body(null, 204);
    },
  );
