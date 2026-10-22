/**
 * A `plan` step's slots, Add Level's: the tracks its advancements take, in order (3.5's classes), a slot not filled yet
 * `null`. Each slot has a key of its own, which what an advancement holds (its value, its choice) is kept by: filling
 * an earlier slot or removing one moves nothing to another advancement.
 */

/** A track an option offers, as its `plan` step's picker answers it: its next position, its last, the advancements left. */
interface Track {
  eligible: boolean;
  id: string;
  track?: { last: number; left: number; next: number };
}

/**
 * Whether a track can take the plan's next advancement, as its quick-add button says: it may (`eligible`), the plan has
 * room for another (`left`, `hasRoom`), and the track has a position left after those of it planned.
 */
export function canPlan(option: Track, plan: ({ id: string } | null)[], left: number | undefined) {
  return option.eligible && hasRoom(plan, left) && plannedPosition(option, plan) <= (option.track?.last ?? 0);
}

/**
 * Whether the plan has room for another advancement: fewer slots than the character has left (`left`, as its options
 * say), a slot not filled yet counted too. Room until the options load: the plan's answer refuses a plan past the
 * character's last.
 */
export function hasRoom(plan: unknown[], left: number | undefined) {
  return left === undefined || plan.length < left;
}

/**
 * The position a track takes at a place in the plan (its end when `before` is left out): the next one the character
 * has on it, after those of it planned before, as the wizard numbers them and the plan's buttons and options say.
 */
export function plannedPosition(
  option: { id: string; track?: { next: number } },
  plan: ({ id: string } | null)[],
  before = plan.length,
) {
  return (option.track?.next ?? 1) + plan.slice(0, before).filter((planned) => planned?.id === option.id).length;
}

/** The planned advancements' slot keys, in plan order (`slotKeys`, one per slot of `plan`): the filled slots'. */
export function plannedSlotKeys(plan: unknown[], slotKeys: number[]) {
  return slotKeys.filter((_, index) => plan[index] !== null);
}
