import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { type Paginated, paginateItems } from "@/server/repositories/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { PropertyTypeCompletion, PropertyValueCompletion } from "@/shared/customization/properties.ts";

class PropertyTypesService {
  /** Property type completions for autocomplete, as the engine offers them, a page at a time (in memory). */
  async getCompletions(
    rulesetId: string,
    query: string,
    pagination: { limit: number; page: number },
    entityType?: PropertyEntityType,
  ): Promise<Paginated<PropertyTypeCompletion>> {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      paginateItems(Engine.for(scope).propertyTypes().getTypeCompletions(query, entityType), pagination),
    );
  }

  /** The property types containing `query` (every one for an empty one): the rules' types, then the ruleset's own. */
  async getPropertyTypes(rulesetId: string, query: string, entityType?: PropertyEntityType) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).propertyTypes().list(query, entityType),
    );
  }

  /** A property type's value completions for autocomplete, as the engine offers them, a page at a time (in memory). */
  async getValueCompletions(
    rulesetId: string,
    type: string,
    query: string,
    pagination: { limit: number; page: number },
  ): Promise<Paginated<PropertyValueCompletion>> {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      paginateItems(Engine.for(scope).propertyTypes().getValueCompletions(type, query), pagination),
    );
  }
}

export default new PropertyTypesService();
