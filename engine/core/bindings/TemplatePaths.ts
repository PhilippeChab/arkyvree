import {
  extractReferencedPaths,
  extractTemplateExpression,
  findTemplatePaths,
  isTemplateValue,
} from "@/shared/customization/templateExpression.ts";

/** The paths a row's field reads, in their order, and a field rewritten with one of them replaced. */
export default class TemplatePaths {
  /** The paths of a field: a target is its one path, a formula each path it reads, anything else none. */
  static list(field: "target" | "value", text: string | null | undefined): string[] {
    if (!text) return [];
    if (field === "target") return [text];
    return isTemplateValue(text) ? extractReferencedPaths(text) : [];
  }

  /** A field's text with its path of that index (`list`'s) replaced by `path`, spelled as it was: bracketed or bare. */
  static replace(field: "target" | "value", text: string, index: number, path: string): string {
    if (field === "target") return path;
    const inner = extractTemplateExpression(text);
    if (inner === null) return text;
    const span = findTemplatePaths(inner)[index];
    if (!span) return text;
    const written = span.bracketed ? `[${path}]` : path;
    return `{{ ${inner.slice(0, span.start)}${written}${inner.slice(span.end)} }}`;
  }
}
