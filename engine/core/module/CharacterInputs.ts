import type { CowData } from "@/engine/core/cow/index.ts";

import type { CharacterInput } from "./contract.ts";

/** A level's picks, or a character's: its feats', powers' and skills' rows. */
type PickRows = Record<"feats" | "powers" | "skills", Record<string, unknown>[]>;

/**
 * A character's rows as its ruleset's view reads them: each reference to an entity (a race, a class level, an item, a
 * pick's feat, an ability) resolved to the one the view shows in its place, a copy's or a sibling winner's, since a row
 * stored before the copy names its source. The engine resolves what it's handed once, as it enters; the server passes
 * rows as stored.
 */
export default class CharacterInputs {
  /** A character's input, its master's too, its rows' references resolved. */
  static resolve(input: CharacterInput, cow: CowData): CharacterInput {
    if (cow.isEmpty()) return input;
    const { rows } = input;
    const [record] = cow.resolveRows([input.record]);
    return {
      ...(input.master && { master: CharacterInputs.resolve(input.master, cow) }),
      record,
      rows: {
        ...rows,
        abilities: cow.resolveRows(rows.abilities),
        inventory: cow.resolveRows(rows.inventory),
        languages: cow.resolveRows(rows.languages),
        levels: cow.resolveRows(rows.levels),
        picks: CharacterInputs.resolvePicks(rows.picks, cow),
      },
    };
  }

  /** Several characters' inputs (a master's bonded creatures'), each resolved. */
  static resolveAll(inputs: CharacterInput[], cow: CowData): CharacterInput[] {
    return inputs.map((input) => CharacterInputs.resolve(input, cow));
  }

  /** A level's picks (or a character's), each pick's feat, power, skill and pool resolved. */
  static resolvePicks<P extends PickRows>(picks: P, cow: CowData): P {
    return {
      ...picks,
      feats: cow.resolveRows(picks.feats),
      powers: cow.resolveRows(picks.powers),
      skills: cow.resolveRows(picks.skills),
    };
  }
}
