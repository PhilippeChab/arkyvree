import { Engine, type EntityForm } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import type { RulesetEntityType } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/entities/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The entities an entity owns (a class's levels), of its kind (`type`, the owner's), as its kind's rules answer them
 * (`Engine.for(scope).owned(type, ownerId)`): their list, one described by its id alone, and their creates, edits
 * and deletes, each written on the owner the view's resolves to (its copy, made on its first edit) and recorded as its
 * kind's activity.
 */
export function Owned<B extends Constructor>(Base: B) {
  abstract class WithOwned extends Base {
    /** A new entity the owner (`ownerId`) owns, off its form (`EntityWriter.createOwned`). */
    async createOwnedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      body: EntityForm,
    ) {
      return await new EntityWriter(type).createOwned(session, rulesetId, (scope) => {
        const owned = Engine.for(scope).owned(type, ownerId);
        return { plan: owned.planCreate(body), type: owned.type };
      });
    }

    /** An owned entity's delete (`ownedId`, of `ownerId`: `EntityWriter.deleteOwned`). */
    async deleteOwnedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      ownedId: string,
    ) {
      return await new EntityWriter(type).deleteOwned(session, rulesetId, ownedId, {
        // The owned kind its owner's declares, which its in-use check reads before the access and the owner itself
        ownedType: (scope) => Engine.for(scope).entities(type).ownedType,
        plan: (scope) => {
          const owned = Engine.for(scope).owned(type, ownerId);
          return { plan: owned.planDelete(ownedId), type: owned.type };
        },
      });
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

    /** An owned entity's edit (`ownedId`, of `ownerId`) off its form (`EntityWriter.updateOwned`). */
    async updateOwnedEntity(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      ownedId: string,
      body: EntityForm & { updatedAt?: string },
    ) {
      const { updatedAt, ...form } = body;
      return await new EntityWriter(type).updateOwned(session, rulesetId, updatedAt, (scope) => {
        const owned = Engine.for(scope).owned(type, ownerId);
        return { plan: owned.planEdit(ownedId, form), type: owned.type };
      });
    }
  }
  return WithOwned;
}
