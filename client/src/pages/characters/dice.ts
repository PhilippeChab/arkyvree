/** The dice the character pages roll: a new character's ability scores, a level's hit points. */

/** A roll of `count` dice of `sides`, the highest `keep` summed: 4d6 dropping the lowest keeps 3. */
export function rollDice({ count, keep, sides }: { count: number; keep: number; sides: number }): number {
  const rolls = Array.from({ length: count }, () => rollDie(sides)).sort((a, b) => b - a);
  return rolls.slice(0, keep).reduce((sum, roll) => sum + roll, 0);
}

/** A die's roll: 1 to its `sides`. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}
