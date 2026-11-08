/**
 * A value that holds bonuses of one type, which don't stack (3.5's and Pathfinder's deflection bonuses: a Ring of
 * Protection +1 and a +2 deflection bonus give +2): of the modifiers that add to it, each source's own sum counts, and
 * only the best bonus and the worst penalty apply. A source is a modifier's (`sourceId`: an item, a feat, a race), so a
 * source's own modifiers add up (a magic armor's enhancement on its armor bonus). An object defines such a value
 * (`define`), with what its sources hold before any modifier (`bases`: a worn armor's armor bonus, by the armor's item)
 * and the value it shares its sources with (`parent`: a weapon set's deflection bonus, the character's); it's read
 * live, as its sources stand. The modifiers' evaluator adds to a source (`add`) where it would add to the value.
 */

/** What a value keeps: what isn't any source's, its modifiers' sums by source, and where else its sources come from. */
interface Stack {
  /** What its sources hold before any modifier (a worn armor's armor bonus), read live */
  bases?: () => ReadonlyMap<string, number>;
  /** The value of another object it shares its sources with, read live (a weapon set's, the character's) */
  parent?: { key: string; object: () => object };
  /** What isn't any source's: what it was set to, past what its sources gave then */
  rest: number;
  sums: Sources;
}

/** A value's sources, as they stand: by source, what each adds up to. */
type Sources = Map<string, number>;

/** Where an object keeps its values that keep the best, by key: not enumerable, so the object reads as before. */
const STACKS = Symbol("bestOfSources");

/** The best of `amounts`' bonuses (0 for none) and their worst penalty (0 for none), together. */
function bestAndWorst(amounts: Iterable<number>): number {
  let best = 0;
  let worst = 0;
  for (const amount of amounts) {
    if (amount > best) best = amount;
    if (amount < worst) worst = amount;
  }
  return best + worst;
}

/** What isn't any source's in a value (`stack`): its own, and its parent's. */
function restOf(stack: Stack): number {
  const parent = stack.parent && stackOf(stack.parent.object(), stack.parent.key);
  return stack.rest + (parent ? restOf(parent) : 0);
}

/** A value's sources (`stack`), as they stand: its parent's, its bases and its modifiers' sums, a source's added up. */
function sourcesOf(stack: Stack): Sources {
  const parent = stack.parent && stackOf(stack.parent.object(), stack.parent.key);
  const sources: Sources = parent ? sourcesOf(parent) : new Map();
  const add = (entries: Iterable<[string, number]>) => {
    for (const [source, amount] of entries) sources.set(source, (sources.get(source) ?? 0) + amount);
  };
  add(stack.bases?.() ?? []);
  add(stack.sums);
  return sources;
}

/** The stack of `object`'s value at `key`: none when it isn't one that keeps the best. */
function stackOf(object: unknown, key: string): Stack | undefined {
  if (typeof object !== "object" || object === null) return undefined;
  return (object as { [STACKS]?: Map<string, Stack> })[STACKS]?.get(key);
}

/** A value (`stack`), as it stands: what isn't any source's, and its sources' best bonus and worst penalty. */
function valueOf(stack: Stack): number {
  return restOf(stack) + bestAndWorst(sourcesOf(stack).values());
}

export default class BestOfSources {
  /**
   * Adds `amount` to `source`'s sum in `object`'s value at `key` (a subtract a negative amount): the value then counts
   * that source's whole sum, if it's the best bonus or the worst penalty.
   */
  static add(object: object, key: string, source: string, amount: number): void {
    const stack = stackOf(object, key);
    if (stack) stack.sums.set(source, (stack.sums.get(source) ?? 0) + amount);
  }

  /**
   * Defines `object`'s value at `key` as keeping the best of its sources, from `value` (what isn't any source's), with
   * its bases (`bases`) and its parent (`parent`, its value read on another object), if any. Setting it (a set, a
   * multiply) drops its modifiers' sums: it reads what it's set to, its bases and parent as they stood then.
   */
  static define(object: object, key: string, value: number, options: Pick<Stack, "bases" | "parent"> = {}): void {
    const holder = object as { [STACKS]?: Map<string, Stack> };
    if (!holder[STACKS]) Object.defineProperty(object, STACKS, { value: new Map(), enumerable: false });
    const stack: Stack = { ...options, rest: value, sums: new Map() };
    holder[STACKS]!.set(key, stack);
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      get: () => valueOf(stack),
      set: (set: number) => {
        stack.sums.clear();
        stack.rest = 0;
        stack.rest = set - valueOf(stack);
      },
    });
  }

  /** Whether `object`'s value at `key` keeps the best of its sources. */
  static keepsBest(object: unknown, key: string): object is object {
    return stackOf(object, key) !== undefined;
  }
}
