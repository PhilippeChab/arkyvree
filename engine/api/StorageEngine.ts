import type {
  FieldDef,
  LinkRoleDef,
  RulesetModule,
  StepDef,
  StorageRegistries,
  StoredCharacter,
  StoredJoin,
  StoredKind,
} from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import Modules from "./Modules.ts";

/** The entries of every module's record (`pick`), one per name: a name two modules declare is refused. */
function mergeRecords<T>(modules: [BaseRules, RulesetModule][], pick: (module: RulesetModule) => Record<string, T>) {
  const merged: Record<string, T> = {};
  for (const [baseRules, module] of modules)
    for (const [name, value] of Object.entries(pick(module))) {
      if (name in merged) throw new Error(`${baseRules} declares ${name}, which another module stores`);
      merged[name] = value;
    }
  return merged;
}

/**
 * How every registered module stores its data in the generic tables, which the server reads and writes them by: each
 * kind's row (`kind`), each join's (`join`), a character's (`character`), each field and link role (`field`, `role`),
 * and the registries' rows (`registries`). Names are global: two modules declaring one kind, join, field or role is
 * refused, as the registries' keys refuse it.
 */
export default class StorageEngine {
  /** Every module's storage, merged once: the modules never change. */
  private static instance: StorageEngine | undefined;

  private readonly characterDeclaration: StoredCharacter;
  private readonly joins: Record<string, StoredJoin>;
  private readonly kinds: Record<string, StoredKind>;
  private readonly linkedEntityProperties: Record<string, Record<string, string>>;
  private readonly linkedRulesetProperties: Record<string, string>;
  private readonly merged: StorageRegistries;

  constructor(modules: [BaseRules, RulesetModule][]) {
    this.kinds = mergeRecords(modules, (module) => module.storage.kinds);
    this.joins = mergeRecords(modules, (module) => module.storage.joins);
    this.linkedEntityProperties = mergeRecords(modules, (module) => module.storage.linkedProperties.entities);
    this.linkedRulesetProperties = mergeRecords(modules, (module) => module.storage.linkedProperties.rulesets);
    const characters = modules.map(([, module]) => module.storage.character);
    this.characterDeclaration = {
      ...characters[0],
      columns: mergeRecords(modules, (module) => module.storage.character.columns),
      links: mergeRecords(modules, (module) => module.storage.character.links),
      picks: mergeRecords(modules, (module) => module.storage.character.picks),
    };
    const registries = modules.map(([, module]) => module.storage.registries);
    this.merged = {
      entityTypes: registries.flatMap((registry) => registry.entityTypes),
      linkRoles: registries.flatMap((registry) => registry.linkRoles),
      fieldDefs: registries.flatMap((registry) => registry.fieldDefs),
      rulesetRoles: registries.flatMap((registry) => registry.rulesetRoles),
      characterRoles: registries.flatMap((registry) => registry.characterRoles),
      steps: registries.flatMap((registry) => registry.steps),
      itemTypes: registries.flatMap((registry) => registry.itemTypes),
    };
  }

  /** Every registered module's storage, merged: one instance, built on its first read. */
  static shared(): StorageEngine {
    StorageEngine.instance ??= new StorageEngine(Modules.all());
    return StorageEngine.instance;
  }

  /** A character's data, as every module stores it: its columns, its links and its advancements' picks. */
  character(): StoredCharacter {
    return this.characterDeclaration;
  }

  /** A field of an owner's type (an entity type, `rulesets` or `characters`), if a module declares it. */
  field(ownerType: string, field: string): FieldDef | undefined {
    return this.merged.fieldDefs.find((def) => def.ownerType === ownerType && def.field === field);
  }

  /** A join's rows, by its name (`feats_aptitudes`): the links of a role from one kind to another. */
  join(name: string): StoredJoin {
    const join = this.joins[name];
    if (!join) throw new Error(`No module stores the join ${name}`);
    return join;
  }

  /** An entity kind's row, by its type (`feats`): its columns past an entity's own. */
  kind(type: string): StoredKind {
    const kind = this.kinds[type];
    if (!kind) throw new Error(`No module stores the kind ${type}`);
    return kind;
  }

  /**
   * The role of the link a property type of an owner's type holds (a class's bonus spell ability, a ruleset's skill
   * point ability), if it holds one: an entity's link role, or a ruleset's ruleset role.
   */
  linkedProperty(ownerType: string, propertyType: string): string | undefined {
    if (ownerType === "rulesets") return this.linkedRulesetProperties[propertyType];
    return this.linkedEntityProperties[ownerType]?.[propertyType];
  }

  /** The property types a link holds, an owner type's: each with its role. */
  linkedProperties(ownerType: string): [propertyType: string, role: string][] {
    return Object.entries(
      ownerType === "rulesets" ? this.linkedRulesetProperties : (this.linkedEntityProperties[ownerType] ?? {}),
    );
  }

  /** What every module's registries hold. */
  registries(): StorageRegistries {
    return this.merged;
  }

  /** A link role, from a type to another. */
  role(role: string, fromType: string, toType: string): LinkRoleDef {
    const found = this.merged.linkRoles.find(
      (def) => def.role === role && def.fromType === fromType && def.toType === toType,
    );
    if (!found) throw new Error(`No module declares the role ${role} from ${fromType} to ${toType}`);
    return found;
  }

  /** An advancement's step. */
  step(step: string): StepDef {
    const found = this.merged.steps.find((def) => def.step === step);
    if (!found) throw new Error(`No module declares the step ${step}`);
    return found;
  }
}
