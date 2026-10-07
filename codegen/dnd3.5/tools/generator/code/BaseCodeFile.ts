import { isDeepStrictEqual } from "node:util";

import { eq, eqNum, eqStr, gte } from "@/content/dnd3.5/builders/customization/requirements.ts";
import type {
  Modifier,
  ModifierEffect,
  ModifierSeed,
  Property,
  RequirementCondition,
  RequirementEntry,
} from "@/content/dnd3.5/builders/customization/types.ts";

/** Modules and the names a generated file can import from them, in the order its imports list them. */
type ImportTable = [string, string[]][];

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
  BookContent: "@/content/dnd3.5/builders/rulesets/types.ts",
  ClassSeed: "@/content/dnd3.5/builders/classes/types.ts",
  CowFeatEntry: "@/content/dnd3.5/builders/rulesets/types.ts",
  CowSpellEntry: "@/content/dnd3.5/builders/rulesets/types.ts",
  DomainSeed: "@/content/dnd3.5/builders/domains/types.ts",
  FeatSeed: "@/content/dnd3.5/builders/feats/types.ts",
  ItemSeed: "@/content/dnd3.5/builders/items/types.ts",
  PowerSeed: "@/content/dnd3.5/builders/spells/types.ts",
  RaceSeed: "@/content/dnd3.5/builders/races/types.ts",
  SpellSeed: "@/content/dnd3.5/builders/spells/types.ts",
  WizardSchoolSeed: "@/content/dnd3.5/builders/wizardSchools/types.ts",
};

/**
 * Where each name a generated file's code can use comes from, in the order its imports list them: the requirement
 * builders, the weapon lists and the item builders a feat template or an item is written with, the skills and schools
 * a template is made over.
 */
const IMPORT_TABLE: ImportTable = [
  ["@/content/dnd3.5/builders/customization/requirements.ts", ["and", "eq", "eqNum", "eqStr", "feat", "gte", "or"]],
  [
    "@/content/dnd3.5/builders/items/weapons.ts",
    ["ALL_WEAPONS", "SIMPLE_WEAPONS", "MARTIAL_WEAPONS", "EXOTIC_WEAPONS", "CROSSBOW_WEAPONS"],
  ],
  [
    "@/content/dnd3.5/builders/items/proficiencies.ts",
    [
      "proficiencyRequirements",
      "simple",
      "martial",
      "exotic",
      "HEAVY_ARMOR_PROF",
      "LIGHT_ARMOR_PROF",
      "MEDIUM_ARMOR_PROF",
      "SHIELD_PROF",
      "TOWER_SHIELD_PROF",
    ],
  ],
  ["@/content/dnd3.5/builders/items/properties.ts", ["weaponProperties", "armorProperties", "shieldProperties"]],
  ["@/content/dnd3.5/data/skills.ts", ["SKILL_NAMES"]],
  ["@/shared/dnd3.5/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/shared/text.ts", ["stripSeparators"]],
];

