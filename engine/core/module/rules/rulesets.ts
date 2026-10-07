/** A ruleset's own fields its properties hold: the ability its characters' skill points come from. */
export type RulesetFields = { skillPointAbilityId: string | null };

/** The rules a ruleset follows about itself. */
export interface RulesetsRules {
  readProperties(properties: { type: string; value: string }[]): RulesetFields;
}
