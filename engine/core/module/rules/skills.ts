/** A skill's fields its properties hold: whether armor weighs on it, how many times over, and untrained use. */
export type SkillFields = { checkPenaltyMultiplier: number; impactedByWeight: boolean; usableWithoutTraining: boolean };

/** The rules a skill follows. */
export interface SkillsRules {
  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFields)[];
  /** The fields as a skill keeps them, which `SkillsEffects.properties` gives to store. */
  normalizeFields(fields: SkillFields): SkillFields;
  readProperties(properties: { type: string; value: string }[]): SkillFields;
}
