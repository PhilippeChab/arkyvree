import { db } from "@/server/database/index.ts";
import { getOrFetchTargetPathsAndLabels } from "@/server/cache/rulesetCache.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import BaseService from "@/server/services/BaseService.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type {
  PaginatedCompletions,
  PathCompletion,
  PathError,
  PathValidationResult,
  TargetPath,
} from "@/shared/customization/target.ts";
import { capitalize } from "@/shared/utils.ts";

export const TargetPathsMethods = {
  /**
   * Get all target paths with segment labels in a single fetch.
   * Entity data is fetched once and used to build both.
   */
  async getTargetPathsWithLabels(
    rulesetId: string,
    kind: "modifier" | "requirement",
    entityType?: string,
  ): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const result = await getOrFetchTargetPathsAndLabels(rulesetId, kind, async () => {
        const generator = RulesetFactory.fromBaseRules(ruleset.baseRules).createTargetPaths();
        return generator.getTargetPathsAndLabels(rulesetData, kind);
      });
      if (!entityType) return result;
      return {
        paths: result.paths.filter((p) => !p.allowedEntityTypes || p.allowedEntityTypes.includes(entityType)),
        segmentLabels: result.segmentLabels,
      };
    });
  },

  /**
   * Validate a target path like a language server
   */
  async validatePath(
    rulesetId: string,
    path: string,
    kind: "modifier" | "requirement" = "modifier",
  ): Promise<PathValidationResult> {
    const { paths: allPaths } = await this.getTargetPathsWithLabels(rulesetId, kind);
    const pathMap = new Map(allPaths.map((p) => [p.path, p]));
    const generator = await RulesetFactory.fromRulesetId(rulesetId).then((m) => m.createTargetPaths());
    const validCategories = generator.getCategories();

    const errors: PathError[] = [];
    const suggestions: string[] = [];
    const completions: PathCompletion[] = [];

    const segments = path.split(".");

    if (segments.length === 0) {
      errors.push({
        message: "Path cannot be empty",
        position: { start: 0, end: 0 },
        severity: "error",
        code: "EMPTY_PATH",
      });
      return { isValid: false, errors, suggestions, completions };
    }

    const category = segments[0];

    if (!validCategories.includes(category)) {
      errors.push({
        message: `Unknown category '${category}'. Valid categories: ${validCategories.join(", ")}`,
        position: { start: 0, end: category.length },
        severity: "error",
        code: "INVALID_CATEGORY",
      });

      const similarCategories = validCategories.filter((cat) =>
        cat.toLowerCase().includes(category.toLowerCase()) ||
        category.toLowerCase().includes(cat.toLowerCase())
      );
      suggestions.push(...similarCategories);
    }

    const exactMatch = pathMap.get(path);
    if (exactMatch) {
      return { isValid: true, errors: [], suggestions: [], completions: [] };
    }

    const partialMatches = allPaths.filter((p) => p.path.startsWith(path));
    if (partialMatches.length > 0) {
      errors.push({
        message: `Incomplete path. Did you mean: ${
          partialMatches.slice(0, 3).map((p) => p.path).join(", ")
        }?`,
        position: { start: 0, end: path.length },
        severity: "warning",
        code: "INCOMPLETE_PATH",
      });
      suggestions.push(...partialMatches.slice(0, 5).map((p) => p.path));
    } else {
      errors.push({
        message: `Invalid path '${path}'. No matching paths found.`,
        position: { start: 0, end: path.length },
        severity: "error",
        code: "INVALID_PATH",
      });
    }

    return { isValid: false, errors, suggestions, completions };
  },

  /**
   * Get completion suggestions for a partial path (paginated).
   * Uses cached paths+labels so subsequent calls are instant.
   */
  async getCompletions(
    rulesetId: string,
    partialPath: string,
    position: number,
    kind: "modifier" | "requirement",
    entityType?: string,
    search?: string,
    limit: number = 20,
    page: number = 1,
    flat: boolean = false,
  ): Promise<PaginatedCompletions> {
    const { paths: allPaths, segmentLabels } = await this.getTargetPathsWithLabels(rulesetId, kind, entityType);

    // Flat search: ignore drill prefix entirely and return any leaf path that
    // matches `search`. Used by the path browser's search-first mode so users
    // can type "wizard known" and find paths across the whole tree without
    // drilling. Falls through to the normal completions logic when not active.
    if (flat) {
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

      const total = matches.length;
      const start = (page - 1) * limit;
      const slice = matches.slice(start, start + limit);
      const items: PathCompletion[] = slice.map((p) => ({
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
      const nextPage = start + limit < total ? page + 1 : null;
      return { items, nextPage, segmentLabels };
    }

    const generator = await RulesetFactory.fromRulesetId(rulesetId).then((m) => m.createTargetPaths());
    const categoriesWithPaths = new Set(allPaths.map((p) => p.category));
    const validCategories = generator.getCategories().filter((c) => categoriesWithPaths.has(c));
    const categoryDescriptions = generator.getCategoryDescriptions();
    const pathDescriptions = generator.getPathDescriptions();
    const groupTemplates = generator.getGroupDescriptionTemplates();

    const resolveDescription = (fullPrefix: string, segment: string, fallback?: string): string => {
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

    const completions: PathCompletion[] = [];

    let pathPrefix = partialPath.substring(0, position);

    // If the prefix is a leaf path + ".", auto-resolve to parent level so the client
    // gets siblings with the leaf visible (avoids empty results and extra round-trips)
    if (pathPrefix.endsWith(".")) {
      const candidatePath = pathPrefix.slice(0, -1);
      if (allPaths.some((p) => p.path === candidatePath)) {
        const candidateSegments = candidatePath.split(".");
        if (candidateSegments.length > 1) {
          pathPrefix = candidateSegments.slice(0, -1).join(".") + ".";
        }
      }
    }

    const segments = pathPrefix.split(".");
    const lastSegment = segments[segments.length - 1];

    if (segments.length === 1) {
      for (const category of validCategories) {
        if (category.startsWith(lastSegment.toLowerCase()) || lastSegment === "") {
          completions.push({
            label: category,
            detail: categoryDescriptions[category] || `${capitalize(category)} category`,
            documentation: categoryDescriptions[category] || `Target ${category} properties`,
            insertText: category,
            kind: "category",
          });
        }
      }
    } else {
      const endsWithDot = pathPrefix.endsWith(".");

      if (endsWithDot) {
        const basePrefix = pathPrefix;
        const segmentInfo = new Map<string, { examplePath: TargetPath | null; isGroup: boolean; groupDesc: string | undefined }>();

        for (const p of allPaths) {
          if (!p.path.startsWith(basePrefix)) continue;
          const nextSegment = p.path.substring(basePrefix.length).split(".")[0];
          if (!nextSegment) continue;

          let info = segmentInfo.get(nextSegment);
          if (!info) {
            info = { examplePath: null, isGroup: false, groupDesc: undefined };
            segmentInfo.set(nextSegment, info);
          }

          const fullPrefix = basePrefix + nextSegment;
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

        for (const [segment, info] of segmentInfo) {
          const fullPrefix = basePrefix + segment;
          const description = info.groupDesc || resolveDescription(fullPrefix, segment, info.examplePath?.description);
          const isLeaf = !info.isGroup && info.examplePath?.path === fullPrefix;
          completions.push({
            label: segment,
            detail: description,
            documentation: description,
            insertText: segment,
            kind: info.isGroup ? "group" : "property",
            ...(info.examplePath?.sortOrder !== undefined && { sortOrder: info.examplePath.sortOrder }),
            ...(isLeaf && info.examplePath && {
              path: info.examplePath.path,
              valueType: info.examplePath.valueType,
              operators: info.examplePath.operators,
              possibleValues: info.examplePath.possibleValues,
            }),
          });
        }
      } else {
        const basePrefix = segments.slice(0, -1).join(".");
        const currentSegmentPrefix = lastSegment.toLowerCase();
        const baseDot = basePrefix ? basePrefix + "." : "";

        const segmentInfo = new Map<string, { examplePath: TargetPath | null; isGroup: boolean; groupDesc: string | undefined }>();

        for (const p of allPaths) {
          if (baseDot && !p.path.startsWith(baseDot)) continue;
          const pathAfterBase = baseDot ? p.path.substring(baseDot.length) : p.path;
          const nextSegment = pathAfterBase.split(".")[0];
          if (!nextSegment || !nextSegment.toLowerCase().startsWith(currentSegmentPrefix)) continue;

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

        for (const [segment, info] of segmentInfo) {
          const fullPrefix = baseDot + segment;
          const description = info.groupDesc || resolveDescription(fullPrefix, segment, info.examplePath?.description);
          const isLeaf = !info.isGroup && info.examplePath?.path === fullPrefix;
          completions.push({
            label: segment,
            detail: description,
            documentation: description,
            insertText: segment,
            kind: info.isGroup ? "group" : "property",
            ...(info.examplePath?.sortOrder !== undefined && { sortOrder: info.examplePath.sortOrder }),
            ...(isLeaf && info.examplePath && {
              path: info.examplePath.path,
              valueType: info.examplePath.valueType,
              operators: info.examplePath.operators,
              possibleValues: info.examplePath.possibleValues,
            }),
          });
        }
      }
    }

    completions.sort((a, b) => {
      if (a.kind === "group" && b.kind !== "group") return -1;
      if (a.kind !== "group" && b.kind === "group") return 1;
      const orderA = a.sortOrder ?? Infinity;
      const orderB = b.sortOrder ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });

    const filtered = search
      ? completions.filter((c) => {
          const q = search.toLowerCase();
          return c.label.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q);
        })
      : completions;

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    const nextPage = start + limit < total ? page + 1 : null;

    return { items, nextPage, segmentLabels };
  },

  /**
   * Validate a modifier/requirement path and return its value type.
   */
  async resolvePathValueType(
    rulesetId: string,
    target: string,
    kind: "modifier" | "requirement",
  ): Promise<string> {
    const { paths } = await TargetPathsMethods.getTargetPathsWithLabels(rulesetId, kind);
    const pathDef = paths.find((p) => p.path === target);
    if (!pathDef) throw new BadRequestError(`Path not found: ${target}`);
    return pathDef.valueType;
  },
} as const;

class TargetPathsService extends BaseService<typeof TargetPathsMethods> {
  static initialize() {
    return new TargetPathsService(TargetPathsMethods);
  }
}

export default TargetPathsService;
