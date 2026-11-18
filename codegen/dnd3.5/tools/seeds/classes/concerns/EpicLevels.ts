import type { BaseClassSeeds } from "@/codegen/dnd3.5/tools/seeds/classes/BaseClassSeeds.ts";
import type { ClassSeed } from "@/content/dnd3.5/builders/classes/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";

/** The levels of a pattern from `first`, every `every` levels, to the last class level (`MAX_CLASS_LEVEL`). */
function patternLevels(first: number, every: number): number[] {
  const levels: number[] = [];
  for (let level = first; level <= MAX_CLASS_LEVEL; level += every) levels.push(level);
  return levels;
}

/**
 * A class's levels past 20th, as its book's epic progression gives them (`epicClass`, the SRD's Epic Class
 * Progressions: the core classes'): none for a class it doesn't continue.
 */
export function EpicLevels<B extends Constructor<BaseClassSeeds>>(Base: B) {
  abstract class WithEpicLevels extends Base {
    /**
     * The class's seed (`seed`) continued to the last class level (`MAX_CLASS_LEVEL`) when its book's epic progression
     * continues it: its features at each level of their patterns, its epic bonus feats' feature among them, and the
     * level bonuses that go on (its last one of each target repeated: a monk's AC bonus every 5 levels from 25th).
     * Unchanged for another class.
     */
    protected withEpicLevels(seed: ClassSeed): ClassSeed {
      const epic = this.book.reference("epicClass")?.mapping[this.ref.raw.name];
      if (!epic || epic.skip) return seed;
      const { bonusFeats, features, levelModifiers = [] } = epic;
      const modifiers = levelModifiers.flatMap(({ target, first, every }) => {
        const last = seed.modifiers?.findLast((modifier) => modifier.target === target);
        if (!last) throw new Error(`${seed.name} has no level modifier of ${target} to go on with`);
        return patternLevels(first, every).map((level) => ({ ...last, level }));
      });
      const classFeatures = [...features, bonusFeats]
        .flatMap(({ feature, first, every }) =>
          patternLevels(first, every).map((level): [number, string] => [level, feature]),
        )
        .sort(([a, x], [b, y]) => a - b || (x < y ? -1 : 1));
      return {
        ...seed,
        levels: MAX_CLASS_LEVEL,
        classFeatures: [...(seed.classFeatures ?? []), ...classFeatures],
        ...(modifiers.length > 0 ? { modifiers: [...(seed.modifiers ?? []), ...modifiers] } : {}),
      };
    }
  }
  return WithEpicLevels;
}
