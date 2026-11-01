import { Hono } from "hono";
import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { entityFields, entityLinks, entityOrderBy, idParam, orderDirAsc } from "@/server/routers/api/validation.ts";
import {
  v1Entity,
  v1EntityGroupPage,
  v1EntityLinks,
  v1EntityPage,
  v1EntityTable,
  v1OwnedEntities,
  v1OwnedEntity,
  v1Progression,
  v1StoredEntities,
} from "@/server/routers/v1/schemas/entities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";

/** Only a kind's entities that its ruleset (a fork) has of its own. */
const childOnly = z
  .stringbool()
  .optional()
  .meta({ description: "Only those the ruleset has of its own, not its parent's" });

/**
 * An entity's body, its create's, update's and duplicate's, as it stores it: its name, its description, its fields by
 * stored name and its links by role, which its kind's rules read and check.
 */
const entityBody = z.strictObject({
  description: z
    .string()
    .optional()
    .transform((value) => value || null),
  fields: entityFields.optional().meta({ description: "Its fields, by the names its rules declare them" }),
  links: entityLinks.optional().meta({ description: "The entities it names, by role" }),
  name: z.string().min(1),
  updatedAt: z.string().optional().meta({ description: "When it was read: an update's, refused if it changed (409)" }),
});

/** A route's ruleset (`:id`) and entity kind (`:kind`): a kind no other owns, as the rules name it. */
const kindParams = idParam.extend({
  kind: z
    .string()
    .pipe(z.enum(Engine.storage().standaloneKinds()))
    .meta({ description: "The entity kind, one of the `kinds` `GET /v1/rules` lists" }),
});

/** A route's entity: its kind's params, and its id. */
const entityParams = kindParams.extend({ entityId: z.string().uuid() });

/** A route's link from an entity: its entity's params, and the entity it links to. */
const linkParams = entityParams.extend({ targetId: z.string().uuid() });

/** An owned entity's body, its create's and update's. */
const ownedBody = z.strictObject({
  fields: entityFields.optional(),
  links: entityLinks.optional().meta({ description: "Its links, by the roles its kind's fields declare" }),
  position: z.number().optional().meta({ description: "Its place among its owner's" }),
  updatedAt: z.string().optional(),
});

/** A route's owned entity by its id alone: its owner's kind's params, and its id. */
const ownedByIdParams = kindParams.extend({ ownedId: z.string().uuid() });

/** A route's entity's owned entity: its entity's params, and its id. */
const ownedParams = entityParams.extend({ ownedId: z.string().uuid() });

/** A route's entity's table: its entity's params, and the table's name. */
const tableParams = entityParams.extend({
  table: z.string().meta({
    description: "The table, as the rules name it",
  }),
});

