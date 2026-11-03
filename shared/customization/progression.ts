/**
 * A progression: what a character's positions give of something whatever its tracks (a ruleset's feats, its
 * ability increases), as a frequency and the positions that give more than it. The engine counts by it, its save checks
 * it, and a form checks it as it's written.
 */

import type { RulesWord } from "@/shared/rulesets.ts";

/**
 * A progression as data declares it, written `as const` (a field's default): its positions read-only, which a copy
 * makes its own (`copyProgression`).
 */
export interface DeclaredProgression {
  every: number;
  extra: readonly ProgressionExtra[];
}

/** A position a progression gives more at than its frequency: its position, and how many more. */
export interface ProgressionExtra {
  amount: number;
  position: number;
}

/**
 * What's wrong with a position a progression gives more at (`index`, in its `extra`): its part to change (its position,
 * or its amount where a position may give more than one), and why.
 */
export interface ProgressionIssue {
  index: number;
  message: string;
  part: "amount" | "position";
}

/**
 * What positions give of something: one every `every` positions (none at 0), and more at the positions `extra` names.
 */
export interface ProgressionValue {
  every: number;
  extra: ProgressionExtra[];
}

/** A progression's own copy, which an edit changes apart from the one it's copied from (a field's default). */
export function copyProgression({ every, extra }: DeclaredProgression): ProgressionValue {
  return { every, extra: extra.map(({ amount, position }) => ({ amount, position })) };
}

/** What position `position` of a character gives of a progression: its frequency's, and the more it names there. */
export function countProgressionAt({ every, extra }: ProgressionValue, position: number): number {
  return countRegularAt(every, position) + (extra.find((given) => given.position === position)?.amount ?? 0);
}

/**
 * What a progression's frequency (`every`) gives at position `position` of a character: one at each multiple, none at
 * 0.
 */
export function countRegularAt(every: number, position: number): number {
  return every > 0 && position >= 1 && position % every === 0 ? 1 : 0;
}

/**
 * How many more a progression may give at position `position` of a character than its frequency, within its bound
 * (`max`).
 */
export function countRoomAt(every: number, position: number, max: number): number {
  return max - countRegularAt(every, position);
}

/**
 * What's wrong with a progression's positions, each giving at most `max` with its frequency's: a position listed twice
 * (both of them), or one giving past its bound (its position, for one that gives one at most a position, which has no
 * amount to change), each said in its ruleset's word (`word`). The form checks its fields by them, and the save refuses
 * them.
 */
export function findProgressionIssues(
  { every, extra }: ProgressionValue,
  max: number,
  word: RulesWord,
): ProgressionIssue[] {
  return extra.flatMap(({ amount, position }, index): ProgressionIssue[] => {
    const issues: ProgressionIssue[] = [];
    if (extra.some((given, other) => other !== index && given.position === position))
      issues.push({ index, message: `${word.one} ${position} is listed twice`, part: "position" });
    const room = countRoomAt(every, position, max);
    if (amount <= room) return issues;
    const frequency = every === 1 ? word.one.toLowerCase() : `${every} ${word.many.toLowerCase()}`;
    const message =
      max === 1
        ? `${word.one} ${position} gives one already, every ${frequency}`
        : `${word.one} ${position} would give ${amount + max - room}, at most ${max}`;
    return [...issues, { index, message, part: max === 1 ? "position" : "amount" }];
  });
}
