import { Engine } from "@/engine/index.ts";
import { CustomizationCopies, CustomizationEdit, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers, NameBindings } from "@/server/repositories/index.ts";
import { createContentActivityWithNotifications } from "@/server/services/activities/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withRulesetWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { Session } from "@/shared/relations.ts";

class ModifiersService {
  /**
   * Adds a modifier to an entity, copying the entity first when it's inherited. A duplicate (`sourceModifierId`, one of
   * the entity's modifiers) takes its source's requirements too.
   */
  private async addEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: { operator: string; target: string; value: string },
    sourceModifierId?: string,
  ) {
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canUpdateEntity();
      // A duplicate of a modifier the client read before another write copied its entity is stale
      if (sourceModifierId)
        await new CustomizationEdit(scope).refuseCopiedSince(tx, entityType, entityId, "modifier", sourceModifierId);

      const catalogs = await RulesetViews.getTargetPathCatalogs(scope, "modifier");
      const modifiers = Engine.for(scope).modifiers(entityType, entityId);
      const { bindings, entity, row } = modifiers.planCreate(catalogs, body, sourceModifierId);

      const edit = new CustomizationEdit(scope);
      const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);

      const rows = await Modifiers.create(tx, { sourceId: resolvedEntityId, sourceType: entityType, ...row });
      const modifier = rows[0];
      await NameBindings.createMany(
        tx,
        bindings.map((binding) => ({ ...binding, modifierId: modifier.id })),
      );

      if (sourceModifierId) {
        const modifierType = CUSTOMIZATION_TYPES.modifier;
        const copies = new CustomizationCopies(scope.ruleset.baseRules);
        const cust = (await copies.read(tx, [sourceModifierId], modifierType)).get(sourceModifierId);
        if (cust) await copies.copy(tx, modifier.id, modifierType, cust);
      }

      await createContentActivityWithNotifications(tx, scope.ruleset, {
        userId: session.userId,
        targetId: modifier.id,
        targetType: TARGET_TYPES.modifiers,
        type: "createModifier",
        data: { entityName: entity.name, target: row.target, value: row.value, operator: row.operator },
      });

      return { ...modifier, resolvedEntityId };
    });
  }

  async createModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return await this.addEntityModifier(session, rulesetId, entityType, entityId, body);
  }

  async deleteModifier(session: Session, rulesetId: string, entityType: string, entityId: string, modifierId: string) {
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canDeleteEntity();
      await new CustomizationEdit(scope).refuseCopiedSince(tx, entityType, entityId, "modifier", modifierId);

      const { entity, modifier } = Engine.for(scope).modifiers(entityType, entityId).planDelete(modifierId);

      const edit = new CustomizationEdit(scope);
      const { customization, resolvedEntityId } = await edit.cowCustomization(
        tx,
        entityType,
        entity.id,
        "modifier",
        modifierId,
      );

      // The database deletes the modifier's requirements with it
      const rows = await Modifiers.delete(tx, { ids: [customization.id] });
      const deletedModifier = rows[0];

      await createContentActivityWithNotifications(tx, scope.ruleset, {
        userId: session.userId,
        targetId: deletedModifier.id,
        targetType: TARGET_TYPES.modifiers,
        type: "deleteModifier",
        data: {
          rulesetId,
          entityName: entity.name,
          target: modifier.target,
          value: modifier.value,
          operator: modifier.operator,
        },
      });

      return { ...deletedModifier, resolvedEntityId };
    });
  }

  async duplicateModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    sourceModifierId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return await this.addEntityModifier(session, rulesetId, entityType, entityId, body, sourceModifierId);
  }

  async getModifier(session: Session, rulesetId: string, entityType: string, entityId: string, modifierId: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope, "modifier");
      return Engine.for(scope).modifiers(entityType, entityId).describe(catalog, modifierId);
    });
  }

  async getModifiers(session: Session, rulesetId: string, entityType: string, entityId: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope, "modifier");
      return Engine.for(scope).modifiers(entityType, entityId).describeAll(catalog);
    });
  }

  async updateModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    modifierId: string,
    body: {
      operator: string;
      target?: string;
      updatedAt?: string;
      value?: string;
    },
  ) {
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canUpdateEntity();
      await new CustomizationEdit(scope).refuseCopiedSince(tx, entityType, entityId, "modifier", modifierId);

      const catalogs = await RulesetViews.getTargetPathCatalogs(scope, "modifier");
      const { updatedAt, ...fields } = body;
      const modifiers = Engine.for(scope).modifiers(entityType, entityId);
      // What its names mean as stored, which a field it isn't sent keeps
      const bound = await NameBindings.findMany(tx, { modifierIds: [modifierId], requirementIds: [] });
      const { bindings, condition, entity, rebound, row } = modifiers.planEdit(catalogs, modifierId, fields, bound);

      // COW the owning entity if this modifier is inherited
      const edit = new CustomizationEdit(scope);
      const { customization, resolvedEntityId } = await edit.cowCustomization(
        tx,
        entityType,
        entity.id,
        "modifier",
        modifierId,
      );

      const expectedUpdatedAt = customization.expected(updatedAt);
      const rows = await Modifiers.update(tx, row, { id: customization.id, expectedUpdatedAt });
      if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const updatedModifier = rows[0];
      // The fields it wrote take their names anew, with the text they now store; the others keep what they meant
      await NameBindings.delete(tx, { fields: rebound, modifierId: updatedModifier.id });
      await NameBindings.createMany(
        tx,
        bindings.map((binding) => ({ ...binding, modifierId: updatedModifier.id })),
      );

      await createContentActivityWithNotifications(tx, scope.ruleset, {
        userId: session.userId,
        targetId: updatedModifier.id,
        targetType: TARGET_TYPES.modifiers,
        type: "updateModifier",
        data: {
          entityName: entity.name,
          target: condition.target,
          value: condition.value,
          operator: condition.operator,
        },
      });

      return { ...updatedModifier, resolvedEntityId };
    });
  }
}

export default new ModifiersService();
