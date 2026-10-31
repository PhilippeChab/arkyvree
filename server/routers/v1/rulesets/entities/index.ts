import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { entityOrderBy, orderDirAsc } from "@/server/routers/api/validation.ts";
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
import { entityParams, kindParams, PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";

/** Only a kind's entities that its ruleset (a fork) has of its own. */
const childOnly = z
  .stringbool()
  .optional()
  .meta({ description: "Only those the ruleset has of its own, not its parent's" });

/** A route's owned entity by its id alone: its owner's kind's params, and its id. */
const ownedByIdParams = kindParams.extend({ ownedId: z.string().uuid() });

/** A route's entity's table: its entity's params, and the table's name. */
const tableParams = entityParams.extend({
  table: z.string().meta({ description: "The table: a class's `feat-pools`, `spells`, `spells-known`, `spell-lists`" }),
});

/**
 * A ruleset's entities of every kind, by its route's `kind` (`feats`, `classes`…), each answered by its kind's rules:
 * a page of them, with its kind's filters past the shared ones (`listedIn`, `partition`…), a page of its groups (a
 * feat's families), its templates (an item's), one entity, and the parts its kind may have: the entities it owns (a
 * class's levels, and one by its id alone), its links (a class's skills), its progression and its tables.
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
            "Past these, a kind's own filters: a feat's or a spell's `listedIn` (a pool or a list), a spell's `tier`, " +
            "a race's or a class's `partition`, an item's `ITEM_IS_TEMPLATE`, an aptitude's `scope`",
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
      summary: "A kind's entities by group (a feat's family), a page at a time: each group, or an entity in none",
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
      summary: "An entity another owns (a class's level), by its id alone, with its modifiers and requirements",
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
      summary: "A kind's templates (an item's), each as it's stored, which a new entity copies",
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
      summary: "An entity, with what its kind adds: its modifiers and requirements, an item's placement",
    }),
    validate("param", entityParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      return c.json(V1.entity(await EntitiesService.getEntity(c.var.requestSession, id, kind, entityId)), 200);
    },
  )
  .get(
    "/:id/entities/:kind/:entityId/links",
    describeRoute({ response: v1EntityLinks, status: 200, summary: "The links an entity edits (a class's skills)" }),
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
      summary: "The entities an entity owns (a class's levels)",
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
      summary: "What an entity's levels give (a class's): each pool's picks by level, and its spell list",
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
      summary: "One of an entity's tables (a class's spells per day), a row a level",
    }),
    validate("param", tableParams),
    async (c) => {
      const { entityId, id, kind, table } = c.req.valid("param");
      const rows = await EntitiesService.getEntityTable(c.var.requestSession, id, kind, entityId, table);
      return c.json(V1.entityTable(rows), 200);
    },
  );
