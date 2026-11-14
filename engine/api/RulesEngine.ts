import type { KindCapabilities } from "@/engine/core/entities/index.ts";
import { Field, FieldCodec, type Fields } from "@/engine/core/fields/index.ts";
import type {
  EntityKindDeclaration,
  EntityKindDescription,
  EntityLinksDescription,
  EntityPoolsDescription,
  ListColumn,
  ListColumnDeclaration,
  ProgressionTrack,
  ProgressionTrackDeclaration,
  RulesDeclaration,
  RulesDescription,
  RulesetModule,
} from "@/engine/core/module/index.ts";
import { RulesetData } from "@/engine/core/view/index.ts";
import type { NumberSpec } from "@/shared/customization/fields.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules, { type EntityType } from "./Modules.ts";
import StorageEngine from "./StorageEngine.ts";

/** A base rules' module, and its storage, built of it. */
interface ModuleEntry {
  module: RulesetModule;
  storage: StorageEngine;
}

/**
 * The engine asked of what every base rules' rulesets share, before any ruleset: their words, kinds, fields, license
 * and the programs they import characters from, and the kinds a fork restores. What a kind can do is its rules' class's
 * (`KindCapabilities`) and its storage's (`StorageEngine`), which its description reads past its declaration's words;
 * what its lists' columns and its progression's tracks say of their values, their fields' declarations.
 * Every module's kinds are described once as it's built (`shared`, as the server loads), so a declaration its rules or
 * its storage contradict fails then, not on a request. It never takes a ruleset's view or scope, only base rules and
 * types, which is why `arkyvree/one-engine-op` counts none of its answers as an operation.
 */
export default class RulesEngine {
  constructor(modules: [BaseRules, RulesetModule][]) {
    this.modules = new Map(
      modules.map(([baseRules, module]) => [baseRules, { module, storage: new StorageEngine(baseRules, module) }]),
    );
    for (const baseRules of this.modules.keys()) this.describeModule(baseRules);
  }

  /** Every module's rules, checked once: the modules never change. */
  private static instance: RulesEngine | undefined;

  /**
   * Refuses a field a kind's class names (`field`, what it's for: `what`) that its storage (`storage`, its module's)
   * holds none of for it.
   */
  private static checkField(storage: StorageEngine, type: string, field: string, what: string) {
    if (!storage.field(type, field)) throw new Error(`${type} name ${field} for ${what}, which they don't hold`);
  }

  /**
   * A list's column as its list shows it (`declared`, of the list of `type`, whose fields are `fields`): its own, and
   * what the declaration of its field (`field`), or of its links (`role`), says of its value: its label where the
   * column gives none, a number's labels by value (a hit die's 10, "d10") and its unit, a reference's kind. Refused when
   * its type declares no such field.
   */
  private static columnOf(type: string, fields: Fields | undefined, declared: ListColumnDeclaration): ListColumn {
    const part = declared.field === undefined ? "links" : "fields";
    const at = declared.field ?? declared.role;
    const leaf = Field.leavesOf(fields ?? {}).find((each) => {
      const place = Field.placeOf(each);
      return place.part === part && place.at === at;
    });
    if (!leaf) throw new Error(`${type} list a column of their ${part} ${at}, which they don't declare`);
    const { labels, unit, values }: Partial<NumberSpec> = leaf.kind === "number" ? leaf : {};
    return RulesEngine.inNameOrder({
      ...declared,
      label: declared.label ?? leaf.label,
      ...(labels && values && { labels: Object.fromEntries(values.map((value, index) => [value, labels[index]])) }),
      ...(leaf.kind === "ref" && { references: leaf.references }),
      ...(unit !== undefined && { unit }),
    });
  }

  /**
   * How a kind's row copies one (`type`, a kind whose class makes copies, stored by `storage`): its declaration's words
   * (`words`: a duplicate's locked fields, the most variants at once), the role a copy names its template by (the one
   * its kind reads its fields off through, `DeclaredFields.inheritance`) and its template's flag
   * (`StoredKind.template`). Refused where its declaration or its storage says none of them.
   */
  private static copiesOf(
    storage: StorageEngine,
    type: string,
    words: EntityKindDeclaration["copies"],
  ): EntityKindDescription["copies"] {
    const source = storage.declaredFields().inheritance(type)?.role;
    const { template } = storage.kind(type);
    if (!words || !source || !template)
      throw new Error(`${type} make copies: their rules word them, and their storage stores a template and its source`);
    return { ...words, source, template: { field: template } };
  }

