import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers, Requirements } from "@/server/repositories/index.ts";
import { CUSTOMIZATION_TYPES, type CustomizationKind } from "@/shared/customization/customizationTypes.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type EditTarget from "./EditTarget.ts";
import EntityEdit from "./EntityEdit.ts";

/**
 * The row a customization (a modifier, a requirement) of a ruleset's entity changes, in the scope a write holds (`new
 * CustomizationEdit(scope)`, under its lock): on the ruleset's own owner, or on the copy of an inherited one, made on
 * its first edit (`EntityEdit`), the customization mapped to its copy. Its copy-on-write data gives it the entity the
 * view shows for an id and the source chain. Every method takes the transaction; a copy and the ids it copied live for
 * the call that made it.
 */
export default class CustomizationEdit {
  constructor(private readonly scope: LockedRulesetScope) {}

  /**
   * What refuses a customization (of `kind`) of an entity (of `entityType`) the client read that's gone since, or
   * isn't the entity's, in a base rules' words: "Modifier no longer exists; refresh the feat". A progression's save
   * refuses a level's modifier so too.
   */
  static describeGone(baseRules: BaseRules, kind: CustomizationKind, entityType: string): string {
    return Engine.rules().describeGone(baseRules, CUSTOMIZATION_TYPES[kind], entityType);
  }

  /** What refuses a customization (of `kind`) of an entity (of `entityType`) gone since, in its ruleset's words. */
  private gone(kind: CustomizationKind, entityType: string): string {
    return CustomizationEdit.describeGone(this.scope.ruleset.baseRules, kind, entityType);
  }

  /** What refuses a customization's source (of `entityType`) the view doesn't show, in its rules' words. */
  private notFound(entityType: string): string {
    return Engine.rules().describeNotFound(this.scope.ruleset.baseRules, entityType);
  }

  /**
   * The row a customization of a customizable entity changes (3.5's feats, spells, items, races, classes and class
   * levels): the row its write targets (`EntityEdit.cowById`: the ruleset's own, or the copy of an inherited
   * one, an owned entity's on its owner's copy). Refused as not found, in its rules' words ("Feat not found"), when the
   * view shows no such entity, or its kind takes no customizations.
   */
  private async cowEntityOwner(tx: Db, entityType: string, entityId: string): Promise<EditTarget> {
    const notFound = this.notFound(entityType);
    if (!Engine.storage().customizableKinds().includes(entityType)) throw new NotFoundError(notFound);
    return await new EntityEdit(this.scope).cowById(tx, entityType, entityId, notFound);
  }

  /** Resolve a modifier as the owner of requirements: COW its owning entity and map the modifier to its copy. */
  private async cowModifierOwner(tx: Db, modifierId: string): Promise<EditTarget> {
    // The stored row, its source as stored: an ancestor's modifier names the ancestor's entity
    const modifier = await Modifiers.findOne(tx, { id: modifierId });
    if (!modifier || modifier.sourceType === CUSTOMIZATION_TYPES.modifier)
      throw new NotFoundError(this.notFound(CUSTOMIZATION_TYPES.modifier));

    const owner = await this.cowEntityOwner(tx, modifier.sourceType, modifier.sourceId);
    return await owner.customization(tx, "modifier", modifier.id, this.gone("modifier", modifier.sourceType));
  }

  private async cowOwnerOf(tx: Db, entityType: string, entityId: string): Promise<EditTarget> {
    if (entityType === CUSTOMIZATION_TYPES.modifier) return this.cowModifierOwner(tx, entityId);
    return this.cowEntityOwner(tx, entityType, entityId);
  }

  /**
   * Resolve the stored row a customization update or delete should change.
   * `entityId` is the owner the row is shown on, so visible sibling contributions
   * resolve like the entity's own rows. COWs that owner when inherited and returns
   * the copy made for the row, as a target its write asks its token of
   * (`customization`: `EditTarget.customization`).
   */
  async cowCustomization(
    tx: Db,
    entityType: string,
    entityId: string,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<{ customization: EditTarget; resolvedEntityId: string }> {
    const owner = await this.cowOwnerOf(tx, entityType, entityId);
    const customization = await owner.customization(tx, kind, customizationId, this.gone(kind, entityType));
    return { customization, resolvedEntityId: owner.id };
  }

  /**
   * The row a new customization of `entityId` goes on: the ruleset's own entity, or the copy of an inherited
   * one. A class level's class is copied with its levels, and the level mapped to its copy by number; a modifier's
   * requirement goes on the copy of the modifier.
   */
  async cowOwner(tx: Db, entityType: string, entityId: string): Promise<string> {
    return (await this.cowOwnerOf(tx, entityType, entityId)).id;
  }

  /**
   * Refuses as stale (409) a change of a customization (`customizationId`, of `kind`) the client read on an entity the
   * ruleset copied since (`entityId`, of `entityType`: its source's id, which the view shows the copy for now): the
   * customization is its source's, whose ids the copy doesn't keep, so the client's form is behind, as a token behind
   * is. A customization of a modifier is checked by the modifier's owner. Anything else is the change's to refuse.
   */
  async refuseCopiedSince(
    tx: Db,
    entityType: string,
    entityId: string,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<void> {
    const owner =
      entityType === CUSTOMIZATION_TYPES.modifier
        ? (await Modifiers.findOne(tx, { id: entityId }))?.sourceId
        : entityId;
    if (owner === undefined || !this.scope.rulesetData.cow.isOverridden(owner)) return;
    const customization =
      kind === "modifier"
        ? (await Modifiers.findOne(tx, { id: customizationId }))?.sourceId
        : (await Requirements.findOne(tx, { id: customizationId }))?.entityId;
    if (customization === entityId) throw new ConflictError(STALE_ENTITY_MESSAGE);
  }
}
