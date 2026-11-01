import type { CowData } from "@/engine/core/cow/index.ts";
import { type DeclaredFields, OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { RulesDescription } from "@/engine/core/module/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

import type { ViewEntity, ViewLink } from "./rows.ts";
import RulesetData, { type KindValue, type RulesetLists } from "./RulesetData.ts";
import SiblingMerge from "./SiblingMerge.ts";
import SiblingRows from "./SiblingRows.ts";

/** An entity's links of the roles it holds many of, in their order, and its kind (`type`). */
interface HeldLinks {
  links: readonly ViewLink[];
  type: string;
}

/** What merging sibling copies made: what each loser gave its winner (`taken`), each winner's values (`merged`). */
interface SiblingMerges {
  merged: Map<string, StoredValues>;
  taken: Map<string, StoredValues>;
}

/** A ruleset's own rows, none of its sources': what the server fetches for each ruleset of a chain to compose. */
export interface RulesetRawData {
  /** Each kind's entities as stored, by its type, an owned kind's by position and owner */
  entities: Record<string, ViewEntity[]>;
  /**
   * Each kind's values kind-wide, by its type: each value of each field with the entities that hold it, in the order
   * those values were written
   */
  kindValues: ReadonlyMap<string, readonly KindValue[]>;
  /** Each entity's links of the roles it holds many of, by its id: one that holds none is left out */
  links: ReadonlyMap<string, HeldLinks>;
  /** Every modifier whose source is an entity in this ruleset — all sourceTypes. */
  modifiers: Modifier[];
  /** Every requirement row in this ruleset, including those attached to modifiers. */
  requirements: Requirement[];
  /** Its own Settings (its fields and its links), by its id: none for a ruleset that holds none */
  settings?: { rulesetId: string; values: StoredValues };
  /** Of its entities, those a link with a tier points at, from any ruleset's entity (a spell list at a level) */
  tieredIds: Set<string>;
}

/**
 * What a ruleset's view is composed by, of its modules' storage declarations: each kind (its owner's kind, an owned
 * kind's), and the links whose sibling copies' merge into their winner's (`unionLinks`, each by its role, from a kind
 * to another: a feat's pools).
 */
export interface ViewSchema {
  /**
   * Each kind, an owner before the kinds it owns; `tracked`: its visible ids read by another kind's; `customizable`:
   * whether a user customizes its entities; `inherits`: the fields they read off another entity when they hold none,
   * and the role of their link to it; `inventory`: whether a character's inventory holds its entities
   * (`StorageRegistries.itemTypes`); `ownerType`: an owned kind's owner's kind; `template`: the flag of its own that
   * makes an entity a template others are made from
   */
  kinds: {
    customizable: boolean;
    inherits?: { fields: ReadonlySet<string>; role: string };
    inventory?: true;
    ownerType?: string;
    template?: string;
    tracked: boolean;
    type: string;
  }[];
  unionLinks: { fromType: string; role: string; toType: string }[];
}

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, the ruleset's first), composed by its copy-on-write
 * data. The copies' and siblings' exclusions apply, a sibling loser's fields, single links and customizations merge
 * into its winner's, references resolve to the winners, and every id-keyed map takes a stored id. An owned kind's rows
 * follow their owners', and an entity's links are composed the first time they're read (`composeLinks`). Built on every
 * read (`RulesetViews.getData`).
 */
export default class RulesetComposition {
  /**
   * `declared`: the fields its modules declare, which order its entities' values and merge a sibling's into its
   * winner's; `schema`: what its modules declare of its kinds and links; `words`: its rules' word for each type.
   */
  constructor(
    chain: RulesetRawData[],
    cow: CowData,
    declared: DeclaredFields,
    schema: ViewSchema,
    words: RulesDescription["words"],
  ) {
    this.words = words;
    this.chain = chain;
    this.cow = cow;
    this.declared = declared;
    this.schema = schema;
    this.unionLinks = new Set(schema.unionLinks.map(({ fromType, role, toType }) => `${fromType} ${role} ${toType}`));
  }

  private readonly chain: RulesetRawData[];

  private readonly cow: CowData;

  /** The fields its modules declare: their order, and how sibling copies merge them */
  private readonly declared: DeclaredFields;

  private readonly schema: ViewSchema;

  /** The links whose sibling copies' merge into their winner's, each by its kind, its role and its target's kind. */
  private readonly unionLinks: ReadonlySet<string>;

  /** Its rules' word for each type, which its view names a type by */
  private readonly words: RulesDescription["words"];

  /**
   * Each kind's rows, an owner's before the kinds it owns: an owned kind's rows whose owner the view shows (a copied
   * class's levels are overridden by its copy's, paired by `CowDataBuilder`, and a sibling loser's owner leaves its
   * own out), each winner with its sibling losers' fields and single links merged in (`mergeSiblings`), and the visible
   * ids another kind reads. Answers too the owned entities the view leaves out, whose customizations go with them, and
   * what each sibling loser gave its winner (`taken`, by the loser), and each winner's values once merged (`merged`, by
   * the winner).
   */
  private composeEntities() {
    const visibleIds = new Map<string, Set<string>>();
    const entities = new Map<string, ViewEntity[]>();
    const leftOut = new Set<string>();
    const taken = new Map<string, StoredValues>();
    const merged = new Map<string, StoredValues>();
    for (const { ownerType, tracked, type } of this.schema.kinds) {
      let rows: ViewEntity[];
      if (ownerType) {
        const owners = visibleIds.get(ownerType);
        if (!owners) throw new Error(`The view composes ${type} before its owner, ${ownerType}`);
        rows = [];
        for (const raw of this.chain) {
          for (const row of raw.entities[type] ?? []) {
            if (!this.cow.isHidden(row.id) && row.ownerId !== null && owners.has(row.ownerId)) rows.push(row);
            else leftOut.add(row.id);
          }
        }
      } else {
        rows = this.composeRows((raw) => raw.entities[type] ?? []);
      }
      if (tracked) visibleIds.set(type, new Set(rows.map((row) => row.id)));
      entities.set(type, this.cow.resolveLinks(this.mergeSiblings(type, rows, leftOut, { merged, taken })));
    }
    return { entities, leftOut, merged, taken };
  }

  /**
   * A kind's values kind-wide (`type`'s), as stat blocks show them (`RulesetData.kindValues`): each raw ruleset's, the
   * fork's first, each value's entities in their order, but a copied entity's and an owned entity's the view leaves out;
   * a sibling loser's stands as its winner where the winner took the value from it (`taken`), and is left out
   * otherwise; a winner's own where its merged values still hold it (`merged`: a sibling that changed a single value
   * replaces it).
   */
  private composeKindValues(type: string, leftOut: ReadonlySet<string>, { merged, taken }: SiblingMerges): KindValue[] {
    const byValue = new Map<string, KindValue>();
    for (const raw of this.chain) {
      for (const { entityIds, field, value } of raw.kindValues.get(type) ?? []) {
        const key = `${field}\u0000${value}`;
        const held = byValue.get(key) ?? byValue.set(key, { entityIds: [], field, value }).get(key)!;
        for (const id of entityIds) {
          if (this.cow.isOverridden(id) || leftOut.has(id)) continue;
          const winnerId = this.cow.getWinner(id);
          const holder = winnerId === undefined ? merged.get(id) : taken.get(id);
          if (winnerId === undefined && holder === undefined) held.entityIds.push(id);
          else if (OwnerValues.valuesOf(holder?.fields ?? {}, field).some((given) => String(given) === value))
            held.entityIds.push(winnerId ?? id);
        }
      }
    }
    return [...byValue.values()]
      .filter((held) => held.entityIds.length > 0)
      .toSorted(
        (a, b) =>
          this.declared.compareFields(a.field, b.field) || this.declared.compareValues(a.field, a.value, b.value),
      );
  }

  /**
   * An entity's links (`entityId`, one the view shows), as the view composes them: its own, then, of the roles that
   * merge (`unionLinks`), those its sibling losers hold (but a copied one) to targets it doesn't link to
   * (`SiblingMerge.mergeLinks`, which `EntityCopy` writes the same way), each from it; each naming the entities that
   * stand for those it names (a copy, a winner). Of the roles that merge, links that name one target collapse, the first
   * one kept.
   */
  private composeLinks(entityId: string): readonly ViewLink[] {
    const held = this.heldLinksOf(entityId);
    if (this.cow.isEmpty()) return held?.links ?? [];
    const losers = this.cow.hasSiblings(entityId)
      ? this.cow
          .getSiblings(entityId)
          .flatMap((loserId) => (this.cow.isOverridden(loserId) ? [] : (this.heldLinksOf(loserId) ?? [])))
      : [];
    const type = held?.type ?? losers[0]?.type;
    if (type === undefined) return [];
    const own = held?.links ?? [];
    const merges = (link: ViewLink) => this.unionLinks.has(`${type} ${link.role} ${link.toType}`);
    const resolve = (id: string) => this.cow.resolve(id);
    const links = [
      ...own,
      ...SiblingMerge.mergeLinks(
        own.filter(merges),
        losers.map((loser) => loser.links.filter(merges)),
        resolve,
      ),
    ];
    const targets = new Set<string>();
    const composed: ViewLink[] = [];
    for (const link of links) {
      const resolved = this.cow.resolveLink(link);
      if (merges(link)) {
        const key = `${link.role} ${link.toType} ${resolved.toId}`;
        if (targets.has(key)) continue;
        targets.add(key);
      }
      composed.push({ ...resolved, fromId: entityId });
    }
    return composed;
  }

  /** The composed rows, before the lookup indices: each list across the chain, COW-resolved. */
  private composeLists(): RulesetLists {
    // A row is left out when a copy overrides it or it's a sibling loser. A loser's customizations merge into its winner
    // (the customization steps below skip only the overridden ones), and every stored id resolves to the winner.
    // An owned entity whose owner the view leaves out is left out with its customizations: none, mostly
    const { entities, leftOut, merged, taken } = this.composeEntities();
    const { modifiers, excludedModifierIds } = this.composeModifiers(leftOut);
    return {
      entities,
      kindValuesOf: (type: string) => this.composeKindValues(type, leftOut, { merged, taken }),
      linksOf: (entityId: string) => this.composeLinks(entityId),
      tieredIds: this.composeTieredIds(),
      modifiers,
      requirements: this.composeRequirements(leftOut, excludedModifierIds),
      settings: new Map(
        this.chain.flatMap(({ settings }) => (settings ? [[settings.rulesetId, settings.values]] : [])),
      ),
    };
  }

  /**
   * Modifiers, the fork's first: a copied source's and an owned entity's the view leaves out are left out, and a sibling
   * loser's the merge leaves out (`SiblingMerge.mergeModifiers`); the rest of a loser's move to its winner. Every
   * modifier left out is excluded, its requirements with it.
   */
  private composeModifiers(leftOut: ReadonlySet<string>) {
    const siblingRows = new SiblingRows<Modifier>(this.cow);
    const excludedModifierIds = new Set<string>();
    for (const raw of this.chain) {
      for (const m of raw.modifiers) {
        const isVisible = !this.cow.isOverridden(m.sourceId) && !leftOut.has(m.sourceId);
        if (isVisible) siblingRows.add(m, m.sourceId);
        else excludedModifierIds.add(m.id);
      }
    }
    const groups = siblingRows.getGroups();
    const taken = new Set(groups.flatMap(({ own, siblings }) => SiblingMerge.mergeModifiers(own, siblings)));
    for (const m of groups.flatMap(({ siblings }) => siblings.flat())) if (!taken.has(m)) excludedModifierIds.add(m.id);

    return { modifiers: siblingRows.moveTaken(taken, (m, sourceId) => ({ ...m, sourceId })), excludedModifierIds };
  }

  /**
   * Requirements, the fork's first: a modifier's stay unless the modifier was excluded. An entity's are left out with a
   * copied entity and an owned entity the view leaves out; a sibling loser's merge into its winner's as trees
   * (`SiblingMerge.mergeRequirements`, which `EntityCopy` writes the same way), after the rest.
   */
  private composeRequirements(leftOut: ReadonlySet<string>, excludedModifierIds: Set<string>): Requirement[] {
    const siblingRows = new SiblingRows<Requirement>(this.cow);
    for (const raw of this.chain) {
      for (const r of raw.requirements) {
        const isVisible =
          r.entityType === "modifiers"
            ? !excludedModifierIds.has(r.entityId)
            : !this.cow.isOverridden(r.entityId) && !leftOut.has(r.entityId);
        if (isVisible) siblingRows.add(r, r.entityId);
      }
    }
    return siblingRows.withMerged(
      siblingRows
        .getGroups()
        .flatMap(({ winnerId, own, siblings }) => SiblingMerge.mergeRequirements(own, siblings, winnerId)),
    );
  }

  /** A list's rows across the chain, the fork's first, without the overridden ones and the sibling losers. */
  private composeRows<T extends { id: string }>(pick: (raw: RulesetRawData) => T[]): T[] {
    return this.chain.flatMap((raw) => pick(raw).filter((item) => !this.cow.isHidden(item.id)));
  }

  /** The tiered targets: the union across the chain of those the view shows. */
  private composeTieredIds(): Set<string> {
    const tieredIds = new Set<string>();
    for (const raw of this.chain) for (const id of raw.tieredIds) if (!this.cow.isHidden(id)) tieredIds.add(id);

    return tieredIds;
  }

  /**
   * An entity's links as its ruleset holds them (`entityId`, as stored), and its kind: none for one that holds none.
   * An entity is one ruleset's of the chain.
   */
  private heldLinksOf(entityId: string): HeldLinks | undefined {
    for (const raw of this.chain) {
      const held = raw.links.get(entityId);
      if (held) return held;
    }
    return undefined;
  }

  /**
   * A kind's rows (`rows`, of `type`, as the view shows them), each winner of sibling copies with its losers' fields and
   * single links merged in (`SiblingMerge.mergeValues`, by each field's and role's declared merge, against what each
   * copied, which `EntityCopy` writes the same way): but a loser a copy overrides or the view leaves out (`leftOut`:
   * an owned one), which gives none, and neither its source. What each loser gave its winner goes in `taken`, by the
   * loser, and each winner's merged values in `merged`.
   */
  private mergeSiblings(
    type: string,
    rows: ViewEntity[],
    leftOut: ReadonlySet<string>,
    { merged, taken }: SiblingMerges,
  ): ViewEntity[] {
    if (this.cow.siblingIds.size === 0) return rows;
    const stored = new Map(this.chain.flatMap((raw) => (raw.entities[type] ?? []).map((row) => [row.id, row])));
    return rows.map((row) => {
      if (!this.cow.hasSiblings(row.id)) return row;
      const loserIds = this.cow.getSiblings(row.id);
      const gives = (loserId: string) => !this.cow.isOverridden(loserId) && !leftOut.has(loserId);
      const siblings = loserIds.map((loserId) => {
        const loser = stored.get(loserId);
        return loser && gives(loserId) ? loser : OwnerValues.NONE;
      });
      // What each copy copied: a value it changed from it is one it set. A loser that gives none has none
      const sourceOf = (id: string) => {
        const sourceId = this.cow.sourceOf(id);
        return sourceId === undefined ? undefined : stored.get(sourceId);
      };
      const sources = {
        own: sourceOf(row.id),
        siblings: loserIds.map((loserId) => (stored.has(loserId) && gives(loserId) ? sourceOf(loserId) : undefined)),
      };
      const merging = SiblingMerge.mergeValues(row, siblings, type, this.declared, sources);
      for (const [index, loserId] of loserIds.entries()) taken.set(loserId, merging.taken[index]);
      merged.set(row.id, merging.values);
      return { ...row, ...merging.values };
    });
  }

  build(): RulesetData {
    const kinds = Object.fromEntries(
      this.schema.kinds.map(({ customizable, inherits, inventory, template, type }) => [
        type,
        {
          customizable,
          ...(inherits && { inherits }),
          ...(inventory && { inventory }),
          ...(template && { template }),
        },
      ]),
    );
    return new RulesetData(this.composeLists(), this.cow, this.words, kinds);
  }
}
