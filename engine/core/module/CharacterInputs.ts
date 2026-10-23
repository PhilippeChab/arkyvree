import type { CowData } from "@/engine/core/cow/index.ts";
import type { CharacterAbility, CharacterLanguage, CharacterLevel } from "@/engine/core/view/index.ts";
import type {
  Campaign,
  CharacterInventory,
  Character as CharacterRecord,
  Modifier,
  Player,
  Requirement,
} from "@/shared/relations.ts";

/**
 * A character's row and the rows it's built from, as the server reads them in its ruleset's scope: a bonded creature's
 * with its master's (`master`), whose sheet the creature's derives from.
 */
export interface CharacterInput {
  master?: CharacterInput;
  record: CharacterRecord;
  rows: CharacterRows;
}

/**
 * A character's own rows, which the server reads (`readCharacterInput`) and its module builds the character from: its seat
 * in a campaign, its ability scores, languages, inventory and levels, every saved level's picks under it, and the modifiers set on the character itself, with their requirements. An inventory entry and
 * a pick are the links they are, whose entities are the view's. Read as stored: the engine resolves their references as
 * they enter it (`CharacterInputs`).
 */
export interface CharacterRows {
  abilities: CharacterAbility[];
  campaign: Campaign | undefined;
  inventory: CharacterInventory[];
  languages: CharacterLanguage[];
  levels: CharacterLevel[];
  modifiers: Modifier[];
  picks: CharacterPicks;
  player: Player | undefined;
  requirements: Requirement[];
}

/**
 * A character's saved levels' rows under them, by the name of the pick its module declares each under (3.5's feats, its
 * ability increases): each row as its module's declaration reads a pick, of the level it's under.
 */
export type CharacterPicks = Record<string, ({ characterLevelId: string } & Record<string, unknown>)[]>;

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

  /** A level's rows under it (or a character's), each pick's entity and pool resolved. */
  static resolvePicks<P extends Record<string, Record<string, unknown>[]>>(picks: P, cow: CowData): P {
    return Object.fromEntries(Object.entries(picks).map(([pick, rows]) => [pick, cow.resolveRows(rows)])) as P;
  }
}