/**
 * A ruleset's entities of every kind, by its route's `kind` (one `GET /v1/rules` lists), each answered by its kind's
 * rules: a page of them, with its kind's filters past the shared ones, a page of its groups, its templates, one entity,
 * and the parts its kind may have: the entities it owns (and one by its id alone), its links, its progression and its
 * tables.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/entities/:kind",
    describeRoute({
      response: v1EntityPage,
      status: 200,
      summary: "A ruleset's entities of a kind, a page at a time, filtered by what the kind takes",
    }),
    validate("param", kindParams),
    validate(
      "query",
      z
        .looseObject({
          ...PAGE_FILTERS,
          childOnly,
          orderBy: entityOrderBy,
          orderDir: orderDirAsc,
          search: z.string().optional().meta({ description: "A part of the name" }),
        })
        .meta({
          description:
            "Past these, the filters the kind's rules take, each by the field or the link role it filters (as " +
            "`GET /v1/rules` names them), `tier` for a tiered kind and `partition` for a partitioned one; another " +
            "is refused",
        }),
    ),
    async (c) => {
      const { id, kind } = c.req.valid("param");
      const { childOnly, limit, orderBy, orderDir, page, search, ...filters } = c.req.valid("query");
      const entities = await EntitiesService.getEntities(
        c.var.requestSession,
        id,
        kind,
        { childOnly, orderBy, orderDir, search, ...filters },
        { limit, page },
      );
      return c.json(V1.page(entities, V1.entitySummary), 200);
    },
  )
  .get(
    "/:id/entities/:kind/grouped",
    describeRoute({
      response: v1EntityGroupPage,
      status: 200,
      summary: "A kind's entities by group, a page at a time: each group, or an entity in none",
    }),
    validate("param", kindParams),
    validate(
      "query",
      z.looseObject({
        ...PAGE_FILTERS,
        childOnly,
        family: z.string().optional().meta({ description: "A group's name, whose entities it lists" }),
        search: z.string().optional().meta({ description: "A part of the name" }),
      }),
    ),
    async (c) => {
      const { id, kind } = c.req.valid("param");
      const { childOnly, family, limit, page, search, ...filters } = c.req.valid("query");
      const groups = await EntitiesService.getEntityGroups(
        c.var.requestSession,
        id,
        kind,
        { childOnly, family, search, ...filters },
        { limit, page },
      );
      return c.json(V1.page(groups, V1.entityGroup), 200);
    },
  )
  .get(
    "/:id/entities/:kind/owned/:ownedId",
    describeRoute({
      response: v1OwnedEntity,
      status: 200,
      summary: "An entity another owns, by its id alone, with its modifiers and requirements",
    }),
    validate("param", ownedByIdParams),
    async (c) => {
      const { id, kind, ownedId } = c.req.valid("param");
      const owned = await EntitiesService.getOwnedEntityWithOwner(c.var.requestSession, id, kind, ownedId);
      return c.json(V1.ownedEntity(owned), 200);
    },
  )
  .get(
    "/:id/entities/:kind/templates",
    describeRoute({
      response: v1StoredEntities,
      status: 200,
      summary: "A kind's templates, each as it's stored, which a new entity copies",
    }),
    validate("param", kindParams),
    validate("query", z.object({ type: z.string().optional().meta({ description: "Only templates of a type" }) })),
    async (c) => {
      const { id, kind } = c.req.valid("param");
      const { type } = c.req.valid("query");
      const templates = await EntitiesService.getTemplates(c.var.requestSession, id, kind, type);
      return c.json(templates.map(V1.storedEntity), 200);
    },
  )
  .get(
    "/:id/entities/:kind/:entityId",
    describeRoute({
      response: v1Entity,
      status: 200,
      summary: "An entity, with what its kind adds: its modifiers and requirements, where a character may place it",
    }),
    validate("param", entityParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      return c.json(V1.entity(await EntitiesService.getEntity(c.var.requestSession, id, kind, entityId)), 200);
    },
  )
  .get(
    "/:id/entities/:kind/:entityId/links",
    describeRoute({
      response: v1EntityLinks,
      status: 200,
      summary: "The links an entity edits, of the role its kind's `links` names",
    }),
    validate("param", entityParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const links = await EntitiesService.getEntityLinks(c.var.requestSession, id, kind, entityId);
      return c.json(V1.entityLinks(links), 200);
    },
  )
  .get(
    "/:id/entities/:kind/:entityId/owned",
    describeRoute({
      response: v1OwnedEntities,
      status: 200,
      summary: "The entities an entity owns",
    }),
    validate("param", entityParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const owned = await EntitiesService.getOwnedEntities(c.var.requestSession, id, kind, entityId);
      return c.json(owned.map(V1.ownedEntity), 200);
    },
  )
  .get(
    "/:id/entities/:kind/:entityId/progression",
    describeRoute({
      response: v1Progression,
      status: 200,
      summary: "What an entity's levels give: each pool's picks by level, and the values its rules name",
    }),
    validate("param", entityParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const progression = await EntitiesService.getProgression(c.var.requestSession, id, kind, entityId);
      return c.json(V1.progression(progression), 200);
    },
  )
  .get(
    "/:id/entities/:kind/:entityId/tables/:table",
    describeRoute({
      response: v1EntityTable,
      status: 200,
      summary: "One of an entity's tables, a row a level",
    }),
    validate("param", tableParams),
    async (c) => {
      const { entityId, id, kind, table } = c.req.valid("param");
      const rows = await EntitiesService.getEntityTable(c.var.requestSession, id, kind, entityId, table);
      return c.json(V1.entityTable(rows), 200);
    },
  )
  .post(
    "/:id/entities/:kind",
    describeRoute({ response: v1Entity, status: 201, summary: "Creates an entity of a kind" }),
    validate("param", kindParams),
    validate("json", entityBody),
    async (c) => {
      const { id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await EntitiesService.createEntity(c.var.requestSession, id, kind, body);
      return c.json(V1.entity(await EntitiesService.getEntity(c.var.requestSession, id, kind, created.id)), 201);
    },
  )
  .post(
    "/:id/entities/:kind/:entityId/duplicate",
    describeRoute({ response: v1Entity, status: 201, summary: "Duplicates an entity under the body's name" }),
    validate("param", entityParams),
    validate("json", entityBody),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await EntitiesService.duplicateEntity(c.var.requestSession, id, kind, entityId, body);
      return c.json(V1.entity(await EntitiesService.getEntity(c.var.requestSession, id, kind, created.id)), 201);
    },
  )
  .post(
    "/:id/entities/:kind/:entityId/links",
    describeRoute({
      response: v1EntityLinks,
      status: 200,
      summary: "Adds a link an entity edits, answering its links",
    }),
    validate("param", entityParams),
    validate("json", z.object({ targetId: z.string().uuid() })),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const { targetId } = c.req.valid("json");
      await EntitiesService.addEntityLink(c.var.requestSession, id, kind, entityId, targetId);
      const links = await EntitiesService.getEntityLinks(c.var.requestSession, id, kind, entityId);
      return c.json(V1.entityLinks(links), 200);
    },
  )
  .post(
    "/:id/entities/:kind/:entityId/owned",
    describeRoute({
      response: v1OwnedEntity,
      status: 201,
      summary: "Creates an entity another owns",
    }),
    validate("param", entityParams),
    validate("json", ownedBody),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await EntitiesService.createOwnedEntity(c.var.requestSession, id, kind, entityId, body);
      const owned = await EntitiesService.getOwnedEntityWithOwner(c.var.requestSession, id, kind, created.id);
      return c.json(V1.ownedEntity(owned), 201);
    },
  )
  .post(
    "/:id/entities/:kind/:entityId/variants",
    describeRoute({
      response: z.array(v1Entity),
      status: 201,
      summary: "Creates an entity's variants, each a copy under its own name",
    }),
    validate("param", entityParams),
    validate(
      "json",
      z.object({
        variants: z
          .array(
            z.object({
              description: z
                .string()
                .optional()
                .transform((value) => value || null),
              name: z.string().min(1),
            }),
          )
          .min(1),
      }),
    ),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const { variants } = c.req.valid("json");
      const created = await EntitiesService.createVariants(c.var.requestSession, id, kind, entityId, variants);
      const entities = [];
      for (const variant of created)
        entities.push(V1.entity(await EntitiesService.getEntity(c.var.requestSession, id, kind, variant.id)));
      return c.json(entities, 201);
    },
  )
  .put(
    "/:id/entities/:kind/:entityId",
    describeRoute({
      response: v1Entity,
      status: 200,
      summary: "Updates an entity: a fork's copy of its parent's, when it's inherited, which answers its own id",
    }),
    validate("param", entityParams),
    validate("json", entityBody),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await EntitiesService.updateEntity(c.var.requestSession, id, kind, entityId, body);
      return c.json(V1.entity(await EntitiesService.getEntity(c.var.requestSession, id, kind, updated.id)), 200);
    },
  )
  .put(
    "/:id/entities/:kind/:entityId/owned/:ownedId",
    describeRoute({
      response: v1OwnedEntity,
      status: 200,
      summary: "Updates an entity another owns",
    }),
    validate("param", ownedParams),
    validate("json", ownedBody),
    async (c) => {
      const { entityId, id, kind, ownedId } = c.req.valid("param");
      const body = c.req.valid("json");
      const updated = await EntitiesService.updateOwnedEntity(c.var.requestSession, id, kind, entityId, ownedId, body);
      const owned = await EntitiesService.getOwnedEntityWithOwner(c.var.requestSession, id, kind, updated.id);
      return c.json(V1.ownedEntity(owned), 200);
    },
  )
  .put(
    "/:id/entities/:kind/:entityId/progression",
    describeRoute({
      response: v1Progression,
      status: 200,
      summary: "Saves what an entity's levels give at once",
    }),
    validate("param", entityParams),
    validate(
      "json",
      z
        .looseObject({
          ownedTokens: z
            .array(z.object({ id: z.string().uuid(), updatedAt: z.string() }))
            .optional()
            .meta({ description: "Each level's `updatedAt` as it was read: refused if one changed since (409)" }),
        })
        .meta({
          description:
            "Past its tokens, the progression as the kind's rules take it: what `…/progression` answers of it",
        }),
    ),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const saved = await EntitiesService.updateProgression(c.var.requestSession, id, kind, entityId, body);
      const progression = await EntitiesService.getProgression(c.var.requestSession, id, kind, saved.entityId);
      return c.json(V1.progression(progression), 200);
    },
  )
  .delete(
    "/:id/entities/:kind/:entityId",
    describeRoute({ response: null, status: 204, summary: "Deletes an entity" }),
    validate("param", entityParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      await EntitiesService.deleteEntity(c.var.requestSession, id, kind, entityId);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/entities/:kind/:entityId/links/:targetId",
    describeRoute({ response: null, status: 204, summary: "Removes a link an entity edits" }),
    validate("param", linkParams),
    async (c) => {
      const { entityId, id, kind, targetId } = c.req.valid("param");
      await EntitiesService.removeEntityLink(c.var.requestSession, id, kind, entityId, targetId);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/entities/:kind/:entityId/owned/:ownedId",
    describeRoute({ response: null, status: 204, summary: "Deletes an entity another owns" }),
    validate("param", ownedParams),
    async (c) => {
      const { entityId, id, kind, ownedId } = c.req.valid("param");
      await EntitiesService.deleteOwnedEntity(c.var.requestSession, id, kind, entityId, ownedId);
      return c.body(null, 204);
    },
  );
