import { BONDED_RACE_STATS, type BondedRaceStatBlock } from "@/vocabulary/dnd5.2/bondedCreatures.ts";

/** A bonded creature's race stats, by its kind and its master's level. */
export default class BondedRaceData {
  static getStats(raceName: string | undefined | null): BondedRaceStatBlock | null {
    if (!raceName) return null;
    return BONDED_RACE_STATS[raceName] ?? null;
  }
}
