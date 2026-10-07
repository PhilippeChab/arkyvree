/** The rules a character's levels follow. */
export interface LevelsRules {
  isAbilityIncreaseLevel(totalLevel: number): boolean;
}
