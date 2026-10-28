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
  constructor(
    private readonly modules: [BaseRules, RulesetModule][],
    private readonly storage: StorageEngine,
  ) {
    for (const [, module] of modules) this.describeModule(module);
  }

  /** Every module's rules, checked once: the modules never change. */
  private static instance: RulesEngine | undefined;

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
    RulesEngine.instance ??= new RulesEngine(Modules.all(), StorageEngine.shared());
    return RulesEngine.instance;
  }

  /** Refuses a field a kind's class names (`field`, what it's for: `what`) that its storage holds none of for it. */
  private checkField(type: string, field: string, what: string) {
    if (!this.storage.field(type, field)) throw new Error(`${type} name ${field} for ${what}, which they don't hold`);
  }

  /**
   * How a kind's row copies one (`type`, a kind whose class makes copies): its declaration's words (`words`: a
   * duplicate's locked fields, the most variants at once), the role a copy names its template by (the one its kind
   * reads its fields off through, `DeclaredFields.inheritance`) and its template's flag (`StoredKind.template`).
   * Refused where its declaration or its storage says none of them.
   */
  private copiesOf(type: string, words: EntityKindDeclaration["copies"]): EntityKindDescription["copies"] {
    const source = this.storage.declaredFields().inheritance(type)?.role;
    const { template } = this.storage.kind(type);
    if (!words || !source || !template)
      throw new Error(`${type} make copies: their rules word them, and their storage stores a template and its source`);
    return { ...words, source, template: { field: template } };
  }

  /**
   * A kind as its ruleset's page shows it: its declaration's presentation (`declared`), and what it can do, its class's
   * (`capabilitiesOf`) and its storage's (its copies' template, the links its page edits, its customization page among
   * its module's, `pages`, its pools' kind), each key in its name's order, as a declaration writes them. Refused when
   * its declaration words copies its class makes none of, or its class names a field its kind doesn't hold.
   */
  private describeKind(
    module: RulesetModule,
    pages: RulesDescription["customizationPages"],
    declared: EntityKindDeclaration,
  ): EntityKindDescription {
    const { copies: words, ...presentation } = declared;
    const { type } = declared;
    const capabilities = module.entities.capabilitiesOf(type);
    if (words && !capabilities.copies) throw new Error(`${type} make no copies, which their rules word`);
    if (capabilities.lockedName) this.checkField(type, capabilities.lockedName.field, "the flag that locks their name");
    if (capabilities.families) this.checkField(type, capabilities.families.field, "their family");
    const links = this.linksOf(type);
    const described: EntityKindDescription = {
      ...presentation,
      ...(capabilities.copies && { copies: this.copiesOf(type, words) }),
      ...(capabilities.families && { families: true }),
      ...(capabilities.levels && { levels: true }),
      ...(links && { links }),
      ...(capabilities.lockedName && { lockedName: capabilities.lockedName }),
      opens: capabilities.progression
        ? "progression"
        : pages.some((page) => page.type === type)
          ? "customization"
          : "page",
      ...(capabilities.partitioned && { partitioned: true }),
      ...(capabilities.pools && { pools: this.poolsOf(type, capabilities.pools) }),
      ...(capabilities.readOnly && { readOnly: true }),
    };
    return RulesEngine.inNameOrder(described);
  }

  /**
   * What a module's rulesets share: its rules' declaration, its kinds' with what each can do (`describeKind`: where its
   * row opens among them), its lists' and its progression's with what their fields' declarations say of their values
   * (`listsOf`, `progressionOf`), the kinds whose customizations have a page of their own, as its storage declares
   * them, its fields' and its importers.
   */
  private describeModule(module: RulesetModule): RulesDescription {
    const rules = module.ruleset.describeRules();
    const pages = StorageEngine.customizationPagesOf(module.storage);
    return {
      ...rules,
      kinds: rules.kinds.map((kind) => this.describeKind(module, pages, kind)),
      lists: RulesEngine.listsOf(module, rules.lists),
      progression: this.progressionOf(module, rules),
      customizationPages: pages,
      fields: RulesEngine.fieldsOf(module),
      importers: module.imports.describeImporters().programs,
    };
  }

  /**
   * The entities a kind's page links one to (`type`), by the role its storage declares edited
   * (`StoredKind.editedLinks`: 3.5's class's skills) and its links' kind: none for a kind without.
   */
  private linksOf(type: string): EntityLinksDescription | undefined {
    const edited = [...this.storage.editedLinks()].find(([, { from }]) => from === type);
    return edited && { role: edited[0], type: edited[1].to };
  }

  /** The module that stores a kind (`type`). */
  private moduleOf(type: string): RulesetModule {
    const found = this.modules.find(([, module]) => type in module.storage.kinds);
    if (!found) throw new Error(`No module stores the kind ${type}`);
    return found[1];
  }

  /**
   * The pools a kind's list narrows by (`type`; `pools`, its class's: the role of its entities' links to them and the
   * URL's key): their kind, the one its storage's role links to, and the scope they're picked in, its own.
   */
  private poolsOf(type: string, { param, role }: NonNullable<KindCapabilities["pools"]>): EntityPoolsDescription {
    const linked = this.storage.registries().linkRoles.filter((def) => def.role === role && def.fromType === type);
    const [pool, ...others] = [...new Set(linked.map((def) => def.toType))];
    if (!pool || others.length > 0) throw new Error(`${type} narrow by their ${role} links to no one kind`);
    return { param, role, type: pool, scope: type };
  }

  /**
   * How a module's classes progress (`rules`, its declaration): its tracks, each with its field's label and bounds
   * (`trackOf`), its levels' fields', the one kind its kind with a progression owns (3.5's class levels). Refused when
   * it has tracks but no one such kind.
   */
  private progressionOf(module: RulesetModule, rules: RulesDeclaration): RulesDescription["progression"] {
    const { tracks } = rules.progression;
    if (tracks.length === 0) return { ...rules.progression, tracks: [] };
    const owners = rules.kinds.filter(({ type }) => module.entities.capabilitiesOf(type).progression);
    const [levels, ...others] = owners.flatMap(({ type }) => this.storage.ownedKinds(type));
    if (!levels || others.length > 0) throw new Error("No one kind of levels holds the progression's tracks");
    return {
      ...rules.progression,
      tracks: tracks.map((track) => RulesEngine.trackOf(levels, module.fields[levels], track)),
    };
  }

  /** What each base rules' rulesets share, by base rules: what the client reads once, for every ruleset it shows. */
  describeAll(): Record<BaseRules, RulesDescription> {
    return Object.fromEntries(
      this.modules.map(([baseRules, module]) => [baseRules, this.describeModule(module)]),
    ) as Record<BaseRules, RulesDescription>;
  }

  /**
   * What a base rules' refusals call an entity of a type (`type`), in its rules' word, as its rulesets' views do
   * (`RulesetData.labelOf`): "Class level". What the server's own refusals of an entity name it by.
   */
  labelOf(baseRules: BaseRules, type: string): string {
    return RulesetData.labelIn(Modules.of(baseRules).ruleset.describeRules().words, type);
  }

  /**
   * The kinds a fork restores to its parent's: every kind no other owns (`StorageEngine.standaloneKinds`) but those its
   * rules keep to themselves, which no form writes (`readOnly`: 3.5's abilities). What a revert takes and a ruleset's
   * Local Changes offer.
   */
  restorableKinds(): EntityType[] {
    return this.storage.standaloneKinds().filter((type) => !this.moduleOf(type).entities.capabilitiesOf(type).readOnly);
  }
}
