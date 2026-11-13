import { and, eq, inArray, isNotNull, notExists, or, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  charactersInCharacter,
  entitiesInRules,
  modifiersInCustomization,
  nameBindingsInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import type { NameBindingDraft } from "@/shared/customization/nameBindings.ts";

/** A binding to store: what a name means, and the modifier or the requirement it's a name of. */
type NewNameBinding = NameBindingDraft & ({ modifierId: string } | { requirementId: string });

/** How many bindings one insert carries: well under what a statement's parameters hold. */
const BATCH_SIZE = 1000;

/**
 * What the names in the modifiers' and requirements' paths mean, kept beside their text: read with a ruleset's rows,
 * written with a row's save, and moved when what a name means leaves a ruleset for what stands in its place (an
 * unsubscribe). A row's bindings go with it (their foreign keys cascade).
 */
class NameBindingsRepository extends BaseRepository<typeof nameBindingsInCustomization> {
  constructor() {
    super(nameBindingsInCustomization);
  }

  /**
   * The bindings of the rows a ruleset holds (`rulesetId`): its entities' modifiers and requirements, its modifiers'
   * own requirements, and the modifiers set on its characters.
   */
  private ownedBy(db: Db, rulesetId: string) {
    const entities = db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.rulesetId, rulesetId));
    const modifiers = db
      .select({ id: modifiersInCustomization.id })
      .from(modifiersInCustomization)
      .where(inArray(modifiersInCustomization.sourceId, entities));
    const requirements = db
      .select({ id: requirementsInCustomization.id })
      .from(requirementsInCustomization)
      .where(
        or(
          inArray(requirementsInCustomization.entityId, entities),
          inArray(requirementsInCustomization.entityId, modifiers),
        ),
      );
    const characters = db
      .select({ id: charactersInCharacter.id })
      .from(charactersInCharacter)
      .where(eq(charactersInCharacter.rulesetId, rulesetId));
    const set = db
      .select({ id: modifiersInCustomization.id })
      .from(modifiersInCustomization)
      .where(
        and(
          eq(modifiersInCustomization.sourceType, "characters"),
          inArray(modifiersInCustomization.sourceId, characters),
        ),
      );
    return or(
      inArray(this.table.modifierId, modifiers),
      inArray(this.table.modifierId, set),
      inArray(this.table.requirementId, requirements),
    )!;
  }

  /** Stores bindings, each with the ruleset its entity is in, as stored now. */
  async createMany(db: Db, values: NewNameBinding[]) {
    if (values.length === 0) return [];
    const entityIds = [...new Set(values.flatMap((value) => value.entityId ?? []))];
    const entities =
      entityIds.length === 0
        ? []
        : await db
            .select({ id: entitiesInRules.id, rulesetId: entitiesInRules.rulesetId })
            .from(entitiesInRules)
            .where(inArray(entitiesInRules.id, entityIds));
    const rulesetOf = new Map(entities.map((entity) => [entity.id, entity.rulesetId]));
    const rows = values.map((value) => ({
      ...value,
      rulesetId: value.entityId === null ? null : rulesetOf.get(value.entityId),
    }));
    const created = [];
    // In batches a statement's parameters hold, and past a binding another write stored at the same place meanwhile
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      created.push(...(await db.insert(this.table).values(batch).onConflictDoNothing().returning()));
    }
    return created;
  }

  /** Removes a row's bindings: a save that changes its paths stores them anew. */
  async delete(db: Db, where: { modifierId: string } | { requirementId: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "modifierId" in where && eq(this.table.modifierId, where.modifierId),
          "requirementId" in where && eq(this.table.requirementId, where.requirementId),
        ]),
      )
      .returning();
  }

  /** The bindings of modifiers and of requirements, by their ids. */
  async findMany(db: Db, where: { modifierIds: string[]; requirementIds: string[] }) {
    if (where.modifierIds.length === 0 && where.requirementIds.length === 0) return [];
    return await db
      .select()
      .from(this.table)
      .where(
        or(
          where.modifierIds.length > 0 ? inArray(this.table.modifierId, where.modifierIds) : sql`false`,
          where.requirementIds.length > 0 ? inArray(this.table.requirementId, where.requirementIds) : sql`false`,
        ),
      )
      .orderBy(this.table.field, this.table.path, this.table.segment);
  }

  /** Of `entityIds`, those the bindings of a ruleset's rows (`rulesetId`) name: what an unsubscribe has to move. */
  async findNamed(db: Db, where: { entityIds: string[]; rulesetId: string }): Promise<string[]> {
    if (where.entityIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ entityId: this.table.entityId })
      .from(this.table)
      .where(and(inArray(this.table.entityId, where.entityIds), this.ownedBy(db, where.rulesetId)));
    return rows.flatMap((row) => row.entityId ?? []);
  }

  /**
   * The rows a ruleset's entities carry (`rulesetId`: their modifiers, their requirements, their modifiers' own) that
   * this transaction made and that have no binding yet: what a write binds before it ends.
   */
  async findUnbound(db: Db, where: { rulesetId: string }) {
    const entities = db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.rulesetId, where.rulesetId));
    const bound = (owner: SQL) =>
      db
        .select({ one: sql`1` })
        .from(this.table)
        .where(owner);
    const modifiers = await db
      .select({
        id: modifiersInCustomization.id,
        operator: modifiersInCustomization.operator,
        target: modifiersInCustomization.target,
        value: modifiersInCustomization.value,
      })
      .from(modifiersInCustomization)
      .where(
        and(
          inArray(modifiersInCustomization.sourceId, entities),
          sql`${modifiersInCustomization.createdAt} = now()`,
          notExists(bound(eq(this.table.modifierId, modifiersInCustomization.id))),
        ),
      );
    const gates = db
      .select({ id: modifiersInCustomization.id })
      .from(modifiersInCustomization)
      .where(inArray(modifiersInCustomization.sourceId, entities));
    const requirements = await db
      .select({
        id: requirementsInCustomization.id,
        operator: requirementsInCustomization.operator,
        target: requirementsInCustomization.target,
        value: requirementsInCustomization.value,
      })
      .from(requirementsInCustomization)
      .where(
        and(
          isNotNull(requirementsInCustomization.target),
          sql`${requirementsInCustomization.createdAt} = now()`,
          or(
            inArray(requirementsInCustomization.entityId, entities),
            inArray(requirementsInCustomization.entityId, gates),
          ),
          notExists(bound(eq(this.table.requirementId, requirementsInCustomization.id))),
        ),
      );
    return [
      ...modifiers.map((row) => ({ ...row, of: "modifier" as const })),
      ...requirements.map((row) => ({ ...row, of: "requirement" as const })),
    ];
  }

  /** The modifiers set on the characters of a ruleset (`rulesetId`) that have no binding: what a fill binds. */
  async findUnboundOfCharacters(db: Db, where: { rulesetId: string }) {
    const characters = db
      .select({ id: charactersInCharacter.id })
      .from(charactersInCharacter)
      .where(eq(charactersInCharacter.rulesetId, where.rulesetId));
    return await db
      .select({
        id: modifiersInCustomization.id,
        operator: modifiersInCustomization.operator,
        target: modifiersInCustomization.target,
        value: modifiersInCustomization.value,
      })
      .from(modifiersInCustomization)
      .where(
        and(
          eq(modifiersInCustomization.sourceType, "characters"),
          inArray(modifiersInCustomization.sourceId, characters),
          notExists(
            db
              .select({ one: sql`1` })
              .from(this.table)
              .where(eq(this.table.modifierId, modifiersInCustomization.id)),
          ),
        ),
      );
  }

  /**
   * Points the bindings of a ruleset's rows (`rulesetId`) that name `where.entityId` at `values.entityId`, which
   * stands in its place once it leaves the ruleset's view, in the ruleset the new entity is in.
   */
  async update(db: Db, values: { entityId: string }, where: { entityId: string; rulesetId: string }) {
    return await db
      .update(this.table)
      .set({
        entityId: values.entityId,
        rulesetId: sql`(SELECT ${entitiesInRules.rulesetId} FROM ${entitiesInRules} WHERE ${entitiesInRules.id} = ${values.entityId})`,
      })
      .where(and(eq(this.table.entityId, where.entityId), this.ownedBy(db, where.rulesetId)))
      .returning();
  }
}

export default NameBindingsRepository;
