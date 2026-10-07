/** A 3.5 ability score's modifier: +1 for every 2 points above 10. */
export function computeAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
