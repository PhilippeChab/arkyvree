/**
 * A progression: what character levels give of something whatever a character's classes (a ruleset's feats, its
 * ability increases), as a frequency and the levels that give more than it. The engine counts by it, its save checks
 * it, and a form checks it as it's written.
 */

/**
 * A progression as data declares it, written `as const` (a field's default): its levels read-only, which a copy makes
 * its own (`copyProgression`).
 */
export interface DeclaredProgression {
  every: number;
  extra: readonly ProgressionExtra[];
}

/** A level a progression gives more at than its frequency: its level, and how many more. */
export interface ProgressionExtra {
  amount: number;
  level: number;
}

/**
 * What's wrong with a level a progression gives more at (`index`, in its `extra`): its part to change (its level, or
 * its amount where a level may give more than one), and why.
 */
export interface ProgressionIssue {
  index: number;
  message: string;
  part: "amount" | "level";
}

/** What levels give of something: one every `every` levels (none at 0), and more at the levels `extra` names. */
export interface ProgressionValue {
  every: number;
  extra: ProgressionExtra[];
}

/** A progression's own copy, which an edit changes apart from the one it's copied from (a field's default). */
export function copyProgression({ every, extra }: DeclaredProgression): ProgressionValue {
  return { every, extra: extra.map(({ amount, level }) => ({ amount, level })) };
}

/** What character level `level` gives of a progression: its frequency's, and the more it names there. */
export function countProgressionAt({ every, extra }: ProgressionValue, level: number): number {
  return countRegularAt(every, level) + (extra.find((given) => given.level === level)?.amount ?? 0);
}

/** What a progression's frequency (`every`) gives at character level `level`: one at each multiple, none at 0. */
export function countRegularAt(every: number, level: number): number {
  return every > 0 && level >= 1 && level % every === 0 ? 1 : 0;
}

/** How many more a progression may give at character level `level` than its frequency, within its bound (`max`). */
export function countRoomAt(every: number, level: number, max: number): number {
  return max - countRegularAt(every, level);
}

/**
 * What's wrong with a progression's levels, each giving at most `max` with its frequency's: a level listed twice (both
 * of them), or one giving past its bound (its level, for one that gives one at most a level, which has no amount to
 * change). The form checks its fields by them, and the save refuses them.
 */
export function findProgressionIssues({ every, extra }: ProgressionValue, max: number): ProgressionIssue[] {
  return extra.flatMap(({ amount, level }, index): ProgressionIssue[] => {
    const issues: ProgressionIssue[] = [];
    if (extra.some((given, other) => other !== index && given.level === level))
      issues.push({ index, message: `Level ${level} is listed twice`, part: "level" });
    const room = countRoomAt(every, level, max);
    if (amount <= room) return issues;
    const message =
      max === 1
        ? `Level ${level} gives one already, every ${every === 1 ? "level" : `${every} levels`}`
        : `Level ${level} would give ${amount + max - room}, at most ${max}`;
    return [...issues, { index, message, part: max === 1 ? "level" : "amount" }];
  });
}
