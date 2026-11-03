/**
 * A ruleset's word in its singular and its plural ("Spell", "Spells"): what a type, a position, a tier or a unit reads
 * in ("lb", "lbs").
 */
export interface RulesWord {
  many: string;
  one: string;
}

/** The longest name a ruleset takes. */
export const MAX_RULESET_NAME_LENGTH = 255;
