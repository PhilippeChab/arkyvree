import { getTargetPathCompletions } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { paginateItems } from "@/server/repositories/index.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";

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
  ) {
    const catalog = await getTargetPathsWithLabels(rulesetId, kind, entityType);
    const completions = await withRulesetScope(db, rulesetId, async (scope) =>
      getTargetPathCompletions(scope, catalog, kind, { flat, partialPath, position, search }),
    );
    return { ...paginateItems(completions, { limit, page }), segmentLabels: catalog.segmentLabels };
  }
}

export default new TargetPathsService();
