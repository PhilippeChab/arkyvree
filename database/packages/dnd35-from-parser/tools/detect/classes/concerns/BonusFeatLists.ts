import type { BaseClassDetector } from "@/database/packages/dnd35-from-parser/tools/detect/classes/BaseClassDetector.ts";
import {
  readBonusFeatList,
  readPerLevelBonusFeatLists,
  readPoolSubOptions,
  readTreatedAsHavingFeats,
} from "@/database/packages/dnd35-from-parser/tools/detect/classes/featureText.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type BonusFeatList } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { Constructor } from "@/server/mixins.ts";

/** A level as an aptitude's name gives it: "1st", "2nd", "3rd", "4th"… */
function ordinal(level: number): string {
  return level === 1 ? "1st" : level === 2 ? "2nd" : level === 3 ? "3rd" : `${level}th`;
}

/** Reading a class's bonus feat lists: the existing feats its player picks from. */
export function BonusFeatLists<B extends Constructor<BaseClassDetector>>(Base: B) {
  abstract class WithBonusFeatLists extends Base {
    /**
     * The class's bonus feat lists, each an aptitude of the existing feats its player picks from: a feature's list
     * ("from the following list: X, Y, Z"), one per level ("At 1st level… select either X or Y"), or the feats a
     * single-level feature treats its player as having (a ranger's combat style).
     */
    protected bonusFeatLists(): { bonusFeatLists?: BonusFeatList[] } {
      const { raw } = this;
      const lists: BonusFeatList[] = [];

      for (const occ of this.featureOccurrences) {
        const cf = this.findFeature(occ.name);
        if (!cf) continue;

        const desc = normalizeWs(cf.description);

        // Single-level features: check for "treated as having" pattern (ranger combat style)
        if (occ.levels.length === 1) {
          const treatedFeats = readTreatedAsHavingFeats(desc);
          if (!treatedFeats) continue;
          lists.push({
            aptitude: `${raw.name} ${occ.name} (${ordinal(occ.levels[0])})`,
            feats: treatedFeats,
            levels: [occ.levels[0]],
          });
          continue;
        }

        // Don't flag features that are pool sub-options (those have "Name: description" patterns)
        const parsed = readPoolSubOptions(desc);
        if (parsed && parsed.options.length >= 2) continue;

        // Try per-level parsing first (e.g. "At 1st level... select X or Y. At 2nd level... select A or B")
        const perLevel = readPerLevelBonusFeatLists(desc);
        if (perLevel) {
          const baseAptitude = `${raw.name} ${occ.name}`;
          for (const entry of perLevel) {
            lists.push({
              aptitude: `${baseAptitude} (${ordinal(entry.level)})`,
              feats: entry.feats,
              levels: [entry.level],
            });
          }
          continue;
        }

        // Fall back to shared pool parsing ("from the following list: X, Y, Z")
        const feats = readBonusFeatList(desc);
        if (!feats) continue;

        const aptitude = `${raw.name} ${occ.name}`;
        lists.push({ aptitude, feats });
      }

      return lists.length > 0 ? { bonusFeatLists: lists } : {};
    }
  }
  return WithBonusFeatLists;
}