  /**
   * Each owner type's fields as its form shows them (`module.fields`, its declarations: an entity type's, `rulesets` a
   * ruleset's Settings'), by type, in its name's order: a type whose form shows none left out. Its declarations alone
   * describe them, whatever ruleset a form is of.
   */
  private static fieldsOf(module: RulesetModule): RulesDescription["fields"] {
    return Object.fromEntries(
      Object.keys(module.fields)
        .toSorted()
        .flatMap((type) => {
          const described = new FieldCodec(module.fields[type]).describe();
          return described.length > 0 ? [[type, described]] : [];
        }),
    );
  }

  /** A description's keys in their names' order, as a declaration writes them. */
  private static inNameOrder<T extends object>(described: T): T {
    const sorted = Object.entries(described).toSorted(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(sorted) as unknown as T;
  }

  /**
   * The entities a kind's page links one to (`type`), by the role its storage (`storage`) declares edited
   * (`StoredKind.editedLinks`: 3.5's class's skills) and its links' kind: none for a kind without.
   */
  private static linksOf(storage: StorageEngine, type: string): EntityLinksDescription | undefined {
    const edited = [...storage.editedLinks()].find(([, { from }]) => from === type);
    return edited && { role: edited[0], type: edited[1].to };
  }

  /**
   * Each type's list as its ruleset's page shows it (`lists`, its rules' declaration): its columns, each with what its
   * field's declaration says of its value (`columnOf`).
   */
  private static listsOf(module: RulesetModule, lists: RulesDeclaration["lists"]): RulesDescription["lists"] {
    const described = Object.entries(lists).flatMap(([type, list]) => {
      if (!list) return [];
      const columns = list.columns.map((column) => RulesEngine.columnOf(type, module.fields[type], column));
      return [[type, { ...list, columns }] as const];
    });
    return Object.fromEntries(described);
  }

  /**
   * The pools a kind's list narrows by (`type`; `pools`, its class's: the role of its entities' links to them and the
   * URL's key): their kind, the one its storage's role links to (`storage`), and the scope they're picked in, its own.
   */
  private static poolsOf(
    storage: StorageEngine,
    type: string,
    { param, role }: NonNullable<KindCapabilities["pools"]>,
  ): EntityPoolsDescription {
    const linked = storage.registries().linkRoles.filter((def) => def.role === role && def.fromType === type);
    const [pool, ...others] = [...new Set(linked.map((def) => def.toType))];
    if (!pool || others.length > 0) throw new Error(`${type} narrow by their ${role} links to no one kind`);
    return { param, role, type: pool, scope: type };
  }

  /**
   * The tables a kind with a progression answers, by name (`…/tables/{table}`), as its progression names them (`rules`'s
   * declaration): what its levels grant's (`grants.table`), its lists' (`counts.lists`), and each its tables' tab edits
   * is read from.
   */
  private static tablesOf({ counts, grants, tables }: RulesDeclaration["progression"]): string[] {
    const names = [grants?.table, counts?.lists, ...tables.map(({ table }) => table)];
    return [...new Set(names.filter((name) => name !== undefined))];
  }

  /**
   * A class table's column as its Progression tab sets it (`declared`, of the levels of `type`, whose fields are
   * `fields`): its own, and its field's label and bounds, the one its levels declare at its `field`, or their one list of
   * amounts (links with an amount each: 3.5's base bonus to each save). Refused when its levels declare no one such
   * field, or one without both bounds.
   */
  private static trackOf(
    type: string,
    fields: Fields | undefined,
    declared: ProgressionTrackDeclaration,
  ): ProgressionTrack {
    const [leaf, ...others] = Field.leavesOf(fields ?? {}).filter((each) => {
      if (declared.source === "amounts") return each.kind === "links" && each.entries === "amount";
      const place = Field.placeOf(each);
      return place.part === "fields" && place.at === declared.field;
    });
    const bounded = leaf?.kind === "number" || leaf?.kind === "links" ? leaf : undefined;
    if (!bounded || others.length > 0 || bounded.min === undefined || bounded.max === undefined)
      throw new Error(`${type} declare no one field with bounds for the track ${declared.key}`);
    return RulesEngine.inNameOrder({ ...declared, label: bounded.label, max: bounded.max, min: bounded.min });
  }

  /** Every registered module's rules, checked: one instance, built on its first read. */
  static shared(): RulesEngine {
    RulesEngine.instance ??= new RulesEngine(Modules.all());
    return RulesEngine.instance;
  }

  /** Each registered module, with its storage, by its base rules. */
  private readonly modules: ReadonlyMap<BaseRules, ModuleEntry>;

  /**
   * A base rules' kind as its rulesets' pages show it: its declaration's presentation (`declared`), and what it can do,
   * its class's (`capabilitiesOf`: a progression's, with the tables its rules' progression names, `tablesOf`) and its
   * storage's (its copies' template, the links its page edits, its customization page, its pools' kind), each key in
   * its name's order, as a declaration writes them. Refused when its declaration words copies its class makes none of,
   * or its class names a field its kind doesn't hold.
   */
  private describeKind(baseRules: BaseRules, declared: EntityKindDeclaration): EntityKindDescription {
    const { module, storage } = this.entryOf(baseRules);
    const { copies: words, ...presentation } = declared;
    const { type } = declared;
    const capabilities = module.entities.capabilitiesOf(type);
    if (words && !capabilities.copies) throw new Error(`${type} make no copies, which their rules word`);
    if (capabilities.lockedName)
      RulesEngine.checkField(storage, type, capabilities.lockedName.field, "the flag that locks their name");
    if (capabilities.families) RulesEngine.checkField(storage, type, capabilities.families.field, "their family");
    const links = RulesEngine.linksOf(storage, type);
    const described: EntityKindDescription = {
      ...presentation,
      ...(capabilities.copies && { copies: RulesEngine.copiesOf(storage, type, words) }),
      ...(capabilities.families && { families: true }),
      ...(capabilities.tiered && { tiered: true }),
      ...(links && { links }),
      ...(capabilities.lockedName && { lockedName: capabilities.lockedName }),
      opens: capabilities.progression
        ? "progression"
        : storage.customizationPages().has(type)
          ? "customization"
          : "page",
      ...(capabilities.partitioned && { partitioned: true }),
      ...(capabilities.pools && { pools: RulesEngine.poolsOf(storage, type, capabilities.pools) }),
      ...(capabilities.readOnly && { readOnly: true }),
      ...(capabilities.progression && {
        tables: RulesEngine.tablesOf(module.ruleset.describeRules().progression),
      }),
    };
    return RulesEngine.inNameOrder(described);
  }

  /**
   * What a base rules' rulesets share: its rules' declaration, its kinds' with what each can do (`describeKind`: where
   * its row opens among them), its lists' and its progression's with what their fields' declarations say of their
   * values (`listsOf`, `progressionOf`), the kinds its storage declares customizable and those whose customizations
   * have a page of their own, its fields' and its importers.
   */
  private describeModule(baseRules: BaseRules): RulesDescription {
    const { module, storage } = this.entryOf(baseRules);
    const rules = module.ruleset.describeRules();
    return {
      ...rules,
      advancementWord: module.advancements.advancementWord,
      customizable: [...storage.customizableKinds()],
      kinds: rules.kinds.map((kind) => this.describeKind(baseRules, kind)),
      lists: RulesEngine.listsOf(module, rules.lists),
      progression: this.progressionOf(baseRules),
      customizationPages: [...storage.customizationPages().values()],
      fields: RulesEngine.fieldsOf(module),
      importers: module.imports.describeImporters().programs,
    };
  }

  /** A base rules' module and its storage. */
  private entryOf(baseRules: BaseRules): ModuleEntry {
    const entry = this.modules.get(baseRules);
    if (!entry) throw new Error(`${baseRules} is no registered module's base rules`);
    return entry;
  }

  /**
   * How a base rules' classes progress: its rules' tracks, each with its field's label and bounds (`trackOf`), its
   * levels' fields', the one kind its kind with a progression owns (3.5's class levels). Refused when it has tracks but
   * no one such kind.
   */
  private progressionOf(baseRules: BaseRules): RulesDescription["progression"] {
    const { module, storage } = this.entryOf(baseRules);
    const rules = module.ruleset.describeRules();
    const { tracks } = rules.progression;
    if (tracks.length === 0) return { ...rules.progression, tracks: [] };
    const owners = rules.kinds.filter(({ type }) => module.entities.capabilitiesOf(type).progression);
    const [owned, ...others] = owners.flatMap(({ type }) => storage.ownedKinds(type));
    if (!owned || others.length > 0) throw new Error("No one owned kind holds the progression's tracks");
    return {
      ...rules.progression,
      tracks: tracks.map((track) => RulesEngine.trackOf(owned, module.fields[owned], track)),
    };
  }

  /**
   * A base rules' word for an advancement (3.5's "Level"), its advancements part's: what its activities' types read in
   * (`addAdvancement`: "Add Level"), which the activity log's search and sort go by.
   */
  advancementWordOf(baseRules: BaseRules): string {
    return this.entryOf(baseRules).module.advancements.advancementWord.one;
  }

  /**
   * The kinds a user customizes, every module's (`StorageEngine.customizableKinds`), each once, by type: what a
   * customization's route takes, its ruleset's own refusing another's.
   */
  customizableKinds(): string[] {
    const kinds = [...this.modules.values()].flatMap(({ storage }) => storage.customizableKinds());
    return [...new Set(kinds)].toSorted((a, b) => a.localeCompare(b));
  }

  /** What each base rules' rulesets share, by base rules: what the client reads once, for every ruleset it shows. */
  describeAll(): Record<BaseRules, RulesDescription> {
    return Object.fromEntries(
      [...this.modules.keys()].map((baseRules) => [baseRules, this.describeModule(baseRules)]),
    ) as Record<BaseRules, RulesDescription>;
  }

  /**
   * What refuses a save whose read of an entity (of `type`) is gone since, in a base rules' words, with what to read
   * again (`refresh`, its owner's type): "Class level no longer exists; refresh the class".
   */
  describeGone(baseRules: BaseRules, type: string, refresh: string): string {
    return RulesetData.goneIn(this.entryOf(baseRules).module.ruleset.describeRules().words, type, refresh);
  }

  /**
   * What refuses a write of an entity (of `type`) its ruleset's view doesn't show, in a base rules' words, as its
   * rulesets' views refuse one (`RulesetData.notFound`): "Class level not found".
   */
  describeNotFound(baseRules: BaseRules, type: string): string {
    return RulesetData.notFoundIn(this.entryOf(baseRules).module.ruleset.describeRules().words, type);
  }

  /**
   * What refuses a fork's restore of an owner (of `ownerType`) whose owned entities (of `ownedType`) characters took
   * and its source doesn't have, in a base rules' words, its owned entities by their position's word
   * (`RulesetData.takenOwnedIn`): "Cannot restore: characters took levels its parent's class doesn't have".
   */
  describeTakenOwned(baseRules: BaseRules, ownedType: string, ownerType: string): string {
    const { words } = this.entryOf(baseRules).module.ruleset.describeRules();
    return RulesetData.takenOwnedIn(words, ownedType, ownerType);
  }

  /**
   * The kinds of a base rules whose entities a target path names by their name alone (`TargetPaths.namedKinds`: 3.5's
   * classes, `classes.familiar.level`): a name of one is its own across its partitions, where another kind's is its own
   * within its partition (what a race or a class is for), as the name index keeps it.
   */
  pathNamedKindsOf(baseRules: BaseRules): string[] {
    return this.entryOf(baseRules).module.targetPaths.namedKinds();
  }

  /**
   * The kinds a route that restores an entity takes, every module's (`restorableKindsOf`), each once: the words its
   * request may name, whose ruleset's own refuse another's.
   */
  restorableKinds(): EntityType[] {
    return [...new Set([...this.modules.keys()].flatMap((baseRules) => this.restorableKindsOf(baseRules)))];
  }

  /**
   * The kinds a fork of a base rules restores to its parent's: its module's kinds no other owns
   * (`StorageEngine.standaloneKinds`) but those its rules keep to themselves, which no form writes (`readOnly`: 3.5's
   * abilities). What a revert takes and a ruleset's Local Changes offer.
   */
  restorableKindsOf(baseRules: BaseRules): EntityType[] {
    const { module, storage } = this.entryOf(baseRules);
    return storage.standaloneKinds().filter((type) => !module.entities.capabilitiesOf(type).readOnly);
  }

  /**
   * The kinds no other owns, every module's (`StorageEngine.standaloneKinds`), each once, in their declarations' order:
   * what the routes by kind take, a ruleset's own refusing another's.
   */
  standaloneKinds(): EntityType[] {
    return [...new Set([...this.modules.values()].flatMap(({ storage }) => storage.standaloneKinds()))];
  }
}
