/** An item as a ruleset's entity: what the ruleset describes of it, and what its saves store, checked. */

import { z } from "zod";

import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Item } from "@/shared/relations.ts";
import { TEMPLATE_ITEM_TYPES, type TemplateItemType } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { ITEM_FIELDS } from "./fields.ts";

/** An item's save, as its form sends it. */
type ItemBody = {
  costGp?: number;
  description?: string | null;
  isTemplate?: boolean;
  name: string;
  slot?: ItemLocation;
  sourceItemId?: string;
  type?: string | null;
  weight?: number;
};

/** An item's row, as its forms write it: a template keeps no source, an edit leaves whether it's one as it is. */
type ItemColumns = Omit<ItemBody, "costGp" | "isTemplate" | "sourceItemId" | "weight"> & {
  costGp?: string;
  isTemplate?: boolean;
  sourceItemId?: string | null;
  weight?: string;
};

/** A variant of an item, as its form sends it. */
type VariantBody = { description?: string | null; name: string };

/** A type an item can be based on a template of: a weapon's, an armor's or a shield's. */
const TEMPLATE_TYPE = z.enum(TEMPLATE_ITEM_TYPES);

/** The variants an item's form makes at once: as many as the rules allow. */
const VARIANTS = z.array(z.unknown()).max(RULESET_LIMITS.itemVariants);

/**
 * An item as the ruleset has it: described with its template's properties and requirements, its own over them, and
 * saved by its template rules: a template is its copies' source, never one's copy.
 */
export default class ItemEntity extends CustomizationPageEntity<
  "items",
  ItemBody,
  ItemColumns,
  typeof ITEM_FIELDS.fields
