import { Hono } from "hono";
import { z } from "zod";

import type { ProgressionForm } from "@/engine/index.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { buildEntityTypeSchema } from "@/server/routers/api/schemaBuilders.ts";
import {
  entityBody,
  entityFields,
  entityOrderBy,
  idParam,
  limit,
  orderDirAsc,
  page,
} from "@/server/routers/api/validation.ts";
import { EntitiesService, ENTITY_TYPES } from "@/server/services/rulesets/entities/index.ts";
import { isRecord } from "@/shared/isRecord.ts";

/**
 * A route's entity kind: the ruleset (`id`), and the kind by its URL segment (`classes`), which it hands as its type.
 */
const kindParams = idParam.extend({ entityType: buildEntityTypeSchema(ENTITY_TYPES) });

/** A route's entity: its kind's params, and its id. */
const entityParams = kindParams.extend({ entityId: z.string().uuid() });

/**
 * A kind's entity's body, its create's, its update's and its duplicate's: an entity's (`entityBody`), whose columns its
 * rules read.
 */
const kindEntityBody = entityBody;

/** A route's link from an entity: its entity's params, and the entity it links to. */
const linkParams = entityParams.extend({ targetId: z.string().uuid() });

/**
 * An owned entity's body, its create's and its update's: its fields and when it was last read (an update's), and every
 * other key as it is, which its owner's kind's rules read (a class level's number, its saves, the feats it grants).
 */
const ownedBody = z.looseObject({ fields: entityFields.optional(), updatedAt: z.string().optional() });

/** A route's owned entity by its id alone: its owner's kind's params, and its id. */
const ownedByIdParams = kindParams.extend({ ownedId: z.string().uuid() });

/** A route's entity's owned entity: its entity's params, and its id. */
const ownedParams = entityParams.extend({ ownedId: z.string().uuid() });

/** A route's entity's table: its entity's params, and the table's name. */
const tableParams = entityParams.extend({ table: z.string() });

/**
 * Every ruleset entity kind's routes, by its URL segment (`/rulesets/:id/entities/races`), each answered by its kind's
 * rules: its list, with its kind's filters past the shared ones (`kind`, `aptitudeId`…, which its rules read), its
 * page, its create, update and delete, and its kind's actions (its groups, its templates, a duplicate, variants), and
 * an entity's parts its kind may have: the entities it owns (a class's levels, and one by its id alone), the links it
 * edits (a class's skills), its progression and its tables.
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
        childOnly: z.stringbool().optional(),
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
          { search, childOnly, orderBy, orderDir, ...filters },
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
      z.looseObject({ limit, page, search: z.string().optional(), childOnly: z.stringbool().optional() }),
    ),
    async (c) => {
      const { id, entityType } = c.req.valid("param");
      const { limit, page, search, childOnly, ...filters } = c.req.valid("query");
      return c.json(
        await EntitiesService.getEntityGroups(id, entityType, { search, childOnly, ...filters }, { limit, page }),
        200,
      );
    },
  )
  .get("/:id/entities/:entityType/owned/:ownedId", validate("param", ownedByIdParams), async (c) => {
    const { id, entityType, ownedId } = c.req.valid("param");
    return c.json(await EntitiesService.getOwnedEntityWithOwner(id, entityType, ownedId), 200);
  })
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
  .get("/:id/entities/:entityType/:entityId/links", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await EntitiesService.getEntityLinks(id, entityType, entityId), 200);
  })
  .get("/:id/entities/:entityType/:entityId/owned", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await EntitiesService.getOwnedEntities(id, entityType, entityId), 200);
  })
  .get("/:id/entities/:entityType/:entityId/owned/:ownedId", validate("param", ownedParams), async (c) => {
    const { id, entityType, entityId, ownedId } = c.req.valid("param");
    return c.json(await EntitiesService.getOwnedEntity(id, entityType, entityId, ownedId), 200);
  })
  .get("/:id/entities/:entityType/:entityId/progression", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await EntitiesService.getProgression(id, entityType, entityId), 200);
  })
  .get("/:id/entities/:entityType/:entityId/tables/:table", validate("param", tableParams), async (c) => {
    const { id, entityType, entityId, table } = c.req.valid("param");
    return c.json(await EntitiesService.getEntityTable(id, entityType, entityId, table), 200);
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
    "/:id/entities/:entityType/:entityId/links",
    validate("param", entityParams),
    validate("json", z.object({ targetId: z.string().uuid() })),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const { targetId } = c.req.valid("json");
      return c.json(await EntitiesService.addEntityLink(c.var.requestSession, id, entityType, entityId, targetId), 200);
    },
  )
  .post(
    "/:id/entities/:entityType/:entityId/owned",
    validate("param", entityParams),
    validate("json", ownedBody),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await EntitiesService.createOwnedEntity(c.var.requestSession, id, entityType, entityId, body), 201);
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
  .put(
    "/:id/entities/:entityType/:entityId/owned/:ownedId",
    validate("param", ownedParams),
    validate("json", ownedBody),
    async (c) => {
      const { id, entityType, entityId, ownedId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await EntitiesService.updateOwnedEntity(c.var.requestSession, id, entityType, entityId, ownedId, body),
        200,
      );
    },
  )
  .put(
    "/:id/entities/:entityType/:entityId/progression",
    validate("param", entityParams),
    // A progression's save: what its kind's rules read (`ProgressionForm`, any object, which they parse), and the
    // tokens of the owned entities its client read
    validate(
      "json",
      z
        .object({ ownedTokens: z.array(z.object({ id: z.string().uuid(), updatedAt: z.string() })).optional() })
        .and(z.custom<ProgressionForm>((value) => isRecord(value), "Expected an object")),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await EntitiesService.updateProgression(c.var.requestSession, id, entityType, entityId, body), 200);
    },
  )
  .delete("/:id/entities/:entityType/:entityId", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await EntitiesService.deleteEntity(c.var.requestSession, id, entityType, entityId), 200);
  })
  .delete("/:id/entities/:entityType/:entityId/links/:targetId", validate("param", linkParams), async (c) => {
    const { id, entityType, entityId, targetId } = c.req.valid("param");
    return c.json(
      await EntitiesService.removeEntityLink(c.var.requestSession, id, entityType, entityId, targetId),
      200,
    );
  })
  .delete("/:id/entities/:entityType/:entityId/owned/:ownedId", validate("param", ownedParams), async (c) => {
    const { id, entityType, entityId, ownedId } = c.req.valid("param");
    return c.json(
      await EntitiesService.deleteOwnedEntity(c.var.requestSession, id, entityType, entityId, ownedId),
      200,
    );
  });
