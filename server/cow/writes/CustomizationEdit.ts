import type { Db } from "@/drizzle/database.ts";
import type { CowData, RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CUSTOMIZABLE_TYPES, Modifiers, Requirements } from "@/server/repositories/index.ts";

import EntityEdit from "./EntityEdit.ts";

/**
 * The row a customization of an entity changes (`cowOwner`), and what its copy copied when this call copied it: a
 * nested customization (a modifier's requirement) resolves through the same copy.
 */
interface Owner {
  copiedIds?: ReadonlyMap<string, string>;
  id: string;
}

type CustomizationKind = keyof typeof CUSTOMIZATION_REPOS;

/** Each customization kind's repository: what a change to a copied entity's customization resolves the row through. */
const CUSTOMIZATION_REPOS = {
  requirement: Requirements,
  modifier: Modifiers,
} as const;

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
  private async cowEntityOwner(tx: Db, entityType: string, entityId: string): Promise<Owner> {
    if (!CUSTOMIZABLE_TYPES.includes(entityType))
      throw new NotFoundError("Customization source not found in this ruleset");
    const target = await new EntityEdit(this.ruleset, this.cow).cowById(tx, entityType, entityId);
    return target.copied ? { id: target.id, copiedIds: target.copiedIds } : { id: target.id };
  }

  /** Resolve a modifier as the owner of requirements: COW its owning entity and map the modifier to its copy. */
  private async cowModifierOwner(tx: Db, modifierId: string): Promise<Owner> {
    // The stored row, its source as stored: an ancestor's modifier names the ancestor's entity
    const modifier = await Modifiers.findOne(tx, { id: modifierId });
    if (!modifier || modifier.sourceType === "modifiers")
      throw new NotFoundError("Customization source not found in this ruleset");

    const owner = await this.cowEntityOwner(tx, modifier.sourceType, modifier.sourceId);
    const id = await this.resolveExistingCustomization(tx, modifier.sourceId, owner, "modifier", modifier.id);
    return { id, copiedIds: owner.copiedIds };
  }

  private async cowOwnerOf(tx: Db, entityType: string, entityId: string): Promise<Owner> {
    if (entityType === "modifiers") return this.cowModifierOwner(tx, entityId);
    return this.cowEntityOwner(tx, entityType, entityId);
  }

  /**
   * The customization `customizationId` of `entityId` once that entity resolved to `owner`: its copy when this call
   * copied the entity (by the ids recorded at copy time: equal customization values aren't unique), or itself, which
   * must still exist.
   */
  private async resolveExistingCustomization(
    tx: Db,
    entityId: string,
    owner: Owner,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<string> {
    let resolvedCustomizationId = customizationId;
    if (owner.id !== entityId) {
      const copiedId = owner.copiedIds?.get(customizationId);
      if (!copiedId) throw new NotFoundError(`Copied ${kind} not found`);
      resolvedCustomizationId = copiedId;
    }
    if (
      resolvedCustomizationId === customizationId &&
      !(await CUSTOMIZATION_REPOS[kind].exists(tx, { id: customizationId }))
    )
      throw new NotFoundError("Customization source no longer exists; refresh the entity");

    return resolvedCustomizationId;
  }

  /**
   * Resolve the stored row a customization update or delete should change.
   * `entityId` is the owner the row is shown on, so visible sibling contributions
   * resolve like the entity's own rows. COWs that owner when inherited and returns
   * the copy made for the row. A row on a local owner is re-read after the owner
   * lock, which may have waited for its deletion.
   */
  async cowCustomization(
    tx: Db,
    entityType: string,
    entityId: string,
    kind: CustomizationKind,
    customizationId: string,
  ): Promise<{ resolvedCustomizationId: string; resolvedEntityId: string }> {
    const owner = await this.cowOwnerOf(tx, entityType, entityId);
    const resolvedCustomizationId = await this.resolveExistingCustomization(tx, entityId, owner, kind, customizationId);
    return { resolvedEntityId: owner.id, resolvedCustomizationId };
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
