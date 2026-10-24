import type { CowData } from "@/engine/core/cow/index.ts";
import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

import type { Row } from "./rows.ts";
import RulesetData, { type RulesetLists } from "./RulesetData.ts";
import SiblingMerge from "./SiblingMerge.ts";
import SiblingRows from "./SiblingRows.ts";

/** A list a kind's rows nest (a feat's pools): its links, each with its target's row. */
interface ViewList {
  /** The column its links name their entity by */
  from: string;
  /** The key its rows hold it under */
  name: string;
  /** The key a link holds its target's row under */
  target: string;
  /** The column a link names its target by, and the kind its targets are */
  to: string;
  toType: string;
}

/** A row of the view: its id, and its columns. */
type ViewRow = Row & { id: string };

/** A ruleset's own rows, none of its sources': what the server fetches for each ruleset of a chain to compose. */
export interface RulesetRawData {
  /** Each kind's rows, by its type, an owned kind's by position and owner */
  entities: Record<string, ViewRow[]>;
  /** Each join's rows, by its name, but those a kind's lists nest */
  joins: Record<string, Row[]>;
  /** Every modifier whose source is an entity in this ruleset — all sourceTypes. */
  modifiers: Modifier[];
  /** Every property row owned by this ruleset — all entityTypes. Consumers filter. */
  properties: Property[];
  /** Every requirement row in this ruleset, including those attached to modifiers. */
  requirements: Requirement[];
  /** Of the entities its lists name, those a link of a join with a tier points at */
  tieredIds: Set<string>;
}

/**
 * What a ruleset's view is composed by, of its modules' storage declarations: each kind (its owner's kind and the
 * column naming it, an owned kind's; the lists its rows nest), and each join its kinds' lists don't nest (the kind it's
 * from, and the column naming it).
 */
export interface ViewSchema {
  joins: { from: string; fromColumn: string; name: string }[];
  kinds: { lists: ViewList[]; owner?: { column: string; type: string }; type: string }[];
}

/**
 * A ruleset's view: its own rows and its source chain's (`chain`, the ruleset's first), composed by its copy-on-write
 * data. The copies' and siblings' exclusions apply, a sibling loser's customizations merge into its winner's, references
 * resolve to the winners, and every id-keyed map takes a stored id. An owned kind's rows follow their owners', and a
 * join's rows the entities they're from. Built on every read (`RulesetViews.getData`).
 */
export default class RulesetComposition {
  /**
   * `propertyTypes`: the ruleset's property types, as its rules read them, which its view orders its entities'
   * properties by; `schema`: what its modules declare of its kinds and joins; `labels`: what its module calls an entity
   * of each kind.
   */
  constructor(
    chain: RulesetRawData[],
    cow: CowData,
    propertyTypes: PropertyTypesProvider,
    isSingle: (entityType: string, type: string) => boolean,
    schema: ViewSchema,
    labels: Readonly<Record<string, string>>,
  ) {
    this.labels = labels;
    this.chain = chain;
    this.cow = cow;
    this.propertyTypes = propertyTypes;
    this.isSingle = isSingle;
    this.schema = schema;
  }

  private readonly chain: RulesetRawData[];

  private readonly cow: CowData;

  /** Whether a property type holds a single value, which a sibling merge takes one of (`SiblingMerge`) */
  private readonly isSingle: (entityType: string, type: string) => boolean;

  /** What the ruleset's module calls an entity of each kind, which its view answers */
  private readonly labels: Readonly<Record<string, string>>;

  private readonly propertyTypes: PropertyTypesProvider;

  private readonly schema: ViewSchema;

  /**
   * Each sibling loser's links of a list (`list`, a kind's: `type`), by the loser, on its winner (their `from`), for the
   * winner's links to merge: read from the raw chain, since compose leaves the losers out.
   */
  private collectSiblingLinks(type: string, list: ViewList) {
    const links = new Map<string, Row[]>();
    if (this.cow.siblingIds.size === 0) return links;
    for (const raw of this.chain) {
      for (const row of raw.entities[type] ?? []) {
        const winnerId = this.cow.isOverridden(row.id) ? undefined : this.cow.getWinner(row.id);
        if (!winnerId) continue;
        links.set(
          row.id,
          (row[list.name] as Row[]).map((link) => ({ ...link, [list.from]: winnerId })),
        );
      }
    }
    return links;
  }

