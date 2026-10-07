import { stripSeparators } from "@/shared/text.ts";

/** The distinct slugs of the properties' values of `type`. */
export function collectPropertySlugs(properties: { type: string; value: string }[], type: string) {
  return [...new Set(properties.filter((p) => p.type === type).map((p) => stripSeparators(p.value)))];
}
