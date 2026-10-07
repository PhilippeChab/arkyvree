/** The rules a class follows. */
export interface ClassesRules {
  /** The ids of the rows that hold a class's fields: what the class page edits them through. */
  getPropertyIds(properties: { id: string; type: string }[]): Record<keyof ClassFields, string | null>;
  readProperties(properties: { type: string; value: string }[]): ClassFields;
}

/** A class's fields its properties hold: the ability its bonus spells and spell DCs use, and the spells it casts. */
export type ClassFields = { bonusSpellAbilityId: string | null; casterType: "Arcane" | "Divine" | null };
