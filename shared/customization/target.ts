export interface TargetPath {
  path: string;
  category: string;
  description: string;
  groupDescription?: string;
  valueType: "number" | "string" | "boolean";
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
  valueType?: "number" | "string" | "boolean";
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

/**
 * Pick only the segment labels relevant to the given target paths. Accepts:
 *   - Plain paths: `saves.fortitude.misc`
 *   - Template values: `{{ abilities.charisma.modifier }}` (legacy bare path)
 *   - Bracketed template values: `{{ [abilities.charisma.modifier] }}`
 *   - Expression templates with one or more bracketed paths inside:
 *     `{{ floor([classes.ranger.level] / 2) }}` — pulls every `[...]` group out
 *     and labels segments of each.
 */
export function pickTargetLabels(targets: string[], segmentLabels: Record<string, string>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const raw of targets) {
    // Strip template braces.
    const inner = raw.replace(/^\{\{?\s*|\s*\}?\}$/g, "").trim();
    // Extract every [bracketed.path] group; if none, treat the whole inner as a bare path.
    const bracketed: string[] = [];
    inner.replace(/\[([^\]]+)\]/g, (_, group: string) => {
      bracketed.push(group.trim());
      return "";
    });
    const paths = bracketed.length > 0 ? bracketed : [inner];
    for (const path of paths) {
      for (const seg of path.split(".")) {
        if (seg in segmentLabels) labels[seg] = segmentLabels[seg];
      }
    }
  }
  return labels;
}

export interface PathHoverInfo {
  content: string;
  range: { start: number; end: number };
  examples?: string[];
}

export interface PathToken {
  text?: string;
  type: string;
  start: number;
  end: number;
}