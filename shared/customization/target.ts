export interface PaginatedCompletions {
  items: PathCompletion[];
  page: number;
  nextPage: number | undefined;
  segmentLabels: Record<string, string>;
}

export interface PathCompletion {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
  kind: "category" | "property" | "value" | "operator" | "group";
  sortOrder?: number;
  /** Present on leaf completions (kind="property") — full path for this item */
  path?: string;
  /** Present on leaf completions — value type of the target */
  valueType?: PathValueType;
  /** Present on leaf completions — allowed operators */
  operators?: string[];
  /** Present on leaf completions — possible values for enum-like targets */
  possibleValues?: { value: string; label: string }[];
  /** Present on leaf completions whose `set` takes only these values */
  setValues?: { value: string; label: string }[];
  /** Present on leaf completions that take a literal value only */
  literalOnly?: boolean;
}

export interface PathError {
  message: string;
  position: { start: number; end: number };
  severity: "error" | "warning" | "info";
  code: string;
}

export interface PathValidationResult {
  isValid: boolean;
  errors: PathError[];
  suggestions: string[];
  completions: PathCompletion[];
  /** A valid path's definition */
  target?: TargetPath;
}

/** The type of value a target path holds. */
export type PathValueType = "number" | "string" | "boolean";

export interface TargetPath {
  path: string;
  category: string;
  description: string;
  groupDescription?: string;
  valueType: PathValueType;
  operators: string[];
  possibleValues?: { value: string; label: string }[];
  /** When set, a `set` on this path takes only these values: a spell level's slots set to -1 are all known */
  setValues?: { value: string; label: string }[];
  /**
   * A literal value only, never a template: code that has no character to resolve a template with reads it (the
   * level-up wizard and the class tables count a pool's slots)
   */
  literalOnly?: boolean;
  /** The least number an operator other than a restricted `set` takes: a pool's slots grow, -1 being all known */
  minValue?: number;
  sortOrder?: number;
  /** When set, this path is only available for modifiers on these entity types */
  allowedEntityTypes?: string[];
  /** It reaches several values (a skill family's skills) or a list (a spell's property values): no template reads it */
  readsMany?: boolean;
}

/** What a listing offers: a modifier's targets, a requirement's, or the paths a template reads, one value each. */
export type TargetPathKind = "modifier" | "requirement" | "template";

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
 * The labels of the segments `targets` name, picked from `segmentLabels`. A target is a path
 * (`saves.fortitude.misc`) or a template value: a bare path (`{{ abilities.charisma.modifier }}`), or an expression
 * whose paths are bracketed (`{{ floor([classes.ranger.level] / 2) }}`).
 */
export function pickTargetLabels(targets: string[], segmentLabels: Record<string, string>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const target of targets) {
    const inner = target.replace(/^\{\{?\s*|\s*\}?\}$/g, "").trim();
    const bracketed = [...inner.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim());
    for (const path of bracketed.length > 0 ? bracketed : [inner])
      for (const segment of path.split(".")) if (segment in segmentLabels) labels[segment] = segmentLabels[segment];
  }
  return labels;
}
