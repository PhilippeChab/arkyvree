import type { Checked } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import type { BaseBookSeeds } from "./BaseBookSeeds.ts";
import { Memos } from "./Memos.ts";

/**
 * The seeds of one of a book's references (a feat reference's, a race reference's…), which the book builds once per
 * reference (`BaseBookSeeds`): the reference, the book's seeds, which it reads what other kinds give from, the check of
 * a text against the fixed set of options the seed accepts, and what it builds, each once, when first asked (`memo`):
 * `parser:dnd3.5:validate` reads what a seed checks without building what throws.
 */
export abstract class ReferenceSeeds<R> {
  constructor(
    readonly ref: R,
    protected readonly book: BaseBookSeeds,
  ) {}

  /** What it built, by what it is. */
  private readonly memos = new Memos();

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

  /** What `build` builds, once: the same each time `key` asks for it. */
  protected memo<T>(key: string, build: () => T): T {
    return this.memos.of(key, build);
  }
}
