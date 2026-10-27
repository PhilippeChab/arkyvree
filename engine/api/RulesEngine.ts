import type { KindCapabilities } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";
import type {
  EntityKindDeclaration,
  EntityKindDescription,
  EntityLinksDescription,
  EntityPoolsDescription,
  RulesDescription,
  RulesetModule,
} from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type { EntityType } from "./Modules.ts";
import StorageEngine from "./StorageEngine.ts";

/**
 * The engine asked of what every base rules' rulesets share, before any ruleset: their words, kinds, fields, license
 * and the programs they import characters from, and the kinds a fork restores. What a kind can do is its rules' class's
 * (`KindCapabilities`) and its storage's (`StorageEngine`), which its description reads past its declaration's words.
 */
export default class RulesEngine {
  constructor(
    private readonly modules: [BaseRules, RulesetModule][],
    private readonly storage: StorageEngine,
  ) {}

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
   * (`capabilitiesOf`) and its storage's (its copies' template, the links its page edits, its customization page, its
   * pools' kind), each key in its name's order, as a declaration writes them. Refused when its declaration words copies
   * its class makes none of.
   */
  private describeKind(module: RulesetModule, declared: EntityKindDeclaration): EntityKindDescription {
    const { copies: words, ...presentation } = declared;
    const { type } = declared;
    const capabilities = module.entities.capabilitiesOf(type);
    if (words && !capabilities.copies) throw new Error(`${type} make no copies, which their rules word`);
    const links = this.linksOf(type);
    const described: EntityKindDescription = {
      ...presentation,
      ...(capabilities.copies && { copies: this.copiesOf(type, words) }),
      ...(capabilities.families && { families: capabilities.families }),
      ...(capabilities.levels && { levels: true }),
      ...(links && { links }),
      ...(capabilities.lockedName && { lockedName: capabilities.lockedName }),
      opens: this.opensOf(type, capabilities),
      ...(capabilities.partitioned && { partitioned: true }),
      ...(capabilities.pools && { pools: this.poolsOf(type, capabilities.pools) }),
      ...(capabilities.readOnly && { readOnly: true }),
    };
    const sorted = Object.entries(described).toSorted(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(sorted) as unknown as EntityKindDescription;
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
   * Where a kind's row opens (`type`): its progression page, a kind's with a progression (`capabilities`, its class's:
   * a class's), its customization page, one its storage gives (`StorageEngine.customizationPages`), or its own page.
   */
  private opensOf(type: string, capabilities: KindCapabilities): EntityKindDescription["opens"] {
    if (capabilities.progression) return "progression";
    return this.storage.customizationPages().has(type) ? "customization" : "page";
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
   * What each base rules' rulesets share, by base rules: what the client reads once, for every ruleset it shows. Its
   * kinds' declarations with what each can do (`describeKind`).
   */
  describeAll(): Record<BaseRules, RulesDescription> {
    return Object.fromEntries(
      this.modules.map(([baseRules, module]) => {
        const rules = module.ruleset.describeRules();
        return [
          baseRules,
          {
            ...rules,
            kinds: rules.kinds.map((kind) => this.describeKind(module, kind)),
            customizationPages: StorageEngine.customizationPagesOf(module.storage),
            fields: RulesEngine.fieldsOf(module),
            importers: module.imports.describeImporters().programs,
          },
        ];
      }),
    ) as Record<BaseRules, RulesDescription>;
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
