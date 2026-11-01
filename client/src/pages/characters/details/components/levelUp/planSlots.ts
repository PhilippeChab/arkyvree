/**
 * A `plan` step's slots, Add Level's: the tracks its advancements take, in order (3.5's classes), a slot not filled yet
 * `null`. Each slot has a key of its own, which what an advancement holds (its value, its choice) is kept by: filling
 * an earlier slot or removing one moves nothing to another advancement.
 */

/**
 * A track an option offers, as its `plan` step's picker answers it: the advancements left, and the positions it takes
 * next, in the order a plan takes them, as the engine numbers them.
 */
interface Track {
  eligible: boolean;
  id: string;
  track?: { left: number; positions: number[] };
}

/**
 * Whether an answer's advancements are the planned ones (`slots`): as many, each on its slot's track at its position
 * (an edit's one slot names neither, its level's). An answer kept while the next one loads may be for another plan,
 * whose advancements a step can't read by its slots.
 */
export function answersSlots(
  advancements: readonly { position: number; track: { id: string } }[],
  slots: readonly { position?: number; track?: string }[],
) {
  return (
    advancements.length === slots.length &&
    slots.every(
      ({ position, track }, index) =>
        track === undefined || (advancements[index].track.id === track && advancements[index].position === position),
    )
  );
}

/**
 * Whether a track can take the plan's next advancement, as its quick-add button says: it may (`eligible`), the plan has
 * room for another (`left`, `hasRoom`), and the track has a position left after those of it planned.
 */
export function canPlan(option: Track, plan: ({ id: string } | null)[], left: number | undefined) {
  return option.eligible && hasRoom(plan, left) && plannedPosition(option, plan) !== undefined;
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
 * The position a track takes at a place in the plan (its end when `before` is left out), as the plan's buttons and
 * options say: the one its picker answers after those of it planned before (`positions`, as the engine numbers a plan),
 * none once the track has no more.
 */
export function plannedPosition(
  option: { id: string; track?: { positions: number[] } },
  plan: ({ id: string } | null)[],
  before = plan.length,
): number | undefined {
  return option.track?.positions[plan.slice(0, before).filter((planned) => planned?.id === option.id).length];
}

/** The planned advancements' slot keys, in plan order (`slotKeys`, one per slot of `plan`): the filled slots'. */
export function plannedSlotKeys(plan: unknown[], slotKeys: number[]) {
  return slotKeys.filter((_, index) => plan[index] !== null);
}
