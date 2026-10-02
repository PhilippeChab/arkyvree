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

export interface PropertyValueCompletion {
  label: string;
  value: string;
  kind: "engine" | "custom";
}

/** An UPPER_SNAKE_CASE property type as a label ("SPELL_SCHOOL" → "Spell School"). */
export const formatPropertyType = (type: string) =>
  type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
