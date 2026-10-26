import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { EntityRecord, LinkSet } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ViewLink } from "@/engine/core/view/index.ts";

/**
 * A kind a ruleset lists (a feat in a pool, a spell on a spell list: their `listedIn` links). A list holds feats or
 * spells, never both, and an entity described carries every link of its own as the ruleset composes them (`links`: its
 * lists, a spell's save), each with its target's name.
 */
export default abstract class ListedEntity<
  K extends "feats" | "spells",
  Body extends object,
  Columns extends object,
  S extends Fields,
> extends CustomizationPageEntity<K, Body, Columns, S> {
  /** Of a saved entity's own links, those its answer names: all of them, as its page shows them (`describe`). */
  protected override savedLinks(_row: Pick<EntityRecord, "links">, links: readonly ViewLink[]): readonly ViewLink[] {
    return links;
  }

  /** An entity as its page shows it, with all its links (`links`). */
  override describe(id: string) {
    const entity = super.describe(id);
    return { ...entity, links: this.linksIn(entity.id) };
  }

  /**
   * An entity's links as the ruleset composes them (its siblings' merged into the winning copy's, each list the one that
   * stands for it), each with its target's name (`toName`): what its answers carry.
   */
  private linksIn(entityId: string) {
    return this.rulesetData.nameLinks(this.rulesetData.linksOf(entityId));
  }

  /** Records of a page, described: each with all its links (`links`). */
  protected describeListed<T extends Pick<EntityRecord, "id" | "links">>(rows: T[]) {
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
