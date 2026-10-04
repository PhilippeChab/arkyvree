import type { TargetPathsInterface } from "@/server/rulesets/types.ts";
import type { PathCompletion, TargetPath } from "@/shared/customization/target.ts";
import { capitalize } from "@/shared/text.ts";

type SegmentInfo = { examplePath: TargetPath | null; isGroup: boolean; groupDesc: string | undefined };

/**
 * Every leaf path that matches `search`, by its path or a segment's label, ignoring the drill prefix: the path browser's
 * search-first mode, so users can type "wizard known" and find paths across the whole tree without drilling.
 */
export function getFlatCompletions(
  allPaths: TargetPath[],
  segmentLabels: Record<string, string>,
  search: string | undefined,
): PathCompletion[] {
  const q = (search ?? "").toLowerCase().trim();
  const matches = q
    ? allPaths.filter((p) => {
        if (p.path.toLowerCase().includes(q)) return true;
        return p.path.split(".").some((seg) => {
          const label = segmentLabels[seg] ?? seg;
          return label.toLowerCase().includes(q);
        });
      })
    : allPaths;

  matches.sort((a, b) => a.path.localeCompare(b.path));

  return matches.map((p) => ({
    label: p.path.split(".").pop() ?? p.path,
    detail: p.description ?? p.path,
    documentation: p.description ?? p.path,
    insertText: p.path,
    kind: "property",
    path: p.path,
    valueType: p.valueType,
    operators: p.operators,
    possibleValues: p.possibleValues,
  }));
}

/**
 * The prefix to complete. A leaf path + "." resolves to its parent level, so the client gets its siblings with the leaf
 * visible (avoids empty results and extra round-trips).
 */
export function resolveCompletedPrefix(allPaths: TargetPath[], partialPath: string, position: number) {
  const pathPrefix = partialPath.substring(0, position);
  if (pathPrefix.endsWith(".")) {
    const candidatePath = pathPrefix.slice(0, -1);
    if (allPaths.some((p) => p.path === candidatePath)) {
      const candidateSegments = candidatePath.split(".");
      if (candidateSegments.length > 1) {
        return candidateSegments.slice(0, -1).join(".") + ".";
      }
    }
  }
  return pathPrefix;
}

/** The categories that have paths and start with what's typed of the first segment. */
export function getCategoryCompletions(
  generator: TargetPathsInterface,
  allPaths: TargetPath[],
  lastSegment: string,
): PathCompletion[] {
  const categoriesWithPaths = new Set(allPaths.map((p) => p.category));
  const validCategories = generator.getCategories().filter((c) => categoriesWithPaths.has(c));
  const categoryDescriptions = generator.getCategoryDescriptions();
  return validCategories
    .filter((category) => category.startsWith(lastSegment.toLowerCase()) || lastSegment === "")
    .map((category) => ({
      label: category,
      detail: categoryDescriptions[category] || `${capitalize(category)} category`,
      documentation: categoryDescriptions[category] || `Target ${category} properties`,
      insertText: category,
      kind: "category",
    }));
}

/**
 * How a segment is described: by its path's own description, as "All …" / "Any …" for a wildcard, by an item path's
 * structural description, by its group's template, or else by `fallback`.
 */
