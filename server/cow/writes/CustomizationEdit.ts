import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine, type RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Modifiers } from "@/server/repositories/index.ts";

import { type CustomizationKind, type default as EditTarget, GONE_CUSTOMIZATION } from "./EditTarget.ts";
import EntityEdit, { type NotFoundMessages } from "./EntityEdit.ts";

/**
 * What a change refuses a customization's source with: an entity the view doesn't show, or no customizable one
 * (`missing`), and one deleted since the view was read, or a customization (`gone`).
 */
const SOURCE_NOT_FOUND = {
  gone: GONE_CUSTOMIZATION,
  missing: "Customization source not found in this ruleset",
} satisfies NotFoundMessages;

/**
 * The row a customization (a modifier, a requirement) of a ruleset's entity changes, made in its scope
 * (`new CustomizationEdit(ruleset, rulesetData.cow)`): on the ruleset's own owner, locked, or on the copy of an
 * inherited one, made on its first edit (`EntityEdit`), the customization mapped to its copy. Its copy-on-write data
 * gives it the entity the view shows for an id and the source chain. Every method takes the transaction; a copy and the
 * ids it copied live for the call that made it.
 */
export default class CustomizationEdit {
  constructor(
    private readonly ruleset: RulesetSources,
    private readonly cow: CowData,
  ) {}

  /**
   * The row a customization of a customizable entity changes (3.5's feats, spells, items, races, classes and class
   * levels): the row its write targets (`EntityEdit.cowById`: the ruleset's own, locked, or the copy of an inherited
   * one, an owned entity's on its owner's copy).
   */
  private async cowEntityOwner(tx: Db, entityType: string, entityId: string): Promise<EditTarget> {
    if (!Engine.storage().customizableKinds().includes(entityType)) throw new NotFoundError(SOURCE_NOT_FOUND.missing);
    return await new EntityEdit(this.ruleset, this.cow).cowById(tx, entityType, entityId, SOURCE_NOT_FOUND);
  }

  /** Resolve a modifier as the owner of requirements: COW its owning entity and map the modifier to its copy. */
  private async cowModifierOwner(tx: Db, modifierId: string): Promise<EditTarget> {
    // The stored row, its source as stored: an ancestor's modifier names the ancestor's entity
    const modifier = await Modifiers.findOne(tx, { id: modifierId });
    if (!modifier || modifier.sourceType === "modifiers") throw new NotFoundError(SOURCE_NOT_FOUND.missing);

    const owner = await this.cowEntityOwner(tx, modifier.sourceType, modifier.sourceId);
    return await owner.customization(tx, "modifier", modifier.id);
  }

  private async cowOwnerOf(tx: Db, entityType: string, entityId: string): Promise<EditTarget> {
    if (entityType === "modifiers") return this.cowModifierOwner(tx, entityId);
    return this.cowEntityOwner(tx, entityType, entityId);
  }

  /**
   * Resolve the stored row a customization update or delete should change.
   * `entityId` is the owner the row is shown on, so visible sibling contributions
   * resolve like the entity's own rows. COWs that owner when inherited and returns
   * the copy made for the row, as a target its write asks its token of
   * (`customization`: `EditTarget.customization`). A row on a local owner is re-read
   * after the owner lock, which may have waited for its deletion.
   */
  async cowCustomization(
    tx: Db,
    entityType: string,
    entityId: string,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<{ customization: EditTarget; resolvedEntityId: string }> {
    const owner = await this.cowOwnerOf(tx, entityType, entityId);
    return { customization: await owner.customization(tx, kind, customizationId), resolvedEntityId: owner.id };
  }

  /**
   * The row a new customization of `entityId` goes on: the ruleset's own entity, locked, or the copy of an inherited
   * one. A class level's class is copied with its levels, and the level mapped to its copy by number; a modifier's
   * requirement goes on the copy of the modifier.
   */
  async cowOwner(tx: Db, entityType: string, entityId: string): Promise<string> {
    return (await this.cowOwnerOf(tx, entityType, entityId)).id;
  }
}
