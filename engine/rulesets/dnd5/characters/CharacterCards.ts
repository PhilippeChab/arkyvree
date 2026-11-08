import type { RulesetCard } from "@/engine/core/module/index.ts";
import type { Character } from "@/shared/relations.ts";

import CharacterValues from "./CharacterValues.ts";
import ClassLevels from "./ClassLevels.ts";

/** A ruleset's view as a card reads it: the names of its species and classes, and its classes' levels. */
interface CardData {
  classesById: ReadonlyMap<string, { name: string }>;
  classLevelsById: ReadonlyMap<string, { ownerId: string }>;
  speciesById: ReadonlyMap<string, { name: string }>;
}

/** What D&D 5th Edition shows on a character's card, as a list of characters shows it: its chips. */
export default class CharacterCards {
  /**
   * The chips on the card of a character (`character`, its single links as stored, its species' among them; with its
   * levels, `levels`: its advancements, each with its entry, a class level), named as its ruleset's view names its
   * species and classes, a copied or renamed one by its own name: its species' chip, which a partly seen character
   * shows, then each class at the character's level in it (`ClassLevels.countByClass`).
   */
  static describe(data: CardData, character: Pick<Character, "links">, levels: { entryId: string }[]): RulesetCard {
    const classLevels = [...ClassLevels.countByClass(data.classLevelsById, levels)].map(([classId, level]) => ({
      klass: data.classesById.get(classId)?.name || "Unknown",
      level,
    }));
    const species = data.speciesById.get(CharacterValues.speciesOf(character))?.name ?? "Unknown";
    return {
      chips: [
        { label: species, partial: true, tone: "secondary" },
        ...classLevels.map(({ klass, level }) => ({
          label: ClassLevels.format(klass, level),
          partial: false,
          tone: "primary" as const,
        })),
      ],
    };
  }
}
