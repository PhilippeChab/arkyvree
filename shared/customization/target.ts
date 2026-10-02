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
  sortOrder?: number;
  /** When set, this path is only available for modifiers on these entity types */
  allowedEntityTypes?: string[];
}

export interface PathValidationResult {
  isValid: boolean;
  errors: PathError[];
  suggestions: string[];
  completions: PathCompletion[];
}

export interface PathError {
  message: string;
  position: { start: number; end: number };
  severity: "error" | "warning" | "info";
  code: string;
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
}

export interface PaginatedCompletions {
  items: PathCompletion[];
  nextPage: number | null;
  segmentLabels: Record<string, string>;
}

/** A path segment as a label ("privateNotes" → "Private Notes"). */
export const formatSegment = (segment: string) =>
  segment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** The label of each segment of `paths`: its override, else the segment formatted. */
export function deriveSegmentLabels(
  paths: { path: string }[],
  overrides: Record<string, string> = {},
): Record<string, string> {
  const labels: Record<string, string> = { ...overrides };
  for (const { path } of paths) {
    for (const segment of path.split(".")) {
      if (!(segment in labels)) labels[segment] = formatSegment(segment);
    }
  }
  return labels;
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
    for (const path of bracketed.length > 0 ? bracketed : [inner]) {
      for (const segment of path.split(".")) {
        if (segment in segmentLabels) labels[segment] = segmentLabels[segment];
      }
    }
  }
  return labels;
}
