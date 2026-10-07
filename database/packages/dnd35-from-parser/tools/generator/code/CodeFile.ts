import { isDeepStrictEqual } from "node:util";

import {
  formatImport,
  formatImports,
  type ImportTable,
  REQUIREMENT_IMPORTS,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import { indent, listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { eq, eqNum, eqStr, gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type {
  Modifier,
  ModifierEffect,
  ModifierSeed,
  Property,
  RequirementCondition,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";
import type { CowFeatEntry, CowSpellEntry } from "@/database/packages/dnd35/content/rulesets/types.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";

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
 * A generated file's code, as it's written: its lines, the content types they declare values with, and the names they
 * use (a requirement's builders…) and the lists they gather (an index's), which its imports are written from. Each
 * kind of seed is written by a method of its own (`feat`, `race`, `spell`…), a modifier, a check and a property alike.
 */
export class CodeFile {
  constructor(private readonly importTable: ImportTable = REQUIREMENT_IMPORTS) {}

  readonly lines: string[] = [];

  readonly uses = new Set<string>();

  /** The content types the file declares its values with. */
  private readonly declared = new Set<DeclaredType>();

  /** The names the file imports from the generated files beside it, by module. */
  private readonly gathered = new Map<string, string[]>();

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

  /** A feat a book copies from the core rules written as code, a list's item. */
  cowFeat({ feat, aptitudes }: CowFeatEntry): string {
    return `  { feat: ${quote(feat)}, requirements: [], aptitudes: [${aptitudes.map(quote).join(", ")}] },`;
  }

  /** A spell a book copies from the core rules written as code, a list's item. */
  cowSpell({ spell, aptitudes }: CowSpellEntry): string {
    const lists = aptitudes.map(({ aptitude, level }) => `{ aptitude: ${quote(aptitude)}, level: ${level} }`);
    return `  { spell: ${quote(spell)}, aptitudes: [${lists.join(", ")}] },`;
  }

  /** The file declares a value with the content type `type`, which it imports. */
  declare(type: DeclaredType): void {
    this.declared.add(type);
  }

  /** A domain written as code, a list's item. */
  domain(domain: DomainSeed): string[] {
    return [
      `  {`,
      `    name: ${quote(domain.name)},`,
      `    description: ${quote(domain.description)},`,
      ...listField(
        "modifiers",
        (domain.modifiers ?? []).map((m) => this.plainModifier(m)),
        "    ",
      ),
      `    spells: [`,
      ...domain.spells.map((spell) => `      { name: ${quote(spell.name)}, level: ${spell.level} },`),
      `    ],`,
      `  },`,
    ];
  }

  /** A feat written as code, a list's item. */
  feat(feat: FeatSeed): string[] {
    return [
      `  {`,
      `    name: ${quote(feat.name)},`,
      `    description: ${quote(feat.description)},`,
      ...(feat.stackable ? [`    stackable: true,`] : []),
      ...(feat.selectable === false ? [`    selectable: false,`] : []),
      ...(feat.generated ? [`    generated: true,`] : []),
      `    aptitudes: [${feat.aptitudes.map(quote).join(", ")}],`,
      ...listField(
        "requirements",
        (feat.requirements ?? []).map((req) => this.requirement(req, 3)),
        "    ",
      ),
      ...listField(
        "modifiers",
        (feat.modifiers ?? []).map((m) => this.modifier(m)),
        "    ",
      ),
      ...listField(
        "properties",
        (feat.properties ?? []).map((p) => this.property(p)),
        "    ",
      ),
      `  },`,
    ];
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
      ...formatImports(this.uses, this.importTable),
      ...[...this.gathered].map(([module, names]) => formatImport(names, module)),
    ];
  }

  /** An item written as code, a list's item: its name and description, then its `fields`. */
  item({ name, description }: { name: string; description: string }, fields: string[]): string[] {
    return [
      `  {`,
      `    name: ${quote(name)},`,
      `    description: ${quote(description)},`,
      ...fields.map((line) => `    ${line}`),
      `  },`,
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
   * A modifier without requirements written as code: a domain's, a race's or an item's. Only a feat's and a class level's
   * have requirements: one on another refuses the seed.
   */
  plainModifier(mod: Modifier): string {
    if ("requirements" in mod) throw new Error(`${mod.target}: only a feat's modifier has requirements`);
    return this.modifier(mod);
  }

  /** A property written as code. */
  property({ type, value }: Property): string {
    return `{ type: ${quote(type)}, value: ${quote(value)} }`;
  }

  /** A race written as code, a list's item. */
  race(race: RaceSeed): string[] {
    return [
      `  {`,
      `    name: ${quote(race.name)},`,
      `    description: ${quote(race.description)},`,
      `    size: ${quote(race.size)},`,
      `    baseSpeed: ${race.baseSpeed},`,
      ...listField(
        "modifiers",
        (race.modifiers ?? []).map((m) => this.plainModifier(m)),
        "    ",
      ),
      ...listField(
        "properties",
        (race.properties ?? []).map((p) => this.property(p)),
        "    ",
      ),
      `  },`,
    ];
  }

  /** `req` written as code, at `indentLevel`: the builders it's written with are names the file uses. */
  requirement(req: RequirementEntry, indentLevel = 2): string {
    if ("chainingOperator" in req) {
      const fn = req.chainingOperator;
      this.uses.add(fn);
      const children = req.children.map((c) => this.requirement(c, indentLevel + 1));
      if (children.length <= 3 && children.every((c) => c.length < 60)) {
        return `${fn}(${children.join(", ")})`;
      }
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

  /** A spell written as code, a list's item, without its level: its file is its level's. */
  spell(spell: SpellSeed): string[] {
    const levels = Object.entries(spell.aptitudeLevels ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([aptitude, level]) => `${quote(aptitude)}: ${level}`);
    return [
      `  {`,
      `    name: ${quote(spell.name)},`,
      `    description: ${quote(spell.description)},`,
      `    aptitudes: [${spell.aptitudes.map(quote).join(", ")}],`,
      ...(levels.length > 0 ? [`    aptitudeLevels: { ${levels.join(", ")} },`] : []),
      ...(spell.savingThrow ? [`    savingThrow: ${quote(spell.savingThrow)},`] : []),
      `    properties: [`,
      ...spell.properties.map((p) => `      ${this.property(p)},`),
      `    ],`,
      `  },`,
    ];
  }

  /** A wizard school written as code, a list's item. */
  wizardSchool(school: WizardSchoolSeed): string[] {
    return [
      `  {`,
      `    name: ${quote(school.name)},`,
      `    description: ${quote(school.description)},`,
      `    prohibitedSchoolCount: ${school.prohibitedSchoolCount},`,
      `  },`,
    ];
  }
}
