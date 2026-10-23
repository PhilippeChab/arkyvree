import type { CharacterCard } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { formatClassLevel } from "@/shared/characterClasses.ts";

/** A 3.5 character's card, as a list of characters shows it. */
export default class CharacterCards {
  /**
   * The card of a character (`character`, with its levels, `levels`), named as its ruleset's view names its race and
   * classes, a copied or renamed one by its own name: its race's chip, which a partly seen character shows, then each
   * class at the highest level the character has in it; and its race, its classes and its total level.
   */
  static describe(view: RulesetView, character: { raceId: string }, levels: { klassLevelId: string }[]): CharacterCard {
    const { rulesetData } = view;
    const levelByKlassName = new Map<string, number>();
    for (const level of levels) {
      const klassLevel = rulesetData.klassLevelsById.get(level.klassLevelId);
      if (!klassLevel) continue;
      const klassName = rulesetData.klassesById.get(klassLevel.klassId)?.name || "Unknown";
      if (klassLevel.level > (levelByKlassName.get(klassName) || 0)) levelByKlassName.set(klassName, klassLevel.level);
    }
    const classLevels = [...levelByKlassName].map(([klass, level]) => ({ klass, level }));
    const race = rulesetData.racesById.get(character.raceId)?.name ?? "Unknown";
    return {
      chips: [
        { label: race, partial: true, tone: "secondary" },
        ...classLevels.map(({ klass, level }) => ({
          label: formatClassLevel(klass, level),
          partial: false,
          tone: "primary" as const,
        })),
      ],
      levels: classLevels,
      race,
      totalLevel: classLevels.reduce((sum, { level }) => sum + level, 0),
    };
  }
}
