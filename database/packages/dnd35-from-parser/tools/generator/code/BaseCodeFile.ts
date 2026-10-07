import { isDeepStrictEqual } from "node:util";

import { eq, eqNum, eqStr, gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type {
  Modifier,
  ModifierEffect,
  ModifierSeed,
  Property,
  RequirementCondition,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";

import { formatImport, formatImports, IMPORT_TABLE } from "./imports.ts";
import { indent, quote } from "./literals.ts";

/** A content type a generated file declares its values with. */
export type DeclaredType = keyof typeof DECLARED_TYPES;

/** The builders of content/customization/requirements.ts the generated code writes checks with. */
const BUILDERS = { eq, eqNum, gte, eqStr };

/** Each builder, with how it takes a check's value: not at all (`eq` checks a flag is set), as a number or a string. */
const CHECK_BUILDERS: { name: keyof typeof BUILDERS; takes: "nothing" | "number" | "string" }[] = [
  { name: "eq", takes: "nothing" },
  { name: "eqNum", takes: "number" },
  { name: "gte", takes: "number" },
  { name: "eqStr", takes: "string" },
];

/** Where each content type a generated file declares its values with comes from. */
const DECLARED_TYPES = {
  BookContent: "@/database/packages/dnd35/content/rulesets/types.ts",
  ClassSeed: "@/database/packages/dnd35/content/classes/types.ts",
  CowFeatEntry: "@/database/packages/dnd35/content/rulesets/types.ts",
  CowSpellEntry: "@/database/packages/dnd35/content/rulesets/types.ts",
  DomainSeed: "@/database/packages/dnd35/content/domains/types.ts",
  FeatSeed: "@/database/packages/dnd35/content/feats/types.ts",
  ItemSeed: "@/database/packages/dnd35/content/items/types.ts",
  PowerSeed: "@/database/packages/dnd35/content/spells/types.ts",
  RaceSeed: "@/database/packages/dnd35/content/races/types.ts",
  SpellSeed: "@/database/packages/dnd35/content/spells/types.ts",
  WizardSchoolSeed: "@/database/packages/dnd35/content/wizardSchools/types.ts",
};

/**
 * A generated file's code's core, which its concerns (`concerns/`, a kind of seed each) build on: its lines, the
 * content types they declare values with, the names they use (a requirement's builders…) and the lists they gather (an
 * index's), which its imports are written from; and the customization values every seed writes alike (a check, a
 * modifier, a property).
 */
export class BaseCodeFile {
  /** The content types the file declares its values with. */
  private readonly declared = new Set<DeclaredType>();
  /** The names the file imports from the generated files beside it, by module. */
  private readonly gathered = new Map<string, string[]>();
  /** The file's code, a line at a time, which its imports are written above (`code`). */
  readonly lines: string[] = [];
  /** The names the file's code uses (a builder, a vocabulary's), which its imports are written from (`IMPORT_TABLE`). */
  readonly uses = new Set<string>();

  /** A check written with its builder: `builder(target, value)`. */
  private builderCall(
    { target, value }: RequirementCondition,
    { name, takes }: (typeof CHECK_BUILDERS)[number],
  ): string {
    if (takes === "nothing") return `${name}(${quote(target)})`;
    return `${name}(${quote(target)}, ${takes === "number" ? Number(value) : quote(value)})`;
  }

  /**
   * The builder the generated code writes `check` with: one that builds that very check from its target and value. A
   * check none builds (another operator, a value that isn't a number's own writing) is written as an object.
   */
  private builderOf(check: RequirementCondition) {
    // A hand-typed reference can hold a number where a check's value is its text
    const written = { ...check, value: String(check.value) };
    return CHECK_BUILDERS.find(({ name, takes }) => {
      const build: (target: string, value: string | number) => RequirementCondition = BUILDERS[name];
      return isDeepStrictEqual(
        build(written.target, takes === "number" ? Number(written.value) : written.value),
        written,
      );
    });
  }

  /** The file's code: the imports of what its lines declare, use and gather, then its lines. */
  code(): string {
    return [...this.imports(), "", ...this.lines].join("\n");
  }

  /** The file declares a value with the content type `type`, which it imports. */
  declare(type: DeclaredType): void {
    this.declared.add(type);
  }

  /** The file gathers `names` from `module`, a generated file beside it (an index's lists). */
  gather(module: string, names: string[]): void {
    this.gathered.set(module, [...(this.gathered.get(module) ?? []), ...names]);
  }

  /**
   * The file's imports: the content types it declares values with, the names its code uses (from its table, a name
   * the table doesn't list throws), and the lists it gathers.
   */
  imports(): string[] {
    const byModule = Map.groupBy([...this.declared], (type) => DECLARED_TYPES[type]);
    return [
      ...[...byModule].map(([module, types]) => `import type { ${types.sort().join(", ")} } from "${module}";`),
      ...formatImports(this.uses, IMPORT_TABLE),
      ...[...this.gathered].map(([module, names]) => formatImport(names, module)),
    ];
  }

  /** An exported list of `type` (a content type, or text), `items` its lines. */
  list(constName: string, type: DeclaredType | "string", items: string[]): void {
    if (type !== "string") this.declare(type);
    this.lines.push(`export const ${constName}: ${type}[] = [`, ...items, `];`, ``);
  }

  /**
   * A modifier written as code, at `indentLevel`, with its requirements (a feat's, a class level's). `target` is its
   * target as code (a template's names each item).
   */
  modifier(mod: ModifierSeed, indentLevel = 3, target = quote(mod.target)): string {
    return `{ ${this.modifierFields(mod, indentLevel, target).join(", ")} }`;
  }

  /** A modifier's fields written as code: its target (as code, `target`), operator, value, type and requirements. */
  modifierFields(
    mod: ModifierEffect & Pick<ModifierSeed, "requirements">,
    indentLevel = 3,
    target = quote(mod.target),
  ) {
    const requirements = (mod.requirements ?? []).map((r) => this.requirement(r, indentLevel));
    return [
      `target: ${target}`,
      `operator: ${quote(mod.operator)}`,
      `value: ${quote(mod.value)}`,
      `valueType: ${quote(mod.valueType)}`,
      ...(requirements.length > 0 ? [`requirements: [${requirements.join(", ")}]`] : []),
    ];
  }

  /**
   * A modifier without requirements written as code: a domain's, a race's or an item's. Only a feat's and a class
   * level's have requirements: one on another refuses the seed.
   */
  plainModifier(mod: Modifier): string {
    if ("requirements" in mod) throw new Error(`${mod.target}: only a feat's modifier has requirements`);
    return this.modifier(mod);
  }

  /** A property written as code. */
  property({ type, value }: Property): string {
    return `{ type: ${quote(type)}, value: ${quote(value)} }`;
  }

  /** `req` written as code, at `indentLevel`: the builders it's written with are names the file uses. */
  requirement(req: RequirementEntry, indentLevel = 2): string {
    if ("chainingOperator" in req) {
      const fn = req.chainingOperator;
      this.uses.add(fn);
      const children = req.children.map((c) => this.requirement(c, indentLevel + 1));
      if (children.length <= 3 && children.every((c) => c.length < 60)) return `${fn}(${children.join(", ")})`;

      return `${fn}(\n${children.map((c) => indent(c + ",", indentLevel + 1)).join("\n")}\n${indent(")", indentLevel)}`;
    }

    const builder = this.builderOf(req);
    if (builder) {
      this.uses.add(builder.name);
      return this.builderCall(req, builder);
    }
    const { target, operator, value, valueType } = req;
    return `{ target: ${quote(target)}, operator: ${quote(operator)}, value: ${quote(value)}, valueType: ${quote(valueType)} }`;
  }
}
