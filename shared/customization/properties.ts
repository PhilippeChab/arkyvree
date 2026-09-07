export interface PropertyType {
  value: string;
  isStatic: boolean;
  entityType?: string;
  description?: string;
  usageCount?: number;
}

export interface PropertyTypeCompletion {
  label: string;
  value: string;
  detail?: string;
  kind: "engine" | "custom";
  entityType?: string;
}

export interface PropertyTypeSearchResult {
  types: PropertyType[];
  hasMore: boolean;
}

export interface PropertyValueCompletion {
  label: string;
  value: string;
  kind: "engine" | "custom";
}

export type EntityType = "feats" | "klasses" | "klass_levels" | "items" | "powers" | "races" | "rulesets" | "skills";
