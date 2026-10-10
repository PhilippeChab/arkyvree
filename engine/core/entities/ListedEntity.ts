import type { Fields } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";

import CustomizationPageEntity from "./CustomizationPageEntity.ts";

/** A listed entity's links to the lists, as its row carries them. */
type Links<K extends "feats" | "powers"> = K extends "feats"
  ? Pick<ViewEntities["feats"], "featsAptitudesInRules">
  : Pick<ViewEntities["powers"], "powersAptitudesInRules">;

/**
 * A kind a ruleset lists (a feat in a pool, a power on a spell list: the schema's listed tables). A list holds feats or
 * spells, never both, and a page's rows carry their lists as the ruleset composes them (`describeListed`).
 */
export default abstract class ListedEntity<
  K extends "feats" | "powers",
  Body extends object,
  Columns extends object,
  S extends Fields,
> extends CustomizationPageEntity<K, Body, Columns, S> {
  /** An entity's links to the lists, as the view composes them. */
  protected abstract linksIn(entity: ViewEntities[K]): Links<K>;

  /**
   * Rows of a page, described: each with its lists as the ruleset composes them (its siblings' links merged into the
   * winning copy's, each list the one that stands for it), the ruleset's own rows too. A row read as stored carries its
   * links under their stored ids, which name the source of a list the ruleset copied.
   */
  protected describeListed<T extends Record<string, unknown> & { id: string }>(rows: T[]) {
    return this.describeRows(rows).map((row) => {
      const entity = this.rulesetData.find(this.type, row.id);
      return entity ? { ...row, ...this.linksIn(entity) } : row;
    });
  }

  /** Refuses linking an entity to a list the other kind uses (`taken`): the ruleset's own and its chain's. */
  protected refuseLists(listIds: string[], taken: Set<string>, message: string) {
    if (listIds.some((id) => taken.has(this.rulesetData.canonicalize(id)))) throw new RulesError("conflict", message);
  }
}
