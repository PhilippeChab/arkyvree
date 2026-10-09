/** The completions of a partial target path, as a language server offers them. */

import type { PathCompletion, TargetPath, TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";
import { capitalize } from "@/shared/text.ts";

import type { TargetPaths } from "./CategoryPaths.ts";

/** How a segment is described: by its full prefix, its own name and a fallback. */
type SegmentDescriber = (fullPrefix: string, segment: string, fallback?: string) => string;

type SegmentInfo = { examplePath: TargetPath | null; groupDesc: string | undefined; isGroup: boolean };

/** What a path's completions are asked for: the partial path up to `position`, or every leaf matching `search` (`flat`). */
export type PathQuery = { flat?: boolean; partialPath: string; position: number; search?: string };

/**
 * The completions of partial paths among a catalog's paths of a kind (`catalog`, `kind`), as the ruleset's target paths
 * (`generator`) describe them.
 */
export default class PathCompletions {
  constructor(
    private readonly generator: TargetPaths,
    private readonly catalog: TargetPathCatalog,
    private readonly kind: TargetPathKind,
  ) {}

  /**
   * How a segment is described: by its path's own description, as "All …" / "Any …" for a wildcard, by an item path's
   * structural description, by its group's template, or else by `fallback`.
   */
  private static buildSegmentDescriber(
    generator: TargetPaths,
    segmentLabels: Record<string, string>,
    kind: TargetPathKind,
  ) {
    const pathDescriptions = generator.getPathDescriptions();
    const groupTemplates = generator.getGroupDescriptionTemplates();

    const entityNaming = new Set(generator.getEntityNamingCategories());

    return (fullPrefix: string, segment: string, fallback?: string): string => {
      if (pathDescriptions[fullPrefix]) return pathDescriptions[fullPrefix];
      const prefixParts = fullPrefix.split(".");
      const namesEntity = entityNaming.has(prefixParts[0]);

      if (segment === "*") {
        if (prefixParts.length === 2) {
          const label = (segmentLabels[prefixParts[0]] || capitalize(prefixParts[0])).toLowerCase();
          return kind === "requirement" ? `Any ${label}` : `All ${label}`;
        }
        return kind === "requirement" ? "Any in this group" : "All in this group";
      }

      if (prefixParts.length >= 4 && namesEntity) {
        const structuralKey = [prefixParts[0], prefixParts[1], ...prefixParts.slice(3)].join(".");
        if (pathDescriptions[structuralKey]) return pathDescriptions[structuralKey];
      }

      if (prefixParts.length === 2) {
        const template = groupTemplates[prefixParts[0]];
        if (template) return template.replace("{name}", segmentLabels[segment] || capitalize(segment));
      }

      if (prefixParts.length === 3 && namesEntity) {
        const template = groupTemplates[`${prefixParts[0]}.${prefixParts[1]}`];
        if (template) return template.replace("{name}", segmentLabels[segment] || capitalize(segment));
      }

      return fallback || `${segmentLabels[segment] || capitalize(segment)} properties`;
    };
  }

  /** Groups first, then by sort order, then by label. */
  private static compareCompletions(a: PathCompletion, b: PathCompletion) {
    if (a.kind === "group" && b.kind !== "group") return -1;
    if (a.kind !== "group" && b.kind === "group") return 1;
    const orderA = a.sortOrder ?? Infinity;
    const orderB = b.sortOrder ?? Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  }

  /** The categories that have paths and start with what's typed of the first segment. */
  private static getCategoryCompletions(
    generator: TargetPaths,
    allPaths: readonly TargetPath[],
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
   * Every leaf path that matches `search`, by its path or a segment's label, ignoring the drill prefix: the path browser's
   * search-first mode, so users can type words of a path's labels and find it across the whole tree without drilling.
   */
  private static getFlatCompletions(
    allPaths: readonly TargetPath[],
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

    return matches
      .toSorted((a, b) => a.path.localeCompare(b.path))
      .map((p) => ({
        label: p.path.split(".").pop() ?? p.path,
        detail: p.description ?? p.path,
        documentation: p.description ?? p.path,
        insertText: p.path,
        kind: "property",
        path: p.path,
        valueType: p.valueType,
        operators: p.operators,
        possibleValues: p.possibleValues,
        ...(p.setValues && { setValues: p.setValues }),
        ...(p.literalOnly && { literalOnly: true }),
      }));
  }

  /**
   * The completions of the prefix's last segment, among the segments under the ones before it. A trailing dot leaves an
   * empty last segment: every next segment under the prefix completes it.
   */
  private static getSegmentCompletions(
    allPaths: readonly TargetPath[],
    segments: string[],
    describe: SegmentDescriber,
  ): PathCompletion[] {
    const baseDot = segments.slice(0, -1).join(".") + ".";
    const completions: PathCompletion[] = [];
    for (const [segment, info] of PathCompletions.nextSegments(
      allPaths,
      baseDot,
      segments[segments.length - 1].toLowerCase(),
    )) {
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
            ...(info.examplePath.setValues && { setValues: info.examplePath.setValues }),
            ...(info.examplePath.literalOnly && { literalOnly: true }),
          }),
      });
    }
    return completions;
  }

  /**
   * The segments that come after `baseDot` and start with `segmentPrefix`, each with its first path, whether it's a group
   * (it has a wildcard under it) and its group's description.
   */
  private static nextSegments(allPaths: readonly TargetPath[], baseDot: string, segmentPrefix: string) {
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
      if (!info.examplePath && (p.path.startsWith(fullPrefix + ".") || p.path === fullPrefix)) info.examplePath = p;

      if (!info.isGroup && p.path.startsWith(fullPrefix + ".*")) info.isGroup = true;

      if (!info.groupDesc && p.groupDescription && p.path.startsWith(fullPrefix + "."))
        info.groupDesc = p.groupDescription;
    }
    return segmentInfo;
  }

  /**
   * The prefix to complete. A leaf path + "." resolves to its parent level, so the client gets its siblings with the leaf
   * visible (avoids empty results and extra round-trips).
   */
  private static resolveCompletedPrefix(allPaths: readonly TargetPath[], partialPath: string, position: number) {
    const pathPrefix = partialPath.substring(0, position);
    if (pathPrefix.endsWith(".")) {
      const candidatePath = pathPrefix.slice(0, -1);
      if (allPaths.some((p) => p.path === candidatePath)) {
        const candidateSegments = candidatePath.split(".");
        if (candidateSegments.length > 1) return candidateSegments.slice(0, -1).join(".") + ".";
      }
    }
    return pathPrefix;
  }

  /**
   * The completions of a partial path (`partialPath` up to `position`) among a catalog's paths of `kind`: the categories,
   * or the segments under its completed prefix, groups first; or, `flat`, every leaf path that matches `search` (the path
   * browser's search-first mode). Unpaged: the caller pages them.
   */
  complete(query: PathQuery): PathCompletion[] {
    const { generator, kind } = this;
    const { paths: allPaths, segmentLabels } = this.catalog;
    const { flat, partialPath, position, search } = query;
    if (flat) return PathCompletions.getFlatCompletions(allPaths, segmentLabels, search);

    const segments = PathCompletions.resolveCompletedPrefix(allPaths, partialPath, position).split(".");
    let completions: PathCompletion[] = [];
    if (segments.length === 1) {
      completions = PathCompletions.getCategoryCompletions(generator, allPaths, segments[0]);
    } else if (segments[0] !== "") {
      // A prefix starting with a dot (".", ".a") names no path, and completes nothing.
      completions = PathCompletions.getSegmentCompletions(
        allPaths,
        segments,
        PathCompletions.buildSegmentDescriber(generator, segmentLabels, kind),
      );
    }
    completions.sort((a, b) => PathCompletions.compareCompletions(a, b));

    if (!search) return completions;
    const q = search.toLowerCase();
    return completions.filter((c) => c.label.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q));
  }
}
