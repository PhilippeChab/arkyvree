import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { buildEntityTypeSchema } from "@/server/routers/api/schemaBuilders.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { EntitiesService, ENTITY_TYPES } from "@/server/services/rulesets/entities/index.ts";

/** A route's entity kind: the ruleset (`id`), and the kind by its URL segment (`classes`), which it hands as its type. */
const kindParams = idParam.extend({ entityType: buildEntityTypeSchema(ENTITY_TYPES) });

/** A route's entity: its kind's params, and its id. */
const entityParams = kindParams.extend({ entityId: z.string().uuid() });

/**
 * A kind's entity's body, its create's, its update's and its duplicate's: an entity's (`entityBody`), whose columns its
 * rules read.
 */
const kindEntityBody = entityBody;

/**
 * Every ruleset entity kind's routes, by its URL segment (`/rulesets/:id/entities/races`), each dispatched to its kind's
 * service: its list, with its kind's filters past the shared ones (`kind`, `aptitudeId`…, which its service reads), its
 * page, its create, update and delete, and its kind's actions (its groups, its templates, a duplicate, variants).
 */
export default new Hono<SessionContext>()
  .get(
    "/:id/entities/:entityType",
    validate("param", kindParams),
    validate(
      "query",
      z.looseObject({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id, entityType } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir, ...filters } = c.req.valid("query");
      return c.json(
        await EntitiesService.getEntities(
          id,
          entityType,
          { search, childOnly, orderBy, orderDir, filters },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get(
    "/:id/entities/:entityType/grouped",
    validate("param", kindParams),
    validate(
      "query",
      z.looseObject({ limit, page, search: z.string().optional(), childOnly: z.coerce.boolean().optional() }),
    ),
    async (c) => {
      const { id, entityType } = c.req.valid("param");
      const { limit, page, search, childOnly, ...filters } = c.req.valid("query");
      return c.json(
        await EntitiesService.getEntityGroups(id, entityType, { search, childOnly, filters }, { limit, page }),
        200,
      );
    },
  )
  .get(
    "/:id/entities/:entityType/templates",
    validate("param", kindParams),
    validate("query", z.object({ type: z.string().optional() })),
    async (c) => {
      const { id, entityType } = c.req.valid("param");
      const { type } = c.req.valid("query");
      return c.json(await EntitiesService.getTemplates(id, entityType, type), 200);
    },
  )
  .get("/:id/entities/:entityType/:entityId", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await EntitiesService.getEntity(id, entityType, entityId), 200);
  })
  .post("/:id/entities/:entityType", validate("param", kindParams), validate("json", kindEntityBody), async (c) => {
    const { id, entityType } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await EntitiesService.createEntity(c.var.requestSession, id, entityType, body), 201);
  })
  .post(
    "/:id/entities/:entityType/:entityId/duplicate",
    validate("param", entityParams),
    validate("json", kindEntityBody),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await EntitiesService.duplicateEntity(c.var.requestSession, id, entityType, entityId, body), 201);
    },
  )
  .post(
    "/:id/entities/:entityType/:entityId/variants",
    validate("param", entityParams),
    validate(
      "json",
      z.object({
        variants: z
          .array(
            z.object({
              name: z.string().min(1),
              description: z
                .string()
                .optional()
                .transform((v) => v || null),
            }),
          )
          .min(1),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const { variants } = c.req.valid("json");
      return c.json(
        await EntitiesService.createVariants(c.var.requestSession, id, entityType, entityId, variants),
        201,
      );
    },
  )
  .put(
    "/:id/entities/:entityType/:entityId",
    validate("param", entityParams),
    validate("json", kindEntityBody),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await EntitiesService.updateEntity(c.var.requestSession, id, entityType, entityId, body), 200);
    },
  )
  .delete("/:id/entities/:entityType/:entityId", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await EntitiesService.deleteEntity(c.var.requestSession, id, entityType, entityId), 200);
  });
