import { Field, type Fields, FieldWrites, OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { EntityWrite, LinkSet, LinkWrite } from "@/engine/core/module/index.ts";
import type { RulesetData, ViewEntity, ViewKinds } from "@/engine/core/view/index.ts";
import type { ActivityChange, ChangedField, ChangedLink, ChangedLinks } from "@/shared/activity.ts";

/** What an edit's activity reads of a kind's fields: their declarations, and an owner's values read by stored field. */
interface ChangedFields {
  fields: Fields;
  readByField(stored: StoredValues): Record<string, unknown>;
}

/**
 * An entity as an edit's activity compares it: its name (none for an owned one's: a class level's), its description,
 * and its values as the view holds them.
 */
interface Compared extends Pick<ViewEntity, "description" | "fields" | "id" | "links"> {
  name: string | null;
}

/**
 * An entry of a list of links as an edit's activity compares it (`key`: its target and its own columns, by id) and
 * records it (`entry`).
 */
interface KeyedEntry {
  entry: ChangedLink;
  key: string;
}

/** An owner's values before an edit and after it (`stored`), and its fields as its codec reads them (`read`). */
interface ReadValues {
  read: Record<string, unknown>;
  stored: StoredValues;
}

/** A column a list of links' entries carry past their target, by what its form sends of it. */
type EntryColumn = "amount" | "free" | "tier" | "viaId";

/**
 * A place an edit's activity compares, labeled: a stored field (`fields`), a single link's role (`links`, to an entity
 * of `references`), or the role of a list of links (`lists`, what its entries carry, `entries`, and the kind of the
 * pools they're through, `via`).
 */
type Place =
  | { at: string; label: string; part: "fields"; values?: readonly string[] | null }
  | { at: string; label: string; part: "links"; references: string }
  | { at: string; entries?: string; label: string; part: "lists"; via?: string };

/** The columns a list's entries carry, by what they carry: a pool and whether it's free, a tier, an amount. */
const ENTRY_COLUMNS: Readonly<Record<string, readonly EntryColumn[]>> = {
  amount: ["amount"],
  grant: ["viaId", "free"],
  tier: ["tier"],
};

/**
 * What an entity's edit changes, as its activity records it (`ActivityChange`): its name, its description, then each
 * place its kind's fields declare (`placesOf`: its fields, its single links, its lists of links), each labeled as
 * declared. A field is compared as its kind's codec reads it before and after the edit's row as the write path stores
 * it (`FieldWrites`), an item's template's among them, its text recorded; a single link by its target, recorded by
 * name; a list of links the edit sets by its entries, those it adds and removes, each named, with the columns its
 * role's entries carry (the pool it's through, by name).
 */
export default class EntityChanges {
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly type: string,
    private readonly codec: ChangedFields,
  ) {
    this.places = EntityChanges.placesOf(codec.fields);
    this.writes = new FieldWrites({ [type]: codec.fields });
  }

  /** A key identifying an entry of a list of links: its target and its own columns, ids resolved as the view's. */
  private static keyOf(
    link: Partial<Record<EntryColumn, unknown>> & { toId: string },
    columns: readonly EntryColumn[],
  ) {
    return JSON.stringify([link.toId, ...columns.map((column) => link[column] ?? null)]);
  }

  /** The entries of `entries` none of `others` matches by key, each matched once: those a list lost or gained. */
  private static missingFrom(entries: readonly KeyedEntry[], others: readonly KeyedEntry[]): ChangedLink[] {
    const left = new Map<string, number>();
    for (const { key } of others) left.set(key, (left.get(key) ?? 0) + 1);
    return entries.flatMap(({ entry, key }) => {
      const count = left.get(key) ?? 0;
      left.set(key, count - 1);
      return count > 0 ? [] : [entry];
    });
  }

  /**
   * A value as an activity records it: none for none (an empty text, an empty list), a list's values joined by ", " in
   * the order the view keeps them (`values`, its field's closed list's, then by text), a flag's and a number's as text,
   * anything else as JSON.
   */
  private static textOf(value: unknown, values?: readonly string[] | null): string | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    if (Array.isArray(value)) {
      const rank = (text: string) => {
        const index = values?.indexOf(text) ?? -1;
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      const texts = value.map(String).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
      return texts.length > 0 ? texts.join(", ") : undefined;
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value as boolean | number | string);
  }

  /**
   * The places an edit's activity compares (`fields`, a kind's declarations), each labeled as declared: those its form
   * shows beside its name first, then the others, in their declared order (a group's among them).
   */
  static placesOf(fields: Fields): Place[] {
    const leaves = Field.leavesOf(fields);
    return [...leaves.filter((leaf) => leaf.placement), ...leaves.filter((leaf) => !leaf.placement)].map(
      (leaf): Place => {
        const { label } = leaf;
        if (leaf.kind === "ref") return { at: leaf.role, label, part: "links", references: leaf.references };
        if (leaf.kind === "links") return { at: leaf.role, entries: leaf.entries, label, part: "lists", via: leaf.via };
        return { at: leaf.field, label, part: "fields", values: Field.closedValuesOf(leaf) };
      },
    );
  }

  /** The places it compares, in their order (`placesOf`). */
  private readonly places: readonly Place[];

  /**
   * What the write path stores of a write of its kind's fields (`FieldWrites`): its codec's fields are its module's
   * declaration of them, which the write path's own (`Engine.storage().writtenFields`) is built of too.
   */
  private readonly writes: FieldWrites;

  /** A stored field's change: its text as its codec reads it, else as stored, before and after; none when the same. */
  private changeOfField(
    place: Extract<Place, { part: "fields" }>,
    before: ReadValues,
    after: ReadValues,
  ): ChangedField | undefined {
    const textAt = ({ read, stored }: ReadValues) =>
      EntityChanges.textOf(
        Object.hasOwn(read, place.at) ? read[place.at] : OwnerValues.valuesOf(stored.fields, place.at),
        place.values,
      );
    const [from, to] = [textAt(before), textAt(after)];
    return from === to ? undefined : { field: place.at, label: place.label, from, to };
  }

  /** A single link's change: its target, before and after, by the view's id, recorded by name; none when the same. */
  private changeOfLink(
    place: Extract<Place, { part: "links" }>,
    before: ReadValues,
    after: ReadValues,
  ): ChangedField | undefined {
    const targetOf = ({ stored }: ReadValues) => {
      const id = stored.links[place.at];
      return id ? this.rulesetData.cow.resolve(id) : undefined;
    };
    const [was, is] = [targetOf(before), targetOf(after)];
    if (was === is) return undefined;
    return {
      field: place.at,
      label: place.label,
      from: was && this.nameOf(place.references, was),
      to: is && this.nameOf(place.references, is),
    };
  }

  /**
   * A list of links' change (`set`, what the edit writes of its role, over the entity's `entityId`): its entries it
   * adds and those it removes, each with the columns its role's entries carry (`entries`, the pools' kind `via`); none
   * when the same.
   */
  private changeOfList(
    entityId: string,
    set: LinkSet,
    place: { entries?: string; label: string; via?: string },
  ): ChangedLinks | undefined {
    const columns = (place.entries && ENTRY_COLUMNS[place.entries]) || [];
    const keyed = (link: Omit<LinkWrite, "role" | "toType">) => this.keyedEntryOf(set, link, columns, place.via);
    const before = this.rulesetData.linksOf(entityId, set.role, set.toType).map(keyed);
    const after = set.links.map(keyed);
    const added = EntityChanges.missingFrom(after, before);
    const removed = EntityChanges.missingFrom(before, after);
    if (added.length === 0 && removed.length === 0) return undefined;
    return { role: set.role, label: place.label, added, removed };
  }

  /** An entry of a list of links (`link`, of `set`'s role) as its activity records it, keyed for the comparison. */
  private keyedEntryOf(
    set: LinkSet,
    link: Omit<LinkWrite, "role" | "toType">,
    columns: readonly EntryColumn[],
    viaType: string | undefined,
  ): KeyedEntry {
    const { cow } = this.rulesetData;
    const toId = cow.resolve(link.toId);
    const viaId = link.viaId ? cow.resolve(link.viaId) : null;
    const values = { amount: link.amount ?? null, free: link.free ?? false, tier: link.tier ?? null, toId, viaId };
    const entry: ChangedLink = { toId, toName: this.nameOf(set.toType, toId) ?? "" };
    for (const column of columns) {
      if (column === "viaId") entry.viaName = viaId && viaType ? (this.nameOf(viaType, viaId) ?? null) : null;
      else Object.assign(entry, { [column]: values[column] });
    }
    return { entry, key: EntityChanges.keyOf(values, columns) };
  }

  /** The name of the entity of a kind (`type`) the view shows for an id: none when it shows none. */
  private nameOf(type: string, id: string): string | undefined {
    const entity = this.rulesetData.find(type as keyof ViewKinds, id) as { name?: unknown } | undefined;
    return typeof entity?.name === "string" ? entity.name : undefined;
  }

  /**
   * An entity's values with an edit's row over them (`row`: each field it writes, as the write path stores it,
   * replacing the entity's, none clearing it; each single link it sets, null clearing it), read as the view reads
   * them, an inherited template's among them.
   */
  private readAfter(entity: Compared, row: EntityWrite): ReadValues {
    const over = (
      held: Readonly<Partial<Record<string, unknown>>>,
      written: Readonly<Partial<Record<string, unknown>>>,
    ) => {
      const values = {
        ...held,
        ...Object.fromEntries(Object.entries(written).filter(([, value]) => value !== undefined)),
      };
      return Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== null && !(Array.isArray(value) && value.length === 0)),
      );
    };
    const fields = over(entity.fields, this.writes.written(this.type, row.fields ?? {}, false));
    const links = over(entity.links, row.links ?? {});
    return this.readOf({ fields, links } as Pick<ViewEntity, "fields" | "links">);
  }

  /** An entity's values as the view reads them (an inherited template's among them), and as its codec reads them. */
  private readOf(entity: Pick<ViewEntity, "fields" | "links">): ReadValues {
    const stored = this.rulesetData.withInheritedFields(this.type, entity);
    return { read: this.codec.readByField(stored), stored };
  }

  /**
   * What an edit changes of an entity (`entity`, as the view has it): its row's (`row`: its name, its description, its
   * fields and its single links) and its lists of links' (`sets`, those it sets), in its places' order. A list it sets
   * that no field declares comes last, labeled by its role.
   */
  compare(entity: Compared, row: EntityWrite, sets: readonly LinkSet[] = []): ActivityChange[] {
    const changes: (ActivityChange | undefined)[] = [];
    if (row.name !== undefined && row.name !== entity.name)
      changes.push({ field: "name", label: "Name", from: entity.name ?? undefined, to: row.name });
    const { textOf } = EntityChanges;
    if (row.description !== undefined && textOf(row.description) !== textOf(entity.description))
      changes.push({ field: "description", label: "Description" });
    const before = this.readOf(entity);
    const after = this.readAfter(entity, row);
    for (const place of this.places) {
      if (place.part === "fields") {
        changes.push(this.changeOfField(place, before, after));
      } else if (place.part === "links") {
        changes.push(this.changeOfLink(place, before, after));
      } else {
        const set = sets.find((each) => each.role === place.at);
        if (set) changes.push(this.changeOfList(entity.id, set, place));
      }
    }
    const listed = new Set(this.places.flatMap((place) => (place.part === "lists" ? [place.at] : [])));
    for (const set of sets.filter((each) => !listed.has(each.role)))
      changes.push(this.changeOfList(entity.id, set, { label: set.role }));
    return changes.filter((change) => change !== undefined);
  }
}
