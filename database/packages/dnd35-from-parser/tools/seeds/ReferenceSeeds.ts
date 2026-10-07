import type { Checked } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import type { BaseBookSeeds } from "./BaseBookSeeds.ts";

/**
 * The seeds of one of a book's references (a feat reference's, a race reference's…), which the book builds once per
 * reference (`BaseBookSeeds`): the reference, the book's seeds, which it reads what other kinds give from, and the
 * check of a text against the fixed set of options the seed accepts.
 */
export abstract class ReferenceSeeds<R> {
  constructor(
    readonly ref: R,
    protected readonly book: BaseBookSeeds,
  ) {}

  /** A checked value, for the seed: its problem throws. */
  protected checkedValue<T>(checked: Checked<T>): T {
    if (!checked.ok) throw new Error(checked.problem);
    return checked.value;
  }

  /** `value` checked against `options`: `what` names it in the problem. */
  protected checkOneOf<T extends string>(value: string, options: readonly T[], what: string): Checked<T> {
    return isOneOf(value, options)
      ? { ok: true, value }
      : { ok: false, problem: `${what}: "${value}" isn't one of ${options.join(", ")}` };
  }
}
