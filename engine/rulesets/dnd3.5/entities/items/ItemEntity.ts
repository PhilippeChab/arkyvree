/** An item as a ruleset's entity: what the ruleset describes of it, and what its saves store, checked. */

import { z } from "zod";

import { CustomizationPageEntity, type FormBody } from "@/engine/core/entities/index.ts";
import { type EntityForm, type FieldsWrite, OwnerValues, type PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrite } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { ItemLocation } from "@/vocabulary/dnd3.5/equipment.ts";
import { ITEM_IS_TEMPLATE, ITEM_SLOT, ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";
import { TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";

import { ITEM_FIELDS } from "./fields.ts";

/** A variant of an item, as its form sends it. */
interface VariantBody {
  description?: string | null;
  name: string;
}

/** The fields of an item's form, read: those it gives. */
type ItemGiven = PartialFieldValues<typeof ITEM_FIELDS.fields>;

/** A slot as a form gives it: a location, none (null), or left out. */
type SlotGiven = ItemLocation | null | undefined;

/** A type an item can be based on a template of: a weapon's, an armor's or a shield's. */
const TEMPLATE_TYPE = z.enum(TEMPLATE_ITEM_TYPES);

/** The variants an item's form makes at once: as many as the rules allow. */
const VARIANTS = z.array(z.unknown()).max(RULESET_LIMITS.itemVariants);

/**
 * An item as the ruleset has it: described with its template's fields (each its vocabulary says it reads off its
 * template, `inherits`) and requirements, its own over them, and saved by its template rules: a template is its copies'
 * source, never one's copy.
 */
export default class ItemEntity extends CustomizationPageEntity<"items", typeof ITEM_FIELDS.fields> {
  /** Its templates, a duplicate, variants. */
  protected static override readonly copies = true;

  /** Its list's filters: templates, or the items that aren't (its template flag). */
  protected static override readonly listFilters = { [ITEM_IS_TEMPLATE]: z.stringbool() };

  /**
   * Its cost, weight, type, slot and template, whether it's one, its armor's, its shield's and its weapon's, its
   * charges, its make.
   */
  protected override readonly fields = ITEM_FIELDS;

  protected override readonly label = "Item";

  override readonly type = "items";

  /** Refuses a template's form (`checkTemplate`), or an item's based on a template (`checkTemplateOf`). */
  protected override checkForm(_body: FormBody, given: ItemGiven, item?: Item) {
    if (item ? item.fields[ITEM_IS_TEMPLATE] : given.template) this.checkTemplate(given, item);
    else this.checkTemplateOf(given, item);
  }

  /**
   * The fields saving an item writes (`item`: the one edited; `keptFrom`, the one whose values it keeps, it or a
   * duplicate's source): the fields its form gives, over those it keeps (its own over the template it's saved with,
   * `formFields`), as its own: those it reads off its template that its template's don't hold (`toOverrides`), so it
   * keeps reading the rest off its template. None when the form gives none; but an edited template keeps no source,
   * which its save clears where it holds one (an old self-reference).
   */
  protected override fieldsWrite(
    _body: FormBody,
    given: ItemGiven,
    item?: Item,
    keptFrom: Item | undefined = item,
  ): FieldsWrite | undefined {
    const fields = this.formFields(given, item, keptFrom);
    const templateId = this.templateIdOf(given, item);
    const template = templateId ? this.templateValuesOf(templateId) : OwnerValues.NONE;
    const write = fields && this.fields.toOverrides(fields, this.fields.read(template));
    if (!item?.fields[ITEM_IS_TEMPLATE] || !item.links.madeFrom) return write;
    return { fields: write?.fields ?? {}, links: { ...write?.links, madeFrom: null } };
  }

  /**
   * The fields a form writes (none when it gives none), over those the item keeps (`item`: the one edited; `keptFrom`,
   * the one whose values it keeps, it or a duplicate's source: its own over the template it's saved with, one it moves
   * to among them; a new one's defaults): its slot always one (`"Other"` for none, a template's type's its own),
   * whether it's a template a new item's alone (an edit leaves it as it is), and an edited template no source.
   */
  protected override formFields(given: ItemGiven, item?: Item, keptFrom: Item | undefined = item) {
    if (this.fields.formNames.every((key) => given[key] === undefined)) return undefined;
    // An edit's type is the one it keeps when it gives none, which sets the slot of a template's type; an empty slot
    // is none, as an empty type is
    const slotGiven = given.slot === undefined ? undefined : ((given.slot || null) as SlotGiven);
    const slot = this.slotOf({ slot: slotGiven, type: this.typeOf(given, item) });
    const values = {
      ...given,
      ...(slot !== undefined && { slot }),
      ...(item && { template: undefined }),
      ...(item?.fields[ITEM_IS_TEMPLATE] && { madeFrom: null }),
    };
    if (!keptFrom) return super.formFields(values);
    const madeFrom = this.templateIdOf(given, item) ?? undefined;
    return this.fields.merge(
      this.fieldsOf({ fields: keptFrom.fields, links: { ...keptFrom.links, madeFrom } }),
      values,
    );
  }

  /** A page of the ruleset's items, each with its template's name. */
  protected override listOf(where: { childOnly?: boolean } & Record<string, unknown>) {
    const list = super.listOf(where);
    return {
      ...list,
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) =>
        list
          .describe(rows)
          .map((item, index) => ({ ...item, templateName: this.templateNameOf(rows[index].links.madeFrom) })),
    };
  }

  /** An item's requirements: its template's, its proficiency, before its own. */
  protected override requirementsOf(item: Pick<Item, "fields" | "id" | "links">) {
    const { own: requirements, template: proficiency } = this.rulesetData.templateRequirements("items", item);
    return [...proficiency, ...requirements];
  }

  /**
   * An item as its page shows it, with where a character carrying it can place it (`placement`), and its template's
   * name (`templateName`), which its editor shows while the template isn't one of its type.
   */
  override describe(id: string) {
    const stored = this.find(id);
    return {
      ...super.describe(id),
      placement: ItemPlacement.describe(this.rulesetData.withInheritedFields(this.type, stored)),
      templateName: this.templateNameOf(stored.links.madeFrom),
    };
  }

  /**
   * The ruleset's templates of a type (`type`; every type's without one), as the server reads them (`filters`): refused
   * for a type no item can be based on a template of.
   */
  override openTemplates(type?: string) {
    const parsed = RulesError.parse(TEMPLATE_TYPE.optional(), type, ["type"]);
    return { filters: this.filtersOf({ [ITEM_IS_TEMPLATE]: true, [ITEM_TYPE]: parsed }) };
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
   * A duplicate of an item (`sourceId`), from its form: it points at the same template, isn't one itself, and takes
   * its source's customizations unless its source is a template, whose copies read the template's
   * (`copyCustomizationsFrom`). It keeps the fields its form gives, over every field its source holds of its own (its
   * weight and cost among them: `fieldsWrite`, over the source's values); a template's none: its copies read them off
   * it.
   */
  override planDuplicate(sourceId: string, body: EntityForm) {
    const source = this.findSource(sourceId);
    const form = {
      ...body,
      fields: { ...body.fields, [ITEM_IS_TEMPLATE]: false },
      links: { ...body.links, madeFrom: this.templateOf(source) ?? null },
    };
    const plan = this.planCreate(form);
    if (source.fields[ITEM_IS_TEMPLATE]) return plan;
    const { body: read, given } = this.readForm(form);
    const written = this.fieldsWrite(read, given, undefined, source);
    return {
      ...plan,
      copyCustomizationsFrom: source.id,
      row: { ...plan.row, fields: { ...source.fields, ...plan.row.fields, ...written?.fields } },
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
    const type = this.typeOf(this.readForm(form, item).given, item);
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
   * An item's variants (`variants`, of `sourceId`): each a copy of its source's type and slot, pointing at its
   * template; and, unless its source is a template (whose copies read its other fields off it, its weight and cost
   * among them, as it changes), of every other field its source holds of its own and of its customizations
   * (`copyCustomizationsFrom`). Refused with more than the rules make at once, or two of a name.
   */
  override planVariants(sourceId: string, variants: VariantBody[]) {
    RulesError.parse(VARIANTS, variants, ["variants"]);
    const names = variants.map((variant) => variant.name);
    if (new Set(names).size !== names.length)
      throw new RulesError("conflict", "Duplicate names within the variants list");

    const source = this.findSource(sourceId);
    const template = source.fields[ITEM_IS_TEMPLATE];
    const type = source.fields[ITEM_TYPE] ?? null;
    const fields = {
      ...(template ? {} : source.fields),
      [ITEM_TYPE]: type,
      [ITEM_SLOT]: this.slotOf({ slot: source.fields[ITEM_SLOT], type }) ?? null,
      [ITEM_IS_TEMPLATE]: false,
    };
    return {
      copyCustomizationsFrom: template ? undefined : source.id,
      rows: variants.map((variant): EntityWrite => ({
        name: variant.name,
        description: variant.description,
        fields,
        links: { madeFrom: this.templateOf(source) ?? null },
      })),
      source,
    };
  }

  /**
   * Refuses a template made from another item (a template is its copies' source, never one's copy), or of a type no
   * item can be based on a template of: a new one's, or the one an edit changes it to (one it keeps stays).
   */
  private checkTemplate(given: ItemGiven, template?: Item) {
    if (given.madeFrom) throw new RulesError("unprocessable", "Template items cannot have a source item");
    const type = this.typeOf(given, template);
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
  private checkTemplateOf(given: ItemGiven, item?: Item) {
    const templateId = this.templateIdOf(given, item);
    if (!templateId) return;

    const template = this.rulesetData.find("items", templateId);
    if (!template?.fields[ITEM_IS_TEMPLATE])
      throw new RulesError("unprocessable", "Source item is not a template of this ruleset");
    const type = this.typeOf(given, item);
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
    return this.filtersOf({ madeFrom: this.rulesetData.cow.getEquivalentIds(template.id) });
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
  private slotOf(item: { slot?: SlotGiven; type?: string | null }): ItemLocation | undefined {
    return ItemPlacement.slotOfType(item.type ?? null) ?? (item.slot === null ? "Other" : item.slot);
  }

  /**
   * The template a form saves an item with: none for an edited template, which keeps no source, or the form's (null:
   * none), or the one the edited item keeps.
   */
  private templateIdOf(given: ItemGiven, item?: Item) {
    if (item?.fields[ITEM_IS_TEMPLATE]) return null;
    return given.madeFrom === undefined ? (item?.links.madeFrom ?? null) : given.madeFrom;
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

  /** A template's fields and links, its own alone (a template is no copy): none when the view shows none. */
  private templateValuesOf(templateId: string) {
    return this.rulesetData.find("items", templateId) ?? OwnerValues.NONE;
  }

  /** The type a form saves an item with: the form's (null or empty: none), or the one the edited item keeps. */
  private typeOf(given: ItemGiven, item?: Item): string | null {
    if (given.type === undefined) return item?.fields[ITEM_TYPE] ?? null;
    return given.type || null;
  }
}