> {
  /** Its armor's, its shield's and its weapon's, its charges, its make. */
  protected override readonly fields = ITEM_FIELDS;

  protected override readonly label = "Item";

  override readonly type = "items";

  /** Refuses a template made from another item: a template is its copies' source, never one's copy. */
  protected override checkForm(body: ItemBody, item?: Item) {
    if ((item ? item.isTemplate : body.isTemplate) && body.sourceItemId)
      throw new RulesError("unprocessable", "Template items cannot have a source item");
  }

  /** A form's columns: a new item's template, and whether it's one; an edited template keeps no source. */
  protected override columnsOf(body: ItemBody, item?: Item): ItemColumns {
    const columns = {
      costGp: body.costGp?.toString(),
      description: body.description,
      name: body.name,
      slot: this.slotOf(body),
      type: body.type,
      weight: body.weight?.toString(),
    };
    if (item) return { ...columns, sourceItemId: item.isTemplate ? null : body.sourceItemId };
    return { ...columns, isTemplate: body.isTemplate ?? false, sourceItemId: body.sourceItemId };
  }

  /**
   * The properties a saved item's fields are read off: the edited one's own, merged with the template it's saved with
   * (the one it keeps when the form gives none); a new one's template's alone.
   */
  protected override keptProperties(columns: ItemColumns, item?: Item) {
    const sourceItemId = columns.sourceItemId === undefined ? (item?.sourceItemId ?? null) : columns.sourceItemId;
    if (item) return this.propertiesOf({ id: item.id, sourceItemId });
    return sourceItemId ? this.propertiesOf({ id: sourceItemId, sourceItemId: null }) : [];
  }

  /** An item's properties: its template's of each type it doesn't set, then its own. */
  protected override propertiesOf(item: Pick<Item, "id" | "sourceItemId">) {
    return this.rulesetData.itemProperties(item);
  }

  /** An item's requirements: its template's, its proficiency, before its own. */
  protected override requirementsOf(item: Pick<Item, "id" | "isTemplate" | "sourceItemId">) {
    const { own: requirements, template: proficiency } = this.rulesetData.itemRequirements(item);
    return [...proficiency, ...requirements];
  }

  /** An item as its page shows it, with where a character carrying it can place it (`placement`). */
  override describe(id: string) {
    const item = super.describe(id);
    return { ...item, placement: ItemPlacement.describe(item, item.properties) };
  }

  /** A page of the ruleset's items, each with its template's name. */
  override openList(where: { childOnly?: boolean }) {
    const list = super.openList(where);
    return {
      ...list,
      describe: <T extends Record<string, unknown> & { id: string }>(rows: T[]) =>
        list.describe(rows).map((item) => ({
          ...item,
          templateName:
            typeof item.sourceItemId === "string"
              ? (this.rulesetData.itemsById.get(item.sourceItemId)?.name ?? null)
              : null,
        })),
    };
  }

  /**
   * Deleting an item: the item as the view has it, and, a template, the item whose copies the server reads
   * (`copiesOf`, in any ruleset) for `checkCopies`, which refuses deleting a template that has any.
   */
  override planDelete(itemId: string) {
    const plan = super.planDelete(itemId);
    return {
      ...plan,
      checkCopies(copies: unknown[]) {
        if (copies.length > 0)
          throw new RulesError("conflict", "Cannot delete a template item that has copies referencing it");
      },
      copiesOf: plan.entity.isTemplate ? plan.entity.id : undefined,
    };
  }

  /** The item a duplicate or variants are made from, as the view has it: refused when there's none of its id. */
  private findSource(itemId: string) {
    const item = this.rulesetData.find("items", itemId);
    if (!item) throw new RulesError("not-found", "Source item not found in this ruleset");
    return item;
  }

  /** An item's slot: the one its type sets (an armor's the torso, a shield's the off hand), or the one its form gives. */
  private slotOf(item: { slot?: ItemLocation; type?: string | null }): ItemLocation | undefined {
    return ItemPlacement.slotOfType(item.type ?? null) ?? item.slot;
  }

  /** The template an item made from `item` points at: `item` itself when it's a template, or its own template. */
  private templateOf(item: Item) {
    return item.isTemplate ? item.id : (item.sourceItemId ?? undefined);
  }

  /**
   * The ruleset's templates of a type (`type`; every type's without one), as the server reads them (`filters`): refused
   * for a type no item can be based on a template of.
   */
  openTemplates(type?: string): { filters: { isTemplate: true; type?: TemplateItemType } } {
    return { filters: { isTemplate: true, type: RulesError.parse(TEMPLATE_TYPE.optional(), type, ["type"]) } };
  }

  /**
   * A duplicate of an item (`sourceItemId`), from its form: it points at the same template, isn't one itself, and takes
   * its source's customizations unless its source is a template, whose copies read the template's
   * (`copyCustomizationsFrom`). It keeps the fields its source's properties hold, which it takes.
   */
  planDuplicate(sourceItemId: string, body: ItemBody) {
    const source = this.findSource(sourceItemId);
    return {
      ...this.planCreate({ ...body, isTemplate: false, sourceItemId: this.templateOf(source) }),
      copyCustomizationsFrom: source.isTemplate ? undefined : source.id,
      fields: this.fields.read(this.propertiesOf(source)),
    };
  }

  /**
   * An item's variants (`variants`, of `sourceItemId`): each a copy of its source's type, slot, weight and cost,
   * pointing at its template, and taking its customizations unless it's a template (`copyCustomizationsFrom`). Refused
   * with more than the rules make at once, or two of a name.
   */
  planVariants(sourceItemId: string, variants: VariantBody[]) {
    RulesError.parse(VARIANTS, variants, ["variants"]);
    const names = variants.map((variant) => variant.name);
    if (new Set(names).size !== names.length)
      throw new RulesError("conflict", "Duplicate names within the variants list");

    const source = this.findSource(sourceItemId);
    const slot = this.slotOf(source);
    return {
      copyCustomizationsFrom: source.isTemplate ? undefined : source.id,
      rows: variants.map((variant) => ({
        name: variant.name,
        description: variant.description,
        type: source.type,
        slot,
        weight: source.weight,
        costGp: source.costGp,
        sourceItemId: this.templateOf(source),
        isTemplate: false,
      })),
      source,
    };
  }
}