export function buildSegmentDescriber(
  generator: TargetPathsInterface,
  segmentLabels: Record<string, string>,
  kind: "modifier" | "requirement",
) {
  const pathDescriptions = generator.getPathDescriptions();
  const groupTemplates = generator.getGroupDescriptionTemplates();

  return (fullPrefix: string, segment: string, fallback?: string): string => {
    if (pathDescriptions[fullPrefix]) return pathDescriptions[fullPrefix];
    const prefixParts = fullPrefix.split(".");

    if (segment === "*") {
      if (prefixParts.length === 2) {
        const label = (segmentLabels[prefixParts[0]] || capitalize(prefixParts[0])).toLowerCase();
        return kind === "requirement" ? `Any ${label}` : `All ${label}`;
      }
      return kind === "requirement" ? "Any in this group" : "All in this group";
    }

    if (prefixParts.length >= 4 && prefixParts[0] === "items") {
      const structuralKey = [prefixParts[0], prefixParts[1], ...prefixParts.slice(3)].join(".");
      if (pathDescriptions[structuralKey]) return pathDescriptions[structuralKey];
    }

    if (prefixParts.length === 2) {
      const template = groupTemplates[prefixParts[0]];
      if (template) return template.replace("{name}", segmentLabels[segment] || capitalize(segment));
    }

    if (prefixParts.length === 3 && prefixParts[0] === "items") {
      const template = groupTemplates[`${prefixParts[0]}.${prefixParts[1]}`];
      if (template) return template.replace("{name}", segmentLabels[segment] || capitalize(segment));
    }

    return fallback || `${segmentLabels[segment] || capitalize(segment)} properties`;
  };
}

/**
 * The segments that come after `baseDot` and start with `segmentPrefix`, each with its first path, whether it's a group
 * (it has a wildcard under it) and its group's description.
 */
function nextSegments(allPaths: TargetPath[], baseDot: string, segmentPrefix: string) {
  const segmentInfo = new Map<string, SegmentInfo>();
  for (const p of allPaths) {
    if (!p.path.startsWith(baseDot)) continue;
    const pathAfterBase = p.path.substring(baseDot.length);
    const nextSegment = pathAfterBase.split(".")[0];
    if (!nextSegment || !nextSegment.toLowerCase().startsWith(segmentPrefix)) continue;

    let info = segmentInfo.get(nextSegment);
    if (!info) {
      info = { examplePath: null, isGroup: false, groupDesc: undefined };
      segmentInfo.set(nextSegment, info);
    }

    const fullPrefix = baseDot + nextSegment;
    if (!info.examplePath && (p.path.startsWith(fullPrefix + ".") || p.path === fullPrefix)) {
      info.examplePath = p;
    }
    if (!info.isGroup && p.path.startsWith(fullPrefix + ".*")) {
      info.isGroup = true;
    }
    if (!info.groupDesc && p.groupDescription && p.path.startsWith(fullPrefix + ".")) {
      info.groupDesc = p.groupDescription;
    }
  }
  return segmentInfo;
}

/**
 * The completions of the prefix's last segment, among the segments under the ones before it. A trailing dot leaves an
 * empty last segment: every next segment under the prefix completes it.
 */
export function getSegmentCompletions(
  allPaths: TargetPath[],
  segments: string[],
  describe: ReturnType<typeof buildSegmentDescriber>,
): PathCompletion[] {
  const baseDot = segments.slice(0, -1).join(".") + ".";
  const completions: PathCompletion[] = [];
  for (const [segment, info] of nextSegments(allPaths, baseDot, segments[segments.length - 1].toLowerCase())) {
    const fullPrefix = baseDot + segment;
    const description = info.groupDesc || describe(fullPrefix, segment, info.examplePath?.description);
    const isLeaf = !info.isGroup && info.examplePath?.path === fullPrefix;
    completions.push({
      label: segment,
      detail: description,
      documentation: description,
      insertText: segment,
      kind: info.isGroup ? "group" : "property",
      ...(info.examplePath?.sortOrder !== undefined && { sortOrder: info.examplePath.sortOrder }),
      ...(isLeaf &&
        info.examplePath && {
          path: info.examplePath.path,
          valueType: info.examplePath.valueType,
          operators: info.examplePath.operators,
          possibleValues: info.examplePath.possibleValues,
        }),
    });
  }
  return completions;
}

/** Groups first, then by sort order, then by label. */
export function compareCompletions(a: PathCompletion, b: PathCompletion) {
  if (a.kind === "group" && b.kind !== "group") return -1;
  if (a.kind !== "group" && b.kind === "group") return 1;
  const orderA = a.sortOrder ?? Infinity;
  const orderB = b.sortOrder ?? Infinity;
  if (orderA !== orderB) return orderA - orderB;
  return a.label.localeCompare(b.label);
}
