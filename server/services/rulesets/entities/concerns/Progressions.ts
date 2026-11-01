import type { Db } from "@/drizzle/database.ts";
import { Engine, type ProgressionForm, type ProgressionPlan } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { type EditTarget, EntityEdit, type LockedRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Entities, Modifiers, type RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import EntityWriter from "@/server/services/rulesets/entities/EntityWriter.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withRulesetWrite } from "@/server/services/rulesets/rulesetWrites.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

/** The entity row a progression's save writes (`EntityEdit`'s target), and its token. */
interface TargetOwner {
  target: EditTarget;
  updatedAt: string;
}

/**
 * What refuses a progression's save when what it writes is gone since the view was read: its owner (of `type`) or an
 * owned entity (of `ownedType`), each named in its rules' word, as `EntityWriter.getNotFound` names an entity: "Class
 * level no longer exists; refresh the class".
 */
function describeGone({ baseRules }: { baseRules: BaseRules }, type: string, ownedType: string) {
  const rules = Engine.rules();
  const refresh = `refresh the ${rules.labelOf(baseRules, type).toLowerCase()}`;
  return {
    owned: `${rules.labelOf(baseRules, ownedType)} no longer exists; ${refresh}`,
    owner: `${rules.labelOf(baseRules, type)} no longer exists; ${refresh}`,
  };
}

/**
 * An entity's progression (a class's levels at once), as its kind's rules answer it
 * (`Engine.for(scope).progression(type, ownerId)`): what its tabs read, and one save of it all, in one transaction, its
 * owned entities' edits and modifiers, recorded as the kind's progression activity.
 */
export function Progressions<B extends Constructor>(Base: B) {
  abstract class WithProgressions extends Base {
    /**
     * The entity row a progression's save writes (`owner`, of `type`, as the view has it, under the write's lock): the
     * ruleset's own (its own columns aren't written, nor its token moved: its owned entities' tokens check the save),
     * or the copy of an inherited one, with its owned entities and their customizations.
     */
    private async targetOwner(
      tx: Db,
      scope: LockedRulesetScope,
      type: RulesetEntityType,
      owner: ProgressionPlan["owner"],
      gone: string,
    ): Promise<TargetOwner> {
      const target = await new EntityEdit(scope).cowToEdit(tx, type, owner);
      const row = await Entities.findOne(tx, { entityType: type, id: target.id });
      if (!row) throw new NotFoundError(gone);
      return { target, updatedAt: row.updatedAt };
    }

    /**
     * Writes each owned entity a progression's save changes on the target owner's of its place on its track (a copy's
     * own, once the owner was copied: `EditTarget.findOwned`): its `updatedAt` moved, refused when stale (`tokens`: the
     * entity the client read; a copy's take no check, `EditTarget.expected`), its form's edit, and its modifiers, those
     * it drops (their copies', on a copy: refused as not found when one is gone since the view was read,
     * `EditTarget.resolveCustomizations`) and those it adds; refused as not found (`gone`) when the owner's copy lacks
     * one. Answers the entities it wrote, by their ids.
     */
    private async writeOwned(
      tx: Db,
      scope: LockedRulesetScope,
      target: EditTarget,
      plan: ProgressionPlan,
      { gone, tokens }: { gone: string; tokens: ReadonlyMap<string, string> },
    ) {
      const { ownedType } = plan;
      const idByPosition = await target.findOwned(tx, ownedType);
      const removedIds: string[] = [];
      const added: Parameters<typeof Modifiers.createMany>[1] = [];
      const writtenIds: string[] = [];
      for (const owned of plan.owned) {
        const ownedId = idByPosition.get(owned.position);
        if (!ownedId) throw new NotFoundError(gone);

        const expectedUpdatedAt = target.expected(tokens.get(owned.entity.id));
        const [row] = await Entities.update(tx, ownedType, owned.edit?.row ?? {}, { id: ownedId, expectedUpdatedAt });
        if (!row) throw new ConflictError(STALE_ENTITY_MESSAGE);
        writtenIds.push(ownedId);
        if (owned.edit)
          await EntityWriter.setParts(tx, scope, { entityId: ownedId, entityType: ownedType }, owned.edit, true);

        removedIds.push(...owned.removedIds);
        added.push(...owned.added.map((modifier) => ({ ...modifier, sourceId: ownedId, sourceType: ownedType })));
      }

      // The owned entities' modifiers at once: those dropped (their copies', on a copy), then those added
      const ids = await target.resolveCustomizations(tx, "modifier", removedIds);
      if (ids.length > 0) await Modifiers.delete(tx, { ids });
      if (added.length > 0) await Modifiers.createMany(tx, added);
      return writtenIds;
    }

    /** What an entity's progression tabs read beside its owned entities and tables (`ownerId`). */
    async getProgression(session: Session, rulesetId: string, type: RulesetEntityType, ownerId: string) {
      return await withReadableRuleset(db, session, rulesetId, async (scope) =>
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
      return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
        policy.canUpdateEntity();
        // Each token by the owned entity the view shows for the id the client read: a copy another write made since
        // keeps its source's times until it's written, so a token of the source's checks it
        const tokens = new Map(
          (ownedTokens ?? []).map((token) => [scope.rulesetData.cow.resolve(token.id), token.updatedAt]),
        );
        const plan = Engine.for(scope).progression(type, ownerId).plan(form);
        const unchanged = { entityId: plan.owner.id, ownedIds: [] as string[], updatedAt: plan.owner.updatedAt };
        if (plan.owned.length === 0) return unchanged;

        const gone = describeGone(scope.ruleset, type, plan.ownedType);
        const { target, updatedAt } = await this.targetOwner(tx, scope, type, plan.owner, gone.owner);
        const ownedIds = await this.writeOwned(tx, scope, target, plan, { gone: gone.owned, tokens });

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: target.id,
          targetType: type,
          type: `update${getActivityName(type)}Progression`,
          data: plan.activity,
        });

        return { entityId: target.id, ownedIds, updatedAt };
      });
    }
  }
  return WithProgressions;
}
