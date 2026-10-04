/** A 3.5 ability score's modifier: +1 for every 2 points above 10. */
export const computeAbilityModifier = (score: number): number => Math.floor((score - 10) / 2);
