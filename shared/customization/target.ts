import { stripSeparators } from "@/shared/text.ts";

export interface PathCompletion {
  detail: string;
  documentation: string;
  insertText: string;
  kind: "category" | "property" | "value" | "operator" | "group";
  label: string;
  /** Present on leaf completions that take a literal value only */
  literalOnly?: boolean;
  /** Present on leaf completions — allowed operators */
  operators?: string[];
  /** Present on leaf completions (kind="property") — full path for this item */
  path?: string;
  /** Present on leaf completions — possible values for enum-like targets */
  possibleValues?: { label: string; value: string }[];
  /** Present on leaf completions whose `set` takes only these values */
  setValues?: { label: string; value: string }[];
  sortOrder?: number;
  /** Present on leaf completions — value type of the target */
  valueType?: PathValueType;
}

export interface PathError {
  code: string;
  message: string;
  position: { end: number; start: number };
  severity: "error" | "warning" | "info";
}

export interface PathValidationResult {
  completions: PathCompletion[];
  errors: PathError[];
  isValid: boolean;
  suggestions: string[];
  /** A valid path's definition */
  target?: TargetPath;
}

export interface TargetPath {
  /** When set, this path is only available for modifiers on these entity types */
  allowedEntityTypes?: string[];
  category: string;
  description: string;
  groupDescription?: string;
  /**
   * A literal value only, never a template: code that has no character to resolve a template with reads it (the
   * level-up wizard and the class tables count a pool's slots)
   */
  literalOnly?: boolean;
  /** The least number an operator other than a restricted `set` takes: a pool's slots grow, -1 being all known */
  minValue?: number;
  operators: string[];
  path: string;
  possibleValues?: { label: string; value: string }[];
  /** It reaches several values (a skill family's skills) or a list (a spell's property values): no template reads it */
  readsMany?: boolean;
  /** When set, a `set` on this path takes only these values: a spell level's slots set to -1 are all known */
  setValues?: { label: string; value: string }[];
  sortOrder?: number;
  valueType: PathValueType;
}

/** A ruleset's target paths of a kind, with the label of each of their segments. */
export interface TargetPathCatalog {
  readonly paths: readonly TargetPath[];
  segmentLabels: Record<string, string>;
}

/** The type of value a target path holds. */
export type PathValueType = "number" | "string" | "boolean";

/** What a listing offers: a modifier's targets, a requirement's, or the paths a template reads, one value each. */
export type TargetPathKind = "modifier" | "requirement" | "template";

/** The label of each name's segment (`stripSeparators`): the name, the last of a segment's winning. */
export function deriveNameLabels(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [stripSeparators(name), name]));
}

/** The label of each segment of `paths`: its override, else the segment formatted. */
export function deriveSegmentLabels(
  paths: { path: string }[],
  overrides: Record<string, string> = {},
): Record<string, string> {
  const labels: Record<string, string> = { ...overrides };
  for (const { path } of paths)
    for (const segment of path.split(".")) if (!(segment in labels)) labels[segment] = formatSegment(segment);

  return labels;
}

/** A path segment as a label ("privateNotes" → "Private Notes"). */
export function formatSegment(segment: string) {
  return segment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Whether a category's leaf (one of its paths' tables) is one of `kind`'s paths: one its sheet computes is a
 * requirement's only (`requirementOnly`), and one only a modifier changes a modifier's (`modifierOnly`).
 */
export function isLeafOfKind(
  leaf: { modifierOnly?: boolean; requirementOnly?: boolean },
  kind: Exclude<TargetPathKind, "template">,
): boolean {
  return kind === "modifier" ? !leaf.requirementOnly : !leaf.modifierOnly;
}
