import type { BaseClassDetector } from "@/database/packages/dnd35-from-parser/tools/detect/classes/BaseClassDetector.ts";
import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { CREATURE_TYPES } from "@/database/packages/dnd35/data/creatureTypes.ts";
import type { Constructor } from "@/server/mixins.ts";

type CreatureType = (typeof CREATURE_TYPES)[number];

/** A favored enemy feature's text: "+2 bonus on Bluff, Listen, Sense Motive, Spot, and Survival checks". */
const FAVORED_ENEMY_TEXT =
  /\+2\s+(?:bonus\s+on\s+)?Bluff,\s*Listen,\s*Sense Motive,\s*Spot,?\s*and\s*Survival\s+checks/i;

/** The creature type a text names, a subtype ("Humanoid (Elf)" for elves) before a type. */
function findCreatureType(text: string): CreatureType | null {
  if (!text) return null;
  const tries: { keyword: string; variant: CreatureType }[] = [];
  for (const t of CREATURE_TYPES) {
    const m = t.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (m) tries.push({ keyword: m[2], variant: t });
  }
  for (const t of CREATURE_TYPES) if (!/\(/.test(t)) tries.push({ keyword: t, variant: t });

  for (const { keyword, variant } of tries)
    if (new RegExp(`\\b${RegExp.escape(keyword)}s?\\b`, "i").test(text)) return variant;

  return null;
}

/** Reading a class's favored enemy features locked to one creature type (a gnome giant-slayer's). */
export function ReadsFavoredEnemies<B extends Constructor<BaseClassDetector>>(Base: B) {
  abstract class ReadingFavoredEnemies extends Base {
    /** The favored enemy features locked to a creature type (a gnome giant-slayer's): re-routed to the shared variant. */
    protected lockedFavoredEnemies(): { lockedFavoredEnemies?: ClassReference["detected"]["lockedFavoredEnemies"] } {
      const results: NonNullable<ClassReference["detected"]["lockedFavoredEnemies"]> = [];

      for (const occ of this.featureOccurrences) {
        const desc = this.findFeature(occ.name)?.description;
        if (!desc) continue;
        const normalized = normalizeWs(desc);

        if (!FAVORED_ENEMY_TEXT.test(normalized)) continue;

        const nameMatch = occ.name.match(/\(([^)]+)\)/);
        let lockedType = nameMatch ? findCreatureType(nameMatch[1]) : null;
        if (!lockedType) lockedType = findCreatureType(normalized);
        if (!lockedType) continue;

        results.push({ featureName: occ.name, levels: occ.levels, creatureType: lockedType });
      }

      return results.length > 0 ? { lockedFavoredEnemies: results } : {};
    }
  }
  return ReadingFavoredEnemies;
}