  /**
   * Each kind's rows, an owner's before the kinds it owns: an owned kind's rows whose owner the view shows (a copied
   * class's levels are overridden by its copy's, paired by `CowDataBuilder`, and a sibling loser's owner leaves its
   * own out), and each kind's visible ids. Then each join's rows of the entities it's from the view shows.
   */
  private composeEntities() {
    const visibleIds = new Map<string, Set<string>>();
    const entities = new Map<string, ViewRow[]>();
    const kinds = [
      ...this.schema.kinds.filter((kind) => !kind.owner),
      ...this.schema.kinds.filter((kind) => kind.owner),
    ];
    for (const { owner, type } of kinds) {
      const composed = this.composeRows((raw) => raw.entities[type] ?? []);
      const owners = owner ? visibleIds.get(owner.type) : undefined;
      const rows = owner ? composed.filter((row) => owners?.has(row[owner.column] as string)) : composed;
      visibleIds.set(type, new Set(rows.map((row) => row.id)));
      entities.set(type, rows);
    }
    const joins = new Map<string, Row[]>();
    for (const { from, fromColumn, name } of this.schema.joins) {
      const froms = visibleIds.get(from);
      const rows = this.chain.flatMap((raw) =>
        (raw.joins[name] ?? []).filter((row) => !froms || froms.has(row[fromColumn] as string)),
      );
      joins.set(name, this.cow.resolveRows(rows as ViewRow[]));
    }
    const resolved = new Map([...entities].map(([type, rows]) => [type, this.cow.resolveRows(rows)]));
    return { entities: resolved, joins, visibleIds };
  }

  /** The composed rows, before the lookup indices: each list across the chain, COW-resolved. */
  private composeLists(): RulesetLists {
    // A row is left out when a copy overrides it or it's a sibling loser. A loser's customizations merge into its winner
    // (the customization steps below skip only the overridden ones), and every stored id resolves to the winner.
    const { entities, joins, visibleIds } = this.composeEntities();
    // An owned entity whose owner the view leaves out is left out with its customizations
    const ownedTypes = new Set(this.schema.kinds.filter((kind) => kind.owner).map((kind) => kind.type));
    const isLeftOut = (entityType: string, id: string) =>
      ownedTypes.has(entityType) && !visibleIds.get(entityType)?.has(id);
    const { modifiers, excludedModifierIds } = this.composeModifiers(isLeftOut);
    const composed = {
      entities,
      joins,
      tieredIds: this.composeTieredIds(),
      properties: this.composeProperties(isLeftOut),
      modifiers,
      requirements: this.composeRequirements(isLeftOut, excludedModifierIds),
    };
    if (!this.cow.isEmpty()) this.resolveListLinks(entities);

    return composed;
  }

