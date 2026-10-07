import { paginateItems } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { PaginatedCompletions, PathCompletion, TargetPathKind } from "@/shared/customization/target.ts";

import {
  buildSegmentDescriber,
  compareCompletions,
  getCategoryCompletions,
  getFlatCompletions,
  getSegmentCompletions,
  resolveCompletedPrefix,
} from "./completions.ts";
import { getTargetPathsWithLabels, validatePath } from "./targetPaths.ts";

class TargetPathsService {
  readonly validatePath = validatePath;

  /**
   * Get completion suggestions for a partial path (paginated).
   * Uses cached paths+labels so subsequent calls are instant.
   */
  async getCompletions(
    rulesetId: string,
    partialPath: string,
    position: number,
    kind: TargetPathKind,
    entityType?: string,
    search?: string,
    limit: number = 20,
    page: number = 1,
    flat: boolean = false,
  ): Promise<PaginatedCompletions> {
    const { paths: allPaths, segmentLabels } = await getTargetPathsWithLabels(rulesetId, kind, entityType);
    if (flat)
      return { ...paginateItems(getFlatCompletions(allPaths, segmentLabels, search), { limit, page }), segmentLabels };

    const generator = await RulesetFactory.fromRulesetId(rulesetId).then((m) => m.createTargetPaths());
    const segments = resolveCompletedPrefix(allPaths, partialPath, position).split(".");
    let completions: PathCompletion[] = [];
    if (segments.length === 1) {
      completions = getCategoryCompletions(generator, allPaths, segments[0]);
    } else if (segments[0] !== "") {
      // A prefix starting with a dot (".", ".a") names no path, and completes nothing.
      completions = getSegmentCompletions(allPaths, segments, buildSegmentDescriber(generator, segmentLabels, kind));
    }
    completions.sort(compareCompletions);

    const filtered = search
      ? completions.filter((c) => {
          const q = search.toLowerCase();
          return c.label.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q);
        })
      : completions;

    return { ...paginateItems(filtered, { limit, page }), segmentLabels };
  }
}

export default new TargetPathsService();
