import type { BaseClassSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/classes/BaseClassSeeds.ts";
import { type AptitudePick } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A class's aptitude picks, as its seed lists them. */
export function AptitudePicks<B extends Constructor<BaseClassSeeds>>(Base: B) {
  abstract class WithAptitudePicks extends Base {
    /**
     * The class's aptitude picks, split per level (`picks`), but those its features' modifiers already give (`remap`ped
     * or split `perLevel`).
     */
    protected seedAptitudePicks(): AptitudePick[] {
      const { aptitudePicks, remap, perLevel } = this.picks();
      if (!aptitudePicks || aptitudePicks.length === 0) return [];
      const featModTargets = new Set<string>();
      for (const feat of Object.values(this.ref.mapping.features)) {
        for (const m of feat.modifiers ?? []) {
          if (m.operator !== "add" || !m.target.startsWith("aptitudes.") || !m.target.endsWith(".allowed")) continue;
          const remapped = remap.get(m.target);
          const expansions = perLevel.get(m.target);
          if (remapped) featModTargets.add(remapped);
          else if (expansions) for (const exp of expansions) featModTargets.add(exp.newTarget);
          else featModTargets.add(m.target);
        }
      }
      return aptitudePicks.filter((p) => !featModTargets.has(p.target));
    }
  }
  return WithAptitudePicks;
}