  /**
   * Modifiers, the fork's first: a copied source's and an owned entity's the view leaves out are left out, and a sibling
   * loser's the merge leaves out (`SiblingMerge.mergeModifiers`); the rest of a loser's move to its winner. Every
   * modifier left out is excluded, its requirements with it.
   */
  private composeModifiers(isLeftOut: (entityType: string, id: string) => boolean) {
    const siblingRows = new SiblingRows<Modifier>(this.cow);
    const excludedModifierIds = new Set<string>();
    for (const raw of this.chain) {
      for (const m of raw.modifiers) {
        const isVisible = !this.cow.isOverridden(m.sourceId) && !isLeftOut(m.sourceType, m.sourceId);
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
   * Properties, the fork's first: a copied entity's and an owned entity's the view leaves out are left out, and a
   * sibling loser's the merge leaves out (`SiblingMerge.mergeProperties`); the rest of a loser's move to its winner. A
   * ruleset's own properties always stay: a ruleset is never overridden.
   */
  private composeProperties(isLeftOut: (entityType: string, id: string) => boolean): Property[] {
    const siblingRows = new SiblingRows<Property>(this.cow);
    for (const raw of this.chain) {
      for (const p of raw.properties) {
        if (this.cow.isOverridden(p.entityId)) continue;
        if (isLeftOut(p.entityType, p.entityId)) continue;
        siblingRows.add(p, p.entityId);
      }
    }
    const taken = new Set(
      siblingRows
        .getGroups()
        .flatMap(({ own, siblings }) => SiblingMerge.mergeProperties(own, siblings, this.isSingle)),
    );
    return siblingRows.moveTaken(taken, (p, entityId) => ({ ...p, entityId }));
  }

  /**
   * Requirements, the fork's first: a modifier's stay unless the modifier was excluded. An entity's are left out with a
   * copied entity and an owned entity the view leaves out; a sibling loser's merge into its winner's as trees
   * (`SiblingMerge.mergeRequirements`, which `EntityCopy` writes the same way), after the rest.
   */
  private composeRequirements(
    isLeftOut: (entityType: string, id: string) => boolean,
    excludedModifierIds: Set<string>,
  ): Requirement[] {
    const siblingRows = new SiblingRows<Requirement>(this.cow);
    for (const raw of this.chain) {
      for (const r of raw.requirements) {
        const isVisible =
          r.entityType === "modifiers"
            ? !excludedModifierIds.has(r.entityId)
            : !this.cow.isOverridden(r.entityId) && !isLeftOut(r.entityType, r.entityId);
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
   * An entity's links of a list (`list`), its siblings' merged in (`SiblingMerge.mergeListLinks`, which `EntityCopy`
   * writes the same way), each to the target that stands for it. Its own links that resolve to one target collapse too,
   * the first one kept.
   */
  private linkTargets(
    entityId: string,
    own: Row[],
    list: ViewList,
    siblingLinks: Map<string, Row[]>,
    targetsById: Map<string, ViewRow>,
  ): Row[] {
    const links = this.cow.hasSiblings(entityId)
      ? [
          ...own,
          ...SiblingMerge.mergeListLinks(
            own,
            this.cow.getSiblings(entityId).map((loserId) => siblingLinks.get(loserId) ?? []),
            (id) => this.cow.resolve(id),
            list.to,
          ),
        ]
      : own;
    const targetIds = new Set<string>();
    const resolved: Row[] = [];
    for (const link of links) {
      const targetId = this.cow.resolve(link[list.to] as string);
      if (targetIds.has(targetId)) continue;
      targetIds.add(targetId);
      resolved.push({ ...link, [list.to]: targetId, [list.target]: targetsById.get(targetId) ?? link[list.target] });
    }
    return resolved;
  }

  /**
   * Resolve the ids inside the kinds' list links (a feat's pools), which `CowData.resolveRows` doesn't reach: each
   * link's target, and the target's row on it, to the one that stands for it (after a target's copy or a sibling merge),
   * so that a reader comparing it with the view's ids (`rulesetData.byId`) matches. A sibling loser's links merge into
   * its winner's here. Siblings always imply stale ids (`CowDataBuilder` aliases each sibling loser to its winner), so
   * the caller runs this only when the scope resolves an id, and the shallow-copied rows are safe to mutate.
   */
  private resolveListLinks(entities: Map<string, ViewRow[]>) {
    for (const { lists, type } of this.schema.kinds) {
      for (const list of lists) {
        const siblingLinks = this.collectSiblingLinks(type, list);
        const targetsById = new Map((entities.get(list.toType) ?? []).map((target) => [target.id, target]));
        for (const row of entities.get(type) ?? [])
          row[list.name] = this.linkTargets(row.id, row[list.name] as Row[], list, siblingLinks, targetsById);
      }
    }
  }

  build(): RulesetData {
    return new RulesetData(this.composeLists(), this.cow, this.propertyTypes, this.labels);
  }
}