/** `s` escaped as a string literal's text, without its quotes. */
function escapeString(s: string): string {
  // String(): a hand-typed reference can hold a number or a boolean where the seed has text
  return JSON.stringify(String(s)).slice(1, -1);
}

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
  /**
   * The names the file's code uses (a builder, a vocabulary's), which its imports are written from (`IMPORT_TABLE`).
   */
  readonly uses = new Set<string>();

  /** A check written with its builder: `builder(target, value)`. */
  private builderCall(
    { target, value }: RequirementCondition,
    { name, takes }: (typeof CHECK_BUILDERS)[number],
  ): string {
    if (takes === "nothing") return `${name}(${this.quote(target)})`;
    return `${name}(${this.quote(target)}, ${takes === "number" ? Number(value) : this.quote(value)})`;
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

  /** Two names in lint's order, which ignores case (`sort-imports`, `member-order`). */
  protected compareNames(a: string, b: string): number {
    const [x, y] = [a.toLowerCase(), b.toLowerCase()];
    return x < y ? -1 : x > y ? 1 : 0;
  }

  /** `s` escaped for a template literal: as for a string literal, and its backticks and `${` too. */
  protected escapeTemplate(s: string): string {
    return escapeString(s).replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  }

  /** An import of `names` from `from`, the names in lint's order. */
  private formatImport(names: string[], from: string): string {
    return `import { ${[...names].sort((a, b) => this.compareNames(a, b)).join(", ")} } from "${from}";`;
  }

  /** The imports of the names the file's code uses (`uses`), from `IMPORT_TABLE`: a name it doesn't list throws. */
  private formatImports(): string[] {
    const unknown = [...this.uses].filter((name) => !IMPORT_TABLE.some(([, names]) => names.includes(name)));
    if (unknown.length > 0) throw new Error(`The generated code uses ${unknown.join(", ")}, which no import provides`);
    return IMPORT_TABLE.flatMap(([from, names]) => {
      const used = names.filter((name) => this.uses.has(name));
      return used.length > 0 ? [this.formatImport(used, from)] : [];
    });
  }

  /** `items` as an array of string literals: on one line when it's short, else an item per line, at `indentLevel`. */
  protected formatStringArray(items: string[], indentLevel = 1): string {
    const inner = items.map((item) => this.quote(item)).join(", ");
    if (inner.length < 100) return `[${inner}]`;
    const lines = items.map((s) => this.indent(`${this.quote(s)},`, indentLevel + 1));
    return `[\n${lines.join("\n")}\n${this.indent("]", indentLevel)}`;
  }

  /** `text` indented by `level` steps, each of its lines but the empty ones. */
  protected indent(text: string, level: number): string {
    const prefix = "  ".repeat(level);
    return text
      .split("\n")
      .map((line) => (line ? prefix + line : line))
      .join("\n");
  }

  /** A `key: [...]` field of `items`, one per line, after `prefix` (its indentation); none when there are no items. */
  protected listField(key: string, items: string[], prefix: string): string[] {
    return items.length === 0
      ? []
      : [`${prefix}${key}: [`, ...items.map((item) => `${prefix}  ${item},`), `${prefix}],`];
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
      ...this.formatImports(),
      ...[...this.gathered].map(([module, names]) => this.formatImport(names, module)),
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
  modifier(mod: ModifierSeed, indentLevel = 3, target = this.quote(mod.target)): string {
    return `{ ${this.modifierFields(mod, indentLevel, target).join(", ")} }`;
  }

  /** A modifier's fields written as code: its target (as code, `target`), operator, value, type and requirements. */
  modifierFields(
    mod: ModifierEffect & Pick<ModifierSeed, "requirements">,
    indentLevel = 3,
    target = this.quote(mod.target),
  ) {
    const requirements = (mod.requirements ?? []).map((r) => this.requirement(r, indentLevel));
    return [
      `target: ${target}`,
      `operator: ${this.quote(mod.operator)}`,
      `value: ${this.quote(mod.value)}`,
      `valueType: ${this.quote(mod.valueType)}`,
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
    return `{ type: ${this.quote(type)}, value: ${this.quote(value)} }`;
  }

  /** `s` as a string literal. */
  quote(s: string): string {
    return `"${escapeString(s)}"`;
  }

  /** `req` written as code, at `indentLevel`: the builders it's written with are names the file uses. */
  requirement(req: RequirementEntry, indentLevel = 2): string {
    if ("chainingOperator" in req) {
      const fn = req.chainingOperator;
      this.uses.add(fn);
      const children = req.children.map((c) => this.requirement(c, indentLevel + 1));
      if (children.length <= 3 && children.every((c) => c.length < 60)) return `${fn}(${children.join(", ")})`;

      return `${fn}(\n${children.map((c) => this.indent(c + ",", indentLevel + 1)).join("\n")}\n${this.indent(")", indentLevel)}`;
    }

    const builder = this.builderOf(req);
    if (builder) {
      this.uses.add(builder.name);
      return this.builderCall(req, builder);
    }
    const { target, operator, value, valueType } = req;
    return `{ target: ${this.quote(target)}, operator: ${this.quote(operator)}, value: ${this.quote(value)}, valueType: ${this.quote(valueType)} }`;
  }
}
