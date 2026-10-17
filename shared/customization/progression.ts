/**
 * A progression: what character levels give of something whatever a character's classes (a ruleset's feats, its
 * ability increases), as a frequency and the levels that give more than it. The engine counts by it, its save checks
 * it, and a form checks it as it's written.
 */

/** A level a progression gives more at than its frequency: its level, and how many more. */
export interface ProgressionExtra {
  amount: number;
  level: number;
}

/** What levels give of something: one every `every` levels (none at 0), and more at the levels `extra` names. */
export interface ProgressionValue {
  every: number;
  extra: ProgressionExtra[];
}

/** A progression's own copy, which an edit changes apart from the one it's copied from (a spec's default). */
export function copyProgression({ every, extra }: ProgressionValue): ProgressionValue {
  return { every, extra: extra.map(({ amount, level }) => ({ amount, level })) };
}

/** What character level `level` gives of a progression: its frequency's, and the more it names there. */
export function countProgressionAt({ every, extra }: ProgressionValue, level: number): number {
  return countRegularAt(every, level) + (extra.find((given) => given.level === level)?.amount ?? 0);
}

/** What a progression's frequency (`every`) gives at character level `level`: one at each multiple, none at 0. */
export function countRegularAt(every: number, level: number): number {
  return every > 0 && level % every === 0 ? 1 : 0;
}
