import type { Db } from "@/drizzle/database.ts";
import { Engine, type ProgressionForm, type ProgressionPlan } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { EntityEdit, type RulesetScope, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Entities, Modifiers, type RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import { setLinks } from "@/server/services/rulesets/linkWrites.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The entity row a progression's save writes: the ruleset's own, or the copy of an inherited one, and what it copied.
 */
interface TargetOwner {
  /**
   * The entity was copied: its owned entities' modifiers are their sources' copies, by their sources' ids (`copiedIds`)
   */
  copied: boolean;
  copiedIds: ReadonlyMap<string, string>;
  id: string;
  updatedAt: string;
}

/**
 * An entity's progression (a class's levels at once), as its kind's rules answer it
 * (`Engine.for(scope).progression(type, ownerId)`): what its tabs read, and one save of it all, in one transaction, its
 * owned entities' edits and modifiers, recorded as the kind's progression activity.
 */
export function Progressions<B extends Constructor>(Base: B) {
  abstract class WithProgressions extends Base {
    /**
     * The entity row a progression's save writes (`owner`, of `type`, as the view has it): the ruleset's own, locked,
     * its owned entities' writes waiting on other saves of it (its own columns aren't written, nor its token moved: its
     * owned entities' tokens check the save), or the copy of an inherited one, with its owned entities and their
     * customizations.
     */
    private async targetOwner(
      tx: Db,
      scope: RulesetScope,
      type: RulesetEntityType,
      { gone, owner }: Pick<ProgressionPlan, "gone" | "owner">,
    ): Promise<TargetOwner> {
      const target = await new EntityEdit(scope.ruleset).cowToEdit(tx, type, owner);
      if (!target.copied) await EntityEdit.lock(tx, target.id);
      const row = await Entities.findOne(tx, { entityType: type, id: target.id });
      if (!row) throw new NotFoundError(gone.owner);
      return { copied: target.copied, copiedIds: target.copiedIds, id: target.id, updatedAt: row.updatedAt };
    }

    /**
     * Writes each owned entity a progression's save changes on the target owner's of its place on its track (a copy's
     * own, once the owner was copied): its `updatedAt` moved, refused when stale (`tokens`: the entity the client read;
     * a copy's take no check), its form's edit, and its modifiers, those it drops (their copies', on a copy: refused
     * when one is gone since) and those it adds. Answers the entities it wrote, by their ids.
     */
    private async writeOwned(
      tx: Db,
      scope: RulesetScope,
      target: TargetOwner,
      plan: ProgressionPlan,
      tokens: ReadonlyMap<string, string>,
    ) {
      const { ownedType } = plan;
      const idByPosition = new Map(
        (await Entities.findPositions(tx, { entityType: ownedType, ownerIds: [target.id] })).map((owned) => [
          owned.position,
          owned.id,
        ]),
      );
      const removedIds: string[] = [];
      const added: Parameters<typeof Modifiers.createMany>[1] = [];
      const writtenIds: string[] = [];
      for (const owned of plan.owned) {
        const ownedId = idByPosition.get(owned.position);
        if (!ownedId) throw new NotFoundError(plan.gone.owned);

        const expectedUpdatedAt = target.copied ? undefined : tokens.get(owned.entity.id);
        const [row] = await Entities.update(tx, ownedType, owned.edit?.row ?? {}, { id: ownedId, expectedUpdatedAt });
        if (!row) throw new ConflictError(STALE_ENTITY_MESSAGE);
        writtenIds.push(ownedId);
        if (owned.edit) {
          if (owned.edit.writes)
            await writeEntityWrites(tx, scope, { entityId: ownedId, entityType: ownedType }, owned.edit.writes);
          await setLinks(tx, { entityId: ownedId, entityType: ownedType }, owned.edit.links);
        }

        removedIds.push(...owned.removedIds);
        added.push(...owned.added.map((modifier) => ({ ...modifier, sourceId: ownedId, sourceType: ownedType })));
      }

      // The owned entities' modifiers at once: those dropped (their copies', on a copy), then those added
      const ids = removedIds.flatMap((id) => (target.copied ? (target.copiedIds.get(id) ?? []) : [id]));
      const removed = ids.length > 0 ? await Modifiers.delete(tx, { ids }) : [];
      if (removed.length !== removedIds.length) throw new ConflictError(STALE_ENTITY_MESSAGE);
      if (added.length > 0) await Modifiers.createMany(tx, added);
      return writtenIds;
    }

    /** What an entity's progression tabs read beside its owned entities and tables (`ownerId`). */
    async getProgression(rulesetId: string, type: RulesetEntityType, ownerId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) =>
        Engine.for(scope).progression(type, ownerId).describe(),
      );
    }

    /**
     * Saves an entity's progression at once (`body`), in one transaction, copying an inherited entity first. Refused
     * when an owned entity it changes changed since the client read it (`ownedTokens`). A save that changes nothing
     * writes nothing. Answers the entity written (`entityId`: a copy's, when it copied one), its token, and the owned
     * entities it wrote (`ownedIds`).
     */
    async updateProgression(
      session: Session,
      rulesetId: string,
      type: RulesetEntityType,
      ownerId: string,
      body: ProgressionForm & { ownedTokens?: { id: string; updatedAt: string }[] },
    ) {
      const { ownedTokens, ...form } = body;
      const tokens = new Map((ownedTokens ?? []).map((token) => [token.id, token.updatedAt]));
      const result = await withTransaction(
        async (tx) =>
          await withRulesetScope(tx, rulesetId, async (scope) => {
            (await RulesetsPolicy.for(tx, session, scope.ruleset)).canUpdateEntity();
            const plan = Engine.for(scope).progression(type, ownerId).plan(form);
            const unchanged = { entityId: plan.owner.id, ownedIds: [] as string[], updatedAt: plan.owner.updatedAt };
            if (plan.owned.length === 0) return unchanged;

            const target = await this.targetOwner(tx, scope, type, plan);
            const ownedIds = await this.writeOwned(tx, scope, target, plan, tokens);

            await createActivityWithNotifications(tx, {
              userId: session.userId,
              targetId: target.id,
              targetType: type,
              type: `update${getActivityName(type)}Progression`,
              data: plan.activity,
            });

            return { entityId: target.id, ownedIds, updatedAt: target.updatedAt };
          }),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    }
  }
  return WithProgressions;
}
