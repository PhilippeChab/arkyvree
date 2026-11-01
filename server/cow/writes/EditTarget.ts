import type { Db } from "@/drizzle/database.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";

/** A customization's kind, which its rows are read by. */
export type CustomizationKind = keyof typeof CUSTOMIZATION_REPOS;

/** Each customization kind's repository: what a change to an entity's customization reads its rows through. */
const CUSTOMIZATION_REPOS = {
  requirement: Requirements,
  modifier: Modifiers,
} as const;

/**
 * What refuses a customization the client read that's gone, or isn't the entity's, on the ruleset's own entity or on
 * the copy a write made: the user reads it as it is.
 */
export const GONE_CUSTOMIZATION = "Customization source no longer exists; refresh the entity";

/**
 * The row a write to a ruleset's entity changes (`id`), as copy-on-write resolved the entity the write named
 * (`namedId`): the ruleset's own, or the copy of an inherited one (`EntityEdit`). A copy this call made holds the ids
 * of what it copied with it, by their sources' (`copiedIds`: its owned entities' and its customizations'); a copy
 * another write made since the client read the entity holds none, and its token is checked as the ruleset's own row's:
 * stale when the copy's row changed since its source's the client read. What a write needs of a copy it asks the
 * target: the token to check the row by (`expected`), the entities it owns by their places (`findOwned`), a
 * customization's row (`customization`, several at once: `resolveCustomizations`).
 */
export default class EditTarget {
  constructor(
    readonly id: string,
    private readonly namedId: string,
    readonly copiedIds?: ReadonlyMap<string, string>,
  ) {}

  /** Whether this call made the copy it writes: an inherited entity's first edit. */
  get copied(): boolean {
    return this.copiedIds !== undefined;
  }

  /**
   * The token a write checks the row by: the client's (`updatedAt`), or none on a copy this call made, whose token was
   * its source's. A copy another write made is checked by it: the client's token is its source's, stale when the
   * copy's row changed since (an entity's copy, stamped as it's made, always; an owned entity's copy, which keeps its
   * source's times, once it's written).
   */
  expected(updatedAt: string | undefined): string | undefined {
    return this.copied ? undefined : updatedAt;
  }

  /**
   * The row a customization of the entity (`customizationId`, of `kind`) changes, as a target of its own: its copy
   * when this call copied the entity, or itself, which must still exist (`resolveCustomizations`).
   */
  async customization(tx: Db, kind: CustomizationKind, customizationId: string): Promise<EditTarget> {
    const [id] = await this.resolveCustomizations(tx, kind, [customizationId]);
    return new EditTarget(id, customizationId, this.copiedIds);
  }

  /**
   * The entities of a type the row owns (`entityType`: a class's levels), each id by its place on its owner's track:
   * a copy's are its source's copies, place for place.
   */
  async findOwned(tx: Db, entityType: string): Promise<ReadonlyMap<number, string>> {
    const owned = await Entities.findPositions(tx, { entityType, ownerIds: [this.id] });
    return new Map(owned.map(({ id, position }) => [position, id]));
  }

  /**
   * The rows customizations of the entity, or of what it owns (`customizationIds`, of `kind`, as the view shows them),
   * change, in their order: their copies, by the ids this call recorded as it copied the entity (equal values aren't
   * unique), or themselves, which must still exist. Refused as not found when one the client read is gone, and as stale
   * when the write named the entity by another row's id that this call didn't copy (its copy made by another write
   * since the client read it: the ids it names are its source's).
   */
  async resolveCustomizations(tx: Db, kind: CustomizationKind, customizationIds: string[]): Promise<string[]> {
    if (customizationIds.length === 0) return [];
    if (this.id !== this.namedId) {
      const { copiedIds } = this;
      if (!copiedIds) throw new ConflictError(STALE_ENTITY_MESSAGE);
      return customizationIds.map((customizationId) => {
        const copiedId = copiedIds.get(customizationId);
        if (!copiedId) throw new NotFoundError(GONE_CUSTOMIZATION);
        return copiedId;
      });
    }
    if ((await CUSTOMIZATION_REPOS[kind].count(tx, { ids: customizationIds })) !== new Set(customizationIds).size)
      throw new NotFoundError(GONE_CUSTOMIZATION);

    return customizationIds;
  }
}
