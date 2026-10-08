/** Add Level's class plan: the classes it adds a level in, in order, a slot not filled yet `null`. */

/**
 * The level a class takes at a place in the plan (its end when `before` is left out): the next one the character has,
 * after the levels of it planned before, as the wizard numbers them and the class plan's buttons and options say.
 */
export function plannedLevel(
  klass: { id: string; nextLevel: number },
  plan: ({ id: string } | null)[],
  before = plan.length,
) {
  return klass.nextLevel + plan.slice(0, before).filter((planned) => planned?.id === klass.id).length;
}
