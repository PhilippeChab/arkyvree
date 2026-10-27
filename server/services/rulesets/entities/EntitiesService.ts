import type { Db } from "@/drizzle/database.ts";
import { Engine, type EntityAction, type EntityCopies } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, RULESET_ENTITY_TYPES, type RulesetEntityType } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import { Copies } from "./concerns/Copies.ts";
import { Links } from "./concerns/Links.ts";
import { Owned } from "./concerns/Owned.ts";
import { Progressions } from "./concerns/Progressions.ts";
import EntityWriter, { type EntityBody } from "./EntityWriter.ts";
import type { EntityRow, ListWhere, Pagination } from "./rows.ts";

/** Every entity kind's type, which the routes by kind take. */
export const ENTITY_TYPES: readonly RulesetEntityType[] = RULESET_ENTITY_TYPES;

/**
 * A ruleset's entities by their kind (`type`), whatever it is, as its kind's rules answer them
 * (`Engine.for(scope).entities(type)`): its list, read by the filters its rules take, and its groups, its page, and
 * what its form writes (`EntityWriter`), checked against the copies a plan reaches. An action a kind has none of (an
 * ability's create, a race's templates) its rules refuse as not found. Its copies (`Copies`: its templates, variants),
 * and an entity's parts its kind may have: the entities it owns (`Owned`: a class's levels), the links it edits
 * (`Links`: a class's skills), its progression (`Progressions`) and its tables.
 */
class EntitiesService extends include(Object, Copies, Links, Owned, Progressions) {
  /** A kind's writer for an action (`action`), which opens its rules for it first: refused when it has none of it. */
  private writerOf(type: RulesetEntityType, action: EntityAction) {
    return new EntityWriter(type, (scope) => Engine.for(scope).entities(type, action));
  }

  /** The copies a plan reaches (`copies`: a template's, in its view and the rulesets built on it), by its check. */
  private async checkCopies(
    tx: Db,
    { ruleset, rulesetData }: RulesetScope,
    type: RulesetEntityType,
    copies: EntityCopies | undefined,
  ) {
    if (!copies) return;
    const rows = await Entities.findList(tx, {
      entityType: type,
      rulesetId: ruleset.id,
      ...rulesetData.cow.listFilters,
      ...copies.filters,
      lineage: true,
      order: "id",
    });
    copies.check(rows);
  }

  /**
   * A new entity of a kind off its form. Named as an ancestor its ruleset deleted, it stands in for it
   * (`EntityNames.repointTombstone`), and its kind's rules read the ancestor's stored row when they take after it (a
   * feat takes its mark).
   */
  async createEntity<R = EntityRow>(session: Session, rulesetId: string, type: RulesetEntityType, body: EntityBody) {
    const created = await this.writerOf(type, "create").create(
      session,
      rulesetId,
      body.name,
      async (scope, { tombstoneAncestorId, tx }) => {
        const kind = Engine.for(scope).entities(type);
        const ancestor =
          tombstoneAncestorId && kind.takesAfterAncestor
            ? await Entities.findOne(tx, { entityType: type, id: tombstoneAncestorId })
            : undefined;
        return kind.planCreate(body, ancestor);
      },
    );
    return created as R;
  }

  async deleteEntity<R = EntityRow>(session: Session, rulesetId: string, type: RulesetEntityType, entityId: string) {
    const deleted = await this.writerOf(type, "delete").delete(session, rulesetId, entityId, async (scope, { tx }) => {
      const plan = Engine.for(scope).entities(type).planDelete(entityId);
      await this.checkCopies(tx, scope, type, plan.copies);
      return plan;
    });
    return deleted as R;
  }

  /**
   * A duplicate of an entity (`sourceId`), as its kind's rules plan it (an item points at the same template, and takes
   * its source's customizations when its source isn't one).
   */
  async duplicateEntity<R = EntityRow>(
    session: Session,
    rulesetId: string,
    type: RulesetEntityType,
    sourceId: string,
    body: EntityBody,
  ) {
    const created = await this.writerOf(type, "duplicate").create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities(type).planDuplicate(sourceId, body),
    );
    return created as R;
  }

  /** A page of a kind's list, as its query asks for it (`where`), each row as its kind's rules describe it. */
  async getEntities<R = EntityRow>(
    rulesetId: string,
    type: RulesetEntityType,
    { childOnly, orderBy, orderDir, search, ...filters }: ListWhere,
    pagination: Pagination,
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const list = Engine.for(scope)
        .entities(type)
        .openList({ childOnly, ...filters });
      const result = await Entities.findPage(
        db,
        {
          entityType: type,
          rulesetId,
          ...scope.rulesetData.cow.listFilters,
          childOnly,
          orderBy,
          orderDir,
          search,
          ...list.filters,
        },
        pagination,
      );
      return { ...result, items: list.describe(result.items) as R[] };
    });
  }

  async getEntity<R = EntityRow>(rulesetId: string, type: RulesetEntityType, entityId: string) {
    return await withRulesetScope(
      db,
      rulesetId,
      async (scope) => Engine.for(scope).entities(type).describe(entityId) as unknown as R,
    );
  }

  /** A page of a kind's groups (a feat's families), as its query asks for it (`where`): refused for a kind without. */
  async getEntityGroups(
    rulesetId: string,
    type: RulesetEntityType,
    { childOnly, search, ...filters }: Pick<ListWhere, "childOnly" | "search"> & Record<string, unknown>,
    pagination: Pagination,
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { groupFilters } = Engine.for(scope)
        .entities(type)
        .openGroups({ childOnly, ...filters });
      return await Entities.findGroupPage(
        db,
        {
          entityType: type,
          rulesetId,
          ...scope.rulesetData.cow.listFilters,
          ...groupFilters,
          childOnly,
          search,
        },
        pagination,
      );
    });
  }

  /** One of an entity's tables (`table`, by name: a class's spells per day): refused for a table it has none of. */
  async getEntityTable(rulesetId: string, type: RulesetEntityType, entityId: string, table: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).tables(type, entityId).describe(table),
    );
  }

  /** An entity's update off its form, checked against the copies its plan reaches (a template's type change). */
  async updateEntity<R = EntityRow>(
    session: Session,
    rulesetId: string,
    type: RulesetEntityType,
    entityId: string,
    body: EntityBody,
  ) {
    const updated = await this.writerOf(type, "update").update(session, rulesetId, body, async (scope, { tx }) => {
      const plan = Engine.for(scope).entities(type).planEdit(entityId, body);
      await this.checkCopies(tx, scope, type, plan.copies);
      return plan;
    });
    return updated as R;
  }
}

export default new EntitiesService();
