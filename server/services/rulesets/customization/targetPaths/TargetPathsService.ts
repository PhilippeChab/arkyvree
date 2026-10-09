import { Engine } from "@/engine/index.ts";
import { readTargetPaths, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { paginateItems } from "@/server/repositories/index.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";

class TargetPathsService {
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
    const catalog = await readTargetPaths(rulesetId, kind);
    const completions = await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope)
        .targetPaths()
        .getCompletions(catalog, kind, { flat, partialPath, position, search }, entityType),
    );
    return { ...paginateItems(completions, { limit, page }), segmentLabels: catalog.segmentLabels };
  }

  /**
   * Validate a target path like a language server, among the paths an entity type takes (`entityType`, every path
   * without one). A valid path's result carries its definition: what it takes.
   */
  async validatePath(rulesetId: string, path: string, kind: TargetPathKind = "modifier", entityType?: string) {
    const catalog = await readTargetPaths(rulesetId, kind);
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).targetPaths().validate(catalog, path, entityType),
    );
  }
}

export default new TargetPathsService();
