import { Engine } from "@/engine/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { paginateItems } from "@/server/repositories/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";
import type { Session } from "@/shared/relations.ts";

class TargetPathsService {
  /**
   * Get completion suggestions for a partial path (paginated).
   * Uses cached paths+labels so subsequent calls are instant.
   */
  async getCompletions(
    session: Session,
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
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope, kind);
      const completions = Engine.for(scope)
        .targetPaths()
        .getCompletions(catalog, kind, { flat, partialPath, position, search }, entityType);
      return { ...paginateItems(completions, { limit, page }), segmentLabels: catalog.segmentLabels };
    });
  }

  /**
   * Validate a target path like a language server, among the paths an entity type takes (`entityType`, every path
   * without one). A valid path's result carries its definition: what it takes.
   */
  async validatePath(
    session: Session,
    rulesetId: string,
    path: string,
    kind: TargetPathKind = "modifier",
    entityType?: string,
  ) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) =>
      Engine.for(scope)
        .targetPaths()
        .validate(await RulesetViews.getTargetPaths(scope, kind), path, entityType),
    );
  }
}

export default new TargetPathsService();
