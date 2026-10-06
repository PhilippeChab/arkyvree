import { isDeepStrictEqual } from "node:util";

import {
  modifierFields,
  stringifyProperty,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/customization.ts";
import {
  importLines,
  type ImportTable,
  REQUIREMENT_IMPORTS,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/imports.ts";
import { indent, listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { eq, eqNum, eqStr, gte } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type {
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
} from "@/database/packages/dnd35/content/customization/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";

/** The builders of content/customization/requirements.ts the generated code writes checks with. */
const BUILDERS = { eq, eqNum, gte, eqStr };

/** Each builder, with how it takes a check's value: not at all (`eq` checks a flag is set), as a number or a string. */
const CHECK_BUILDERS: { name: keyof typeof BUILDERS; takes: "nothing" | "number" | "string" }[] = [
  { name: "eq", takes: "nothing" },
  { name: "eqNum", takes: "number" },
  { name: "gte", takes: "number" },
  { name: "eqStr", takes: "string" },
];

/**
 * A generated file's code, as it's written: its lines, and the names they use (a requirement's builders…), which its
 * imports are written from, by `importTable`.
 */
export class CodeFile {
  constructor(private readonly importTable: ImportTable = REQUIREMENT_IMPORTS) {}

  readonly lines: string[] = [];

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

  /** The file's code: `head` (what opens it: its seed type's import…), the imports of what its lines use, its lines. */
  code(head: string[]): string {
    return [...head, ...this.imports(), "", ...this.lines].join("\n");
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
        (feat.modifiers ?? []).map((m) => this.featModifier(m)),
        "    ",
      ),
      ...listField("properties", (feat.properties ?? []).map(stringifyProperty), "    "),
      `  },`,
    ];
  }

  /**
   * A feat's modifier written as code, at `indentLevel`, with its requirements. `target` is its target as code (a
   * template's names each item).
   */
  featModifier(mod: ModifierSeed, indentLevel = 3, target = quote(mod.target)): string {
    const requirements = (mod.requirements ?? []).map((r) => this.requirement(r, indentLevel));
    return `{ ${[...modifierFields(mod, target), ...(requirements.length > 0 ? [`requirements: [${requirements.join(", ")}]`] : [])].join(", ")} }`;
  }

  /** The imports of the names the file's code uses. A name its table doesn't list throws. */
  imports(): string[] {
    return importLines(this.uses, this.importTable);
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
}
