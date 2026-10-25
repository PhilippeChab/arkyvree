import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { LinkSet } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";

/**
 * A kind a ruleset lists (a feat in a pool, a spell on a spell list: their `listedIn` links). A list holds feats or
 * spells, never both, and an entity described carries its links as the ruleset composes them (`links`), each with its
 * list's name.
 */
export default abstract class ListedEntity<
  K extends "feats" | "spells",
  Body extends object,
  Columns extends object,
  S extends Fields,
> extends CustomizationPageEntity<K, Body, Columns, S> {
  /** An entity as its page shows it, with its links (`links`). */
  override describe(id: string) {
    const entity = super.describe(id);
    return { ...entity, links: this.linksIn(entity.id) };
  }

  /**
   * An entity's links as the ruleset composes them (its siblings' merged into the winning copy's, each list the one that
   * stands for it), each with its list's name (`toName`): what its answers carry.
   */
  private linksIn(entityId: string) {
    return this.rulesetData.nameLinks(this.rulesetData.linksOf(entityId));
  }

  /** Rows of a page, described: each with its links (`links`), a row read as stored too. */
  protected describeListed<T extends Record<string, unknown> & { id: string }>(rows: T[]) {
    return this.describeRows(rows).map((row) => ({ ...row, links: this.linksIn(row.id) }));
  }

  /** The lists a form links an entity to (`lists`: each its list, and its level on it), as its `listedIn` links. */
  protected listedIn(lists: { tier?: number | null; toId: string }[]): LinkSet[] {
    return [{ links: lists, role: "listedIn", toType: "aptitudes" }];
  }

  /** Refuses linking an entity to a list the other kind uses (`taken`): the ruleset's own and its chain's. */
  protected refuseLists(listIds: string[], taken: Set<string>, message: string) {
    if (listIds.some((id) => taken.has(this.rulesetData.canonicalize(id)))) throw new RulesError("conflict", message);
  }
}
