import type { CharacterCard } from "@/engine/core/module/index.ts";
import type { Character } from "@/shared/relations.ts";

import CharacterValues from "./CharacterValues.ts";
import ClassLevels from "./ClassLevels.ts";

/** A ruleset's view as a card reads it: the names of its races and classes, and its classes' levels. */
interface CardData {
  classesById: ReadonlyMap<string, { name: string }>;
  classLevelsById: ReadonlyMap<string, { ownerId: string; position: number }>;
  racesById: ReadonlyMap<string, { name: string }>;
}

/** A 3.5 character's card, as a list of characters shows it. */
export default class CharacterCards {
  /**
   * The card of a character (`character`, its single links as stored, its race's among them; with its levels, `levels`:
   * its advancements, each with its entry, a class level), named as its ruleset's view names its race and classes, a
   * copied or renamed one by its own name: its race's chip, which a partly seen character shows, then each class at the
   * highest level the character has in it.
   */
  static describe(
    data: CardData,
    character: Pick<Character, "links">,
    levels: { entryId: string | null }[],
  ): CharacterCard {
    const levelByClassName = new Map<string, number>();
    for (const level of levels) {
      const classLevel = level.entryId === null ? undefined : data.classLevelsById.get(level.entryId);
      if (!classLevel) continue;
      const className = data.classesById.get(classLevel.ownerId)?.name || "Unknown";
      if (classLevel.position > (levelByClassName.get(className) || 0))
        levelByClassName.set(className, classLevel.position);
    }
    const classLevels = [...levelByClassName].map(([klass, level]) => ({ klass, level }));
    const race = data.racesById.get(CharacterValues.raceOf(character))?.name ?? "Unknown";
    return {
      chips: [
        { label: race, partial: true, tone: "secondary" },
        ...classLevels.map(({ klass, level }) => ({
          label: ClassLevels.format(klass, level),
          partial: false,
          tone: "primary" as const,
        })),
      ],
    };
  }
}
