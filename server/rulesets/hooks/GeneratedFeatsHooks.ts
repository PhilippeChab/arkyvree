import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { GeneratedFeatSource } from "@/shared/rulesets/generatedFeats.ts";

export interface GeneratedFeatDefinition {
  family: string;
  name: string;
  description: string;
  aptitudes: string[];
  modifiers: { target: string; operator: string; value: string; valueType: string }[];
  requirements?: { level: string; target: string; operator: string; value: string; valueType: string }[];
  properties?: { type: string; value: string }[];
}

export interface GeneratedFeatsHooks {
  readonly entityTypes: readonly string[];
  readonly propertyTypes: readonly string[];
  source(entityType: string, entity: { id: string; name: string }, properties: { type: string; value: string | null }[]): GeneratedFeatSource | null;
  definitions(source: GeneratedFeatSource): GeneratedFeatDefinition[];
  hasOtherSources(data: CachedRulesetData, source: GeneratedFeatSource, excludedEntityId: string): boolean;
}
