/** An item as a ruleset's entity: what the ruleset describes of it, and what its saves store, checked. */

import { z } from "zod";

import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import {
  type EntityFieldValues,
  type EntityForm,
  type FieldsWrite,
  OwnerValues,
  type StoredValues,
} from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrite, EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { ITEM_COST_GP, ITEM_IS_TEMPLATE, ITEM_SLOT, ITEM_TYPE, ITEM_WEIGHT } from "@/vocabulary/dnd3.5/fields/index.ts";
import { TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { ITEM_COLUMNS } from "./columns.ts";
import { ITEM_FIELDS, type ItemFieldValues } from "./fields.ts";

/**
 * An item's save, as its form sends it: a cost, a weight, a slot or a template it leaves out is kept, null clears it;
 * and its fields (its weapon's, its armor's…).
 */
interface ItemBody {
  costGp?: number | null;
  description?: string | null;
  fields?: EntityFieldValues;
  isTemplate?: boolean;
  name: string;
  slot?: ItemLocation | null;
  sourceItemId?: string | null;
  type?: string | null;
  weight?: number | null;
}

/** A variant of an item, as its form sends it. */
interface VariantBody {
  description?: string | null;
  name: string;
}

/**
 * An item's columns, as its forms write them: a template keeps no source, an edit leaves whether it's one as it is, and
 * a slot is always one (`"Other"` for none).
 */
type ItemColumns = Omit<ItemBody, "fields" | "slot"> & { slot?: ItemLocation };

/** A type an item can be based on a template of: a weapon's, an armor's or a shield's. */
const TEMPLATE_TYPE = z.enum(TEMPLATE_ITEM_TYPES);

/** The variants an item's form makes at once: as many as the rules allow. */
const VARIANTS = z.array(z.unknown()).max(RULESET_LIMITS.itemVariants);

/**
 * An item as the ruleset has it: described with its template's fields and requirements, its own over them, and saved
 * by its template rules: a template is its copies' source, never one's copy.
 */
export default class ItemEntity extends CustomizationPageEntity<
  "items",
  ItemBody,
  ItemColumns,
  typeof ITEM_FIELDS.fields
> {
  /** Its cost, weight, type, slot and template. */
  protected override readonly columns = ITEM_COLUMNS;

  /** Its templates, a duplicate, variants. */
  protected override readonly copies = true;

  /** Its armor's, its shield's and its weapon's, its charges, its make. */
  protected override readonly fields = ITEM_FIELDS;

  /** Whether a new item is a template (an edit's is its own: its form doesn't change it). */
  protected override readonly formKeys = { isTemplate: z.boolean().optional() };

  protected override readonly label = "Item";

  /** A list of the templates or of the other items. */
  protected override readonly listColumns = ["isTemplate"];

  /** Its list's filters: templates, or the items that aren't. */
  protected override readonly listFilters = { isTemplate: z.stringbool() };

  /** Whether it's a template: its own flag. */
  protected override readonly storedAt = { isTemplate: { field: ITEM_IS_TEMPLATE } };

  override readonly type = "items";

  /** Refuses a template's form (`checkTemplate`), or an item's based on a template (`checkTemplateOf`). */
  protected override checkForm(body: ItemBody, item?: Item) {
    if (item ? item.fields[ITEM_IS_TEMPLATE] : body.isTemplate) this.checkTemplate(body, item);
    else this.checkTemplateOf(body, item);
  }

  /** A form's columns: a new item's template, and whether it's one; an edited template keeps no source. */
  protected override columnsOf(body: ItemBody, item?: Item): ItemColumns {
    const columns = {
      costGp: body.costGp,
      description: body.description,
      name: body.name,
      // An edit's type is the one it keeps when it gives none, which sets the slot of a template's type
      slot: this.slotOf({ slot: body.slot, type: this.typeOf(body, item) }),
      type: body.type,
      weight: body.weight,
    };
    if (item) return { ...columns, sourceItemId: item.fields[ITEM_IS_TEMPLATE] ? null : body.sourceItemId };
    return { ...columns, isTemplate: body.isTemplate ?? false, sourceItemId: body.sourceItemId };
  }

  /**
   * The stored values a saved item's fields are read off: the edited one's own, merged with the template it's saved
   * with (the one it keeps when the form gives none); a new one's template's alone.
   */
  protected override keptValues(columns: ItemColumns, item?: Item): StoredValues {
    const templateId = this.templateIdOf(columns, item);
    if (item) return this.valuesOf({ id: item.id, links: templateId ? { madeFrom: templateId } : {} });
    return templateId ? this.templateValuesOf(templateId) : OwnerValues.NONE;
  }

  /** A page of the ruleset's items, each with its template's name. */
  protected override listOf(where: { childOnly?: boolean; isTemplate?: boolean }) {
    const list = super.listOf(where);
    return {
      ...list,
      describe: <T extends Pick<EntityRecord, "id" | "links">>(rows: T[]) =>
        list
          .describe(rows)
          .map((item, index) => ({ ...item, templateName: this.templateNameOf(rows[index].links.madeFrom) })),
    };
  }

  /** An item's requirements: its template's, its proficiency, before its own. */
  protected override requirementsOf(item: Pick<Item, "fields" | "id" | "links">) {
    const { own: requirements, template: proficiency } = this.rulesetData.itemRequirements(item);
    return [...proficiency, ...requirements];
  }

  /** A form's template, the view's. */
  protected override resolveIds({ sourceItemId }: ItemBody) {
    return sourceItemId ? { sourceItemId: this.ids.resolve("items", sourceItemId) } : {};
  }

  /** An item's stored values: its template's of each field it holds none of, then its own. */
  protected override valuesOf(item: Pick<Item, "id" | "links">): StoredValues {
    return this.rulesetData.inheritedValuesOf("items", item);
  }

  /**
   * What saving an item writes (`item`: the one edited): the fields its form gives, over those it shows (its own over
   * its template's), as its own stored values: those its template's don't hold (`toOverrides`), so it keeps reading
   * the rest off its template (the one its form saves it with). Nothing when the form gives none of its fields.
   */
  protected override writesOf(body: ItemBody, given: Partial<ItemFieldValues>, item?: Item): EntityWrites | undefined {
    const fields = this.formFields(given, item);
    if (!fields) return undefined;
    const templateId = this.templateIdOf(body, item);
    const template = templateId ? this.fields.read(this.templateValuesOf(templateId)) : this.fields.defaults;
    return { fields: this.fields.toOverrides(fields, template) };
  }

  /**
   * The stored values a saved item's fields are read off: those its form writes, over its template's of the fields
   * they don't set (the one it's saved with), or those it keeps when its form writes none.
   */
  protected override writtenValues(columns: ItemColumns, written: FieldsWrite | undefined, item?: Item): StoredValues {
    if (!written) return this.keptValues(columns, item);
    const templateId = this.templateIdOf(columns, item);
    const own = OwnerValues.written(written);
    return templateId ? OwnerValues.inherit(own, this.templateValuesOf(templateId)) : own;
  }

  /**
   * An item as its page shows it, with where a character carrying it can place it (`placement`), and its template's
   * name (`templateName`), which its editor shows while the template isn't one of its type.
   */
  override describe(id: string) {
    const stored = this.find(id);
    return {
      ...super.describe(id),
      placement: ItemPlacement.describe(stored, this.valuesOf(stored)),
      templateName: this.templateNameOf(stored.links.madeFrom),
    };
  }

  /**
   * The ruleset's templates of a type (`type`; every type's without one), as the server reads them (`filters`): refused
   * for a type no item can be based on a template of.
   */
  override openTemplates(type?: string) {
    const parsed = RulesError.parse(TEMPLATE_TYPE.optional(), type, ["type"]);
    return { filters: this.filtersOf({ isTemplate: true, type: parsed }) };
  }

  /**
   * Deleting an item: the item as the view has it, and, a template, the items made from it (`copies`: those naming it
   * by its id or by one it stands for), which the server reads where the delete reaches them (the ruleset's view, and
   * the rulesets built on it) for their check, which refuses deleting a template that has any.
   */
  override planDelete(itemId: string) {
    const plan = super.planDelete(itemId);
    const copies = plan.entity.fields[ITEM_IS_TEMPLATE]
      ? {
          check(made: unknown[]) {
            if (made.length > 0)
              throw new RulesError("conflict", "Cannot delete a template item that has copies referencing it");
          },
          filters: this.copiesOf(plan.entity),
        }
      : undefined;
    return { ...plan, copies };
  }

  /**
   * A duplicate of an item (`sourceItemId`), from its form: it points at the same template, isn't one itself, and takes
   * its source's customizations unless its source is a template, whose copies read the template's
   * (`copyCustomizationsFrom`). It keeps the fields its form gives, written over those it takes, or, given none, the
   * fields its source's stored values hold.
   */
  override planDuplicate(sourceItemId: string, body: EntityForm) {
    const source = this.findSource(sourceItemId);
    const plan = this.planCreate({ ...body, isTemplate: false, sourceItemId: this.templateOf(source) });
    return {
      ...plan,
      copyCustomizationsFrom: source.fields[ITEM_IS_TEMPLATE] ? undefined : source.id,
      fields: plan.writes ? plan.fields : this.fieldsOf(source),
    };
  }

  /**
   * An item's edit, and, a template's that changes its type, the items made from it (`copies`: those naming it by its
   * id or by one it stands for), which the server reads where the change reaches them (the ruleset's view, and the
   * rulesets built on it) for their check, which refuses the change while any is of another type than the new one: it
   * would read the fields and requirements of a template of another type. The refusal names what the view shows
   * alone (`listCopies`).
   */
  override planEdit(itemId: string, form: EntityForm) {
    const plan = super.planEdit(itemId, form);
    const { entity: item } = plan;
    const type = this.typeOf(this.formOf(form, item), item);
    const copies =
      item.fields[ITEM_IS_TEMPLATE] && type !== (item.fields[ITEM_TYPE] ?? null)
        ? {
            check: (copies: EntityRecord[]) => {
              const made = copies.filter((copy) => (copy.fields[ITEM_TYPE] ?? null) !== type);
              if (made.length === 0) return;
              const template = `the ${item.fields[ITEM_TYPE] ?? "None"} template "${item.name}"`;
              throw new RulesError(
                "unprocessable",
                `Can't change ${template} to ${type ?? "None"} while items are made from it: ${this.listCopies(made)}`,
              );
            },
            filters: this.copiesOf(item),
          }
        : undefined;
    return { ...plan, copies };
  }

  /**
   * An item's variants (`variants`, of `sourceItemId`): each a copy of its source's type, slot, weight and cost,
   * pointing at its template, and taking its customizations unless it's a template (`copyCustomizationsFrom`). Refused
   * with more than the rules make at once, or two of a name.
   */
  override planVariants(sourceItemId: string, variants: VariantBody[]) {
    RulesError.parse(VARIANTS, variants, ["variants"]);
    const names = variants.map((variant) => variant.name);
    if (new Set(names).size !== names.length)
      throw new RulesError("conflict", "Duplicate names within the variants list");

    const source = this.findSource(sourceItemId);
    const { [ITEM_COST_GP]: cost = null, [ITEM_TYPE]: type = null, [ITEM_WEIGHT]: weight = null } = source.fields;
    const slot = this.slotOf({ slot: source.fields[ITEM_SLOT], type }) ?? null;
    return {
      copyCustomizationsFrom: source.fields[ITEM_IS_TEMPLATE] ? undefined : source.id,
      rows: variants.map((variant): EntityWrite => ({
        name: variant.name,
        description: variant.description,
        fields: {
          [ITEM_TYPE]: type,
          [ITEM_SLOT]: slot,
          [ITEM_WEIGHT]: weight,
          [ITEM_COST_GP]: cost,
          [ITEM_IS_TEMPLATE]: false,
        },
        links: { madeFrom: this.templateOf(source) ?? null },
      })),
      source,
    };
  }

  /**
   * Refuses a template made from another item (a template is its copies' source, never one's copy), or of a type no
   * item can be based on a template of: a new one's, or the one an edit changes it to (one it keeps stays).
   */
  private checkTemplate(body: ItemBody, template?: Item) {
    if (body.sourceItemId) throw new RulesError("unprocessable", "Template items cannot have a source item");
    const type = this.typeOf(body, template);
    if ((!template || type !== (template.fields[ITEM_TYPE] ?? null)) && !isOneOf(type, TEMPLATE_ITEM_TYPES)) {
      throw new RulesError(
        "unprocessable",
        `Item type ${type ?? "None"} can't be a template: only ${TEMPLATE_ITEM_TYPES.join(", ")} can`,
      );
    }
  }

  /**
   * Refuses an item based on anything but a template of its type (the one its form gives, or the one it keeps), which
   * it would read its fields and requirements off: a weapon's, an armor's or a shield's.
   */
  private checkTemplateOf(body: ItemBody, item?: Item) {
    const templateId = this.templateIdOf(body, item);
    if (!templateId) return;

    const template = this.rulesetData.find("items", templateId);
    if (!template?.fields[ITEM_IS_TEMPLATE])
      throw new RulesError("unprocessable", "Source item is not a template of this ruleset");
    const type = this.typeOf(body, item);
    const templateType = template.fields[ITEM_TYPE] ?? null;
    if (templateType !== type || !isOneOf(type, TEMPLATE_ITEM_TYPES)) {
      throw new RulesError(
        "unprocessable",
        `Item type ${type ?? "None"} can't be based on the ${templateType ?? "None"} template "${template.name}"`,
      );
    }
  }

  /** What the server reads a template's copies with: the items naming it by its id, or by one it stands for. */
  private copiesOf(template: Item) {
    return this.filtersOf({ sourceItemId: this.rulesetData.cow.getEquivalentIds(template.id) });
  }

  /** The item a duplicate or variants are made from, as the view has it: refused when there's none of its id. */
  private findSource(itemId: string) {
    const item = this.rulesetData.find("items", itemId);
    if (!item) throw new RulesError("not-found", "Source item not found in this ruleset");
    return item;
  }

  /**
   * The items made from a template, as a refusal lists them: the first the ruleset's view shows by its name, and how
   * many more it shows, then how many the rulesets built on it make, which it never names: one may be another user's,
   * which the session can't read.
   */
  private listCopies(copies: Pick<EntityRecord, "id" | "name">[]) {
    const [named, ...shown] = copies.filter((copy) => Dnd35View.of(this.rulesetData).itemsById.has(copy.id));
    const elsewhere = copies.length - shown.length - (named ? 1 : 0);
    const more = shown.length > 0 ? ` and ${shown.length} more` : "";
    return [
      ...(named ? [`"${named.name}"${more}`] : []),
      ...(elsewhere > 0 ? [`${elsewhere} in rulesets built on this one`] : []),
    ].join(", and ");
  }

  /**
   * An item's slot: the one its type sets (an armor's the torso, a shield's the off hand), or the one its form gives,
   * `"Other"` for none (null: an item worn nowhere in particular).
   */
  private slotOf(item: { slot?: ItemLocation | null; type?: string | null }): ItemLocation | undefined {
    return ItemPlacement.slotOfType(item.type ?? null) ?? (item.slot === null ? "Other" : item.slot);
  }

  /**
   * The template a form (its body, or its columns) saves an item with: none for an edited template, which keeps no
   * source, or the form's (null: none), or the one the edited item keeps.
   */
  private templateIdOf(form: { sourceItemId?: string | null }, item?: Item) {
    if (item?.fields[ITEM_IS_TEMPLATE]) return null;
    return form.sourceItemId === undefined ? (item?.links.madeFrom ?? null) : form.sourceItemId;
  }

  /**
   * The name of an item's template (`templateId`, its `madeFrom` link's, stored or the view's), the entity the view
   * shows for it: null for none.
   */
  private templateNameOf(templateId: string | undefined) {
    if (templateId === undefined) return null;
    return Dnd35View.of(this.rulesetData).itemsById.get(this.rulesetData.cow.resolve(templateId))?.name ?? null;
  }

  /** The template an item made from `item` points at: `item` itself when it's a template, or its own template. */
  private templateOf(item: Item) {
    return item.fields[ITEM_IS_TEMPLATE] ? item.id : item.links.madeFrom;
  }

  /** A template's stored values, its own alone: a template is no copy. */
  private templateValuesOf(templateId: string) {
    return this.valuesOf({ id: templateId, links: {} });
  }

  /** The type a form saves an item with: the form's (null: none), or the one the edited item keeps. */
  private typeOf(body: ItemBody, item?: Item) {
    return body.type === undefined ? (item?.fields[ITEM_TYPE] ?? null) : body.type;
  }
}
