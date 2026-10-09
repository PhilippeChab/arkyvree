/** An item as a ruleset's entity: what the ruleset describes of it, and what its saves store, checked. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Item } from "@/shared/relations.ts";

/** An item's save, as its form sends it. */
interface ItemBody {
  costGp?: number;
  description?: string | null;
  isTemplate?: boolean;
  name: string;
  slot?: ItemLocation;
  sourceItemId?: string;
  type?: string | null;
  weight?: number;
}

/** A variant of an item, as its form sends it. */
interface VariantBody {
  description?: string | null;
  name: string;
}

/** An item as the ruleset has it: described with its template's properties, saved by its template rules. */
export default class ItemEntity {
  /** Refuses a template made from another item: a template is its copies' source, never one's copy. */
  private static checkTemplateSource(isTemplate: boolean, sourceItemId?: string) {
    if (isTemplate && sourceItemId) throw new RulesError("unprocessable", "Template items cannot have a source item");
  }

  /** An item of the ruleset as the view has it: refused (`label`) when there's none of its id. */
  private static findItem(view: RulesetView, itemId: string, label = "Item") {
    const item = view.rulesetData.find("items", itemId);
    if (!item) throw new RulesError("not-found", `${label} not found in this ruleset`);
    return item;
  }

  /** What saving an item writes: its slot, its type's (an armor's the torso, a shield's the off hand) or the one given. */
  private static planSave(item: {
    slot?: ItemLocation;
    type?: string | null;
  }): EntityWrites<{ slot: ItemLocation | undefined }> {
    const slot = item.type === "Armor" ? "Torso" : item.type === "Shield" ? "Off Hand" : item.slot;
    return { columns: { slot }, generatedFeats: [], removedFeats: [] };
  }

  /** The template an item made from `item` points at: `item` itself when it's a template, or its own template. */
  private static templateOf(item: { id: string; isTemplate: boolean; sourceItemId: string | null }) {
    return item.isTemplate ? item.id : (item.sourceItemId ?? undefined);
  }

  /**
   * An item of the ruleset with its modifiers, its properties merged with its template's (its own override those of
   * the same type), and its requirements, its template's before its own.
   */
  static describe(view: RulesetView, itemId: string) {
    const { rulesetData } = view;
    const item = ItemEntity.findItem(view, itemId);
    const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
    const templateRequirements = item.sourceItemId
      ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
      : [];
    return {
      ...item,
      modifiers: rulesetData.modifiersBySource.get(item.id) ?? [],
      properties: rulesetData.itemProperties(item),
      requirements: [...templateRequirements, ...ownRequirements],
    };
  }

  /** A page of the ruleset's items, each with its template's name. */
  static describePage<T extends { sourceItemId: string | null }>(view: RulesetView, rows: T[]) {
    return rows.map((item) => ({
      ...item,
      templateName: item.sourceItemId ? (view.rulesetData.itemsById.get(item.sourceItemId)?.name ?? null) : null,
    }));
  }

  /**
   * A new item's row, from its form, or a duplicate of an item (`duplicatedItemId`): the duplicate points at the same
   * template, isn't one itself, and takes its source's customizations unless its source is a template, whose copies
   * read the template's (`copyCustomizationsFrom`). Refused when a template is given a source item.
   */
  static planCreate(view: RulesetView, body: ItemBody, duplicatedItemId?: string) {
    const source = duplicatedItemId ? ItemEntity.findItem(view, duplicatedItemId, "Source item") : undefined;
    if (!source) ItemEntity.checkTemplateSource(body.isTemplate ?? false, body.sourceItemId);
    return {
      columns: {
        name: body.name,
        description: body.description,
        type: body.type,
        slot: ItemEntity.planSave(body).columns.slot,
        weight: body.weight?.toString(),
        costGp: body.costGp?.toString(),
        sourceItemId: source ? ItemEntity.templateOf(source) : body.sourceItemId,
        isTemplate: source ? false : (body.isTemplate ?? false),
      },
      copyCustomizationsFrom: source && !source.isTemplate ? source.id : undefined,
    };
  }

  /**
   * Deleting an item: the item as the view has it, and, a template, the item whose copies the server reads
   * (`copiesOf`, in any ruleset) for `checkCopies`, which refuses deleting a template that has any.
   */
  static planDelete(view: RulesetView, itemId: string) {
    const item = ItemEntity.findItem(view, itemId);
    return {
      checkCopies(copies: unknown[]) {
        if (copies.length > 0)
          throw new RulesError("conflict", "Cannot delete a template item that has copies referencing it");
      },
      copiesOf: item.isTemplate ? item.id : undefined,
      item,
    };
  }

  /** An item's edit: the item as the view has it, and its new row; a template keeps no source. */
  static planEdit(view: RulesetView, itemId: string, body: ItemBody) {
    const item = ItemEntity.findItem(view, itemId);
    ItemEntity.checkTemplateSource(item.isTemplate, body.sourceItemId);
    return {
      columns: {
        name: body.name,
        description: body.description,
        type: body.type,
        slot: ItemEntity.planSave(body).columns.slot,
        weight: body.weight?.toString(),
        costGp: body.costGp?.toString(),
        sourceItemId: item.isTemplate ? null : body.sourceItemId,
      },
      item,
    };
  }

  /**
   * An item's variants (`variants`, of `sourceItemId`): each a copy of its source's type, slot, weight and cost,
   * pointing at its template, and taking its customizations unless it's a template (`copyCustomizationsFrom`). Refused
   * with two of a name.
   */
  static planVariants(view: RulesetView, sourceItemId: string, variants: VariantBody[]) {
    const names = variants.map((variant) => variant.name);
    if (new Set(names).size !== names.length)
      throw new RulesError("conflict", "Duplicate names within the variants list");

    const source: Item = ItemEntity.findItem(view, sourceItemId, "Source item");
    const { slot } = ItemEntity.planSave(source).columns;
    return {
      copyCustomizationsFrom: source.isTemplate ? undefined : source.id,
      rows: variants.map((variant) => ({
        name: variant.name,
        description: variant.description,
        type: source.type,
        slot,
        weight: source.weight,
        costGp: source.costGp,
        sourceItemId: ItemEntity.templateOf(source),
        isTemplate: false,
      })),
      source,
    };
  }
}
