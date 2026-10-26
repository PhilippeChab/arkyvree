import { Engine, type EntityForm } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { CustomizationEdit, EntityEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Entities, type ReferencedType, type RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import { createLinks, setLinks } from "@/server/services/rulesets/linkWrites.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The entities an entity owns (a class's levels), of its kind (`type`, the owner's), as its kind's rules answer them
 * (`Engine.for(scope).owned(type, ownerId)`): their list, one described by its id alone, and their creates, edits
 * and deletes, each written on the owner the view's resolves to (its copy, made on its first edit) and recorded as its
 * kind's activity.
 */
export function Owned<B extends Constructor>(Base: B) {
  abstract class WithOwned extends Base {
    /**
     * A new entity the owner (`ownerId`) owns, off its form: the owner copied when it's inherited (the new row would
     * otherwise be the source ruleset's), its row, its links and what its form writes beside it.
     */
    async createOwnedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      body: EntityForm,
    ) {
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset } = scope;

            (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
            const owned = Engine.for(scope).owned(type, ownerId);
            const plan = owned.planCreate(body);

            const { id: targetOwnerId } = await new EntityEdit(ruleset).cowToEdit(tx, type, plan.owner);
            const [row] = await Entities.create(tx, owned.type, { ...plan.row, ownerId: targetOwnerId });
            await createLinks(tx, { entityId: row.id, entityType: owned.type }, plan.links ?? []);
            if (plan.writes)
              await writeEntityWrites(tx, scope, { entityId: row.id, entityType: owned.type }, plan.writes);

            await createActivityWithNotifications(tx, {
              userId: session.userId,
              targetId: row.id,
              targetType: owned.type,
              type: `create${getActivityName(owned.type)}`,
              data: plan.activity,
            });

            // Its row, as its kind's rules find one: its record, its fields among it
            return row as unknown as ReturnType<typeof owned.find>;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }

    /**
     * An owned entity's delete (`ownedId`, of `ownerId`): refused while a character names it, the owner copied when
     * it's inherited (the delete would otherwise remove the source ruleset's row), and its row deleted, with its links
     * and customizations.
     */
    async deleteOwnedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      ownedId: string,
    ) {
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset, rulesetData } = scope;

            // What's in use and the access first, by the owned kind its owner's declares, then the owner itself
            const { ownedType } = Engine.for(scope).entities(type);
            const ids = rulesetData.cow.getEquivalentIds(ownedId);
            const inUse = ownedType ? await hasCharacterPicks(tx, ownedType as ReferencedType, ids, rulesetId) : false;
            (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });
            const owned = Engine.for(scope).owned(type, ownerId);
            const plan = owned.planDelete(ownedId);

            const edit = new CustomizationEdit(ruleset, rulesetData.cow);
            const targetId = await edit.cowOwner(tx, owned.type, plan.entity.id);

            // The database deletes its links and its customizations with it
            const [row] = await Entities.delete(tx, { entityType: owned.type, id: targetId });

            await createActivityWithNotifications(tx, {
              userId: session.userId,
              targetId: row.id,
              targetType: owned.type,
              type: `delete${getActivityName(owned.type)}`,
              data: plan.activity,
            });

            return row as unknown as ReturnType<typeof owned.find>;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }

    /** The entities an owner owns (`ownerId`), each with its details. */
    async getOwnedEntities(rulesetId: string, type: RulesetEntityType, ownerId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) =>
        Engine.for(scope).owned(type, ownerId).describeAll(),
      );
    }

    /** An owned entity by its id alone (`ownedId`), with its owner's name, as its page shows it. */
    async getOwnedEntityWithOwner(rulesetId: string, type: RulesetEntityType, ownedId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).describeOwned(type, ownedId));
    }

    /**
     * An owned entity's edit (`ownedId`, of `ownerId`) off its form: the owner copied when it's inherited, the row the
     * entity resolves to touched, refused when stale (`updatedAt`: a copy's never is, its token is its source's), and
     * what its form writes beside it and its links, its activity recording what it changes (`changedFields`).
     */
    async updateOwnedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      ownedId: string,
      body: EntityForm & { updatedAt?: string },
    ) {
      const { updatedAt, ...form } = body;
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            const { ruleset, rulesetData } = scope;

            (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
            const owned = Engine.for(scope).owned(type, ownerId);
            const plan = owned.planEdit(ownedId, form);

            const edit = new CustomizationEdit(ruleset, rulesetData.cow);
            const targetId = await edit.cowOwner(tx, owned.type, plan.entity.id);

            const expectedUpdatedAt = targetId === plan.entity.id ? updatedAt : undefined;
            const rows = await Entities.update(tx, owned.type, plan.row, { id: targetId, expectedUpdatedAt });
            if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

            if (plan.writes)
              await writeEntityWrites(tx, scope, { entityId: targetId, entityType: owned.type }, plan.writes);
            await setLinks(tx, { entityId: targetId, entityType: owned.type }, plan.links);

            await createActivityWithNotifications(tx, {
              userId: session.userId,
              targetId,
              targetType: owned.type,
              type: `update${getActivityName(owned.type)}`,
              data: { ...plan.activity, changedFields: plan.changes },
            });

            return rows[0] as unknown as ReturnType<typeof owned.find>;
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }
  }
  return WithOwned;
}
