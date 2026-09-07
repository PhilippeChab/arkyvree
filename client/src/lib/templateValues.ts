/**
 * Frontend helpers for the template-expression syntax used in modifier and
 * requirement values. Mirrors `server/rulesets/universal/templateExpression.ts`
 * just enough to recognize single-path references in the UI's "Reference"
 * mode — complex expressions (arithmetic, function calls) fall back to
 * literal-value editing.
 */

export function isTemplateValue(value: string): boolean {
  // Require non-whitespace inner content so `{{ }}` and `{{   }}` are
  // treated as literals (matches the server's check).
  return /^\{\{\s*\S[\s\S]*?\s*\}\}$/.test(value ?? "");
}

/**
 * Extract the inner expression of a template value, then strip a single
 * outer pair of brackets `[ ... ]` if present. Returns null for
 * non-template values.
 */
export function extractTemplateExpression(value: string): string | null {
  const match = value?.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Return the resolved path of a *simple* template value — i.e. a single
 * path lookup like `{{ abilities.charisma.modifier }}` or `{{ [abilities.
 * charisma.modifier] }}`. Returns null for anything compound (contains
 * `+`, `-`, `*`, `/`, function calls, etc.) so callers can route those
 * to a free-form expression editor instead of the path picker.
 */
export function extractTemplatePath(value: string): string | null {
  const inner = extractTemplateExpression(value);
  if (!inner) return null;
  // Strip a single outer pair of brackets.
  const unbracketed = inner.match(/^\[([\s\S]+)\]$/);
  const candidate = (unbracketed ? unbracketed[1] : inner).trim();
  // Only treat as a bare path if it's pure identifier-with-dots — no
  // operators, function calls, brackets, etc.
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(candidate)) return null;
  return candidate;
}

/** True if the template is a single-path reference (bracketed or bare). */
export function isSinglePathTemplate(value: string): boolean {
  return extractTemplatePath(value) !== null;
}

/** Build the canonical template-value string for a path. */
export function formatTemplatePath(path: string): string {
  return `{{ [${path}] }}`;
}
