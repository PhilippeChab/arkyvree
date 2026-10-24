import type { CowData } from "@/engine/core/cow/index.ts";
import type {
  Campaign,
  CharacterInventory,
  Character as CharacterRecord,
  Modifier,
  Player,
  Requirement,
} from "@/shared/relations.ts";

/**
 * A character's row and the rows it's built from, as the server reads them in its ruleset's scope: a child's with its
 * parent's (`parent`, 3.5's bonded creature's master), whose sheet the child's derives from.
 */
export interface CharacterInput {
  parent?: CharacterInput;
  record: CharacterRecord;
  rows: CharacterRows;
}

/**
 * Each of a character's links' rows as the view holds them, by the link's name: its module declares its own into it
 * (`declare module`), as its kinds' rows (`ViewEntities`).
 */
export interface CharacterLinkTypes {}

/**
 * A character's own rows, which the server reads (`readCharacterInput`) and its module builds the character from: its
 * seat in a campaign, its links by name (`links`), its inventory and levels, every saved level's picks under it, and
 * the modifiers set on the character itself, with their requirements. An inventory entry and a pick are the links they
 * are, whose entities are the view's. Read as stored: the engine resolves their references as they enter it
 * (`CharacterInputs`).
 */
export interface CharacterRows {
  campaign: Campaign | undefined;
  inventory: CharacterInventory[];
  levels: CharacterAdvancement[];
  links: CharacterLinks;
  modifiers: Modifier[];
  picks: CharacterPicks;
  player: Player | undefined;
  requirements: Requirement[];
}

/**
 * A character's advancements' rows as the view holds them (`levels`): its module declares its own into it
 * (`declare module`), as its kinds' rows (`ViewEntities`).
 */
export interface CharacterRowTypes {}

/**
 * A character's advancement, one of its levels, as its module declares its row (`CharacterRowTypes`' `levels`: 3.5's
 * class level and hit points).
 */
export type CharacterAdvancement = CharacterRowOf<"levels">;

/**
 * A character's rows of each link its module stores (`StoredCharacter.links`), by the link's name: each row as its
 * module's declaration reads it (`CharacterLinkTypes`).
 */
export type CharacterLinks = { [K in keyof CharacterLinkTypes]: CharacterLinkTypes[K][] };

/**
 * A character's saved levels' rows under them, by the name of the pick its module declares each under (3.5's feats, its
 * ability increases): each row as its module's declaration reads a pick, of the level it's under.
 */
export type CharacterPicks = Record<string, ({ characterLevelId: string } & Record<string, unknown>)[]>;

/** A character's rows of a key (`K`), as its module declares them, or any row for a key it declares none of. */
export type CharacterRowOf<K extends string> = K extends keyof CharacterRowTypes
  ? CharacterRowTypes[K]
  : Record<string, unknown>;

/**
 * A character's rows as its ruleset's view reads them: each reference to an entity (a link's, an advancement's track,
 * an item, a pick's) resolved to the one the view shows in its place, a copy's or a sibling winner's, since a row
 * stored before the copy names its source. The engine resolves what it's handed once, as it enters; the server passes
 * rows as stored.
 */
export default class CharacterInputs {
  /** A character's input, its parent's too, its rows' references resolved. */
  static resolve(input: CharacterInput, cow: CowData): CharacterInput {
    if (cow.isEmpty()) return input;
    const { rows } = input;
    const [record] = cow.resolveRows([input.record]);
    return {
      ...(input.parent && { parent: CharacterInputs.resolve(input.parent, cow) }),
      record,
      rows: {
        ...rows,
        inventory: cow.resolveRows(rows.inventory),
        levels: cow.resolveRows(rows.levels),
        links: CharacterInputs.resolveNamed(
          rows.links as Record<string, Record<string, unknown>[]>,
          cow,
        ) as CharacterLinks,
        picks: CharacterInputs.resolveNamed(rows.picks, cow),
      },
    };
  }

  /** Several characters' inputs (a parent's children's), each resolved. */
  static resolveAll(inputs: CharacterInput[], cow: CowData): CharacterInput[] {
    return inputs.map((input) => CharacterInputs.resolve(input, cow));
  }

  /** A character's rows by name (a level's picks, its links), each row's entity and pool resolved. */
  static resolveNamed<P extends Record<string, Record<string, unknown>[]>>(picks: P, cow: CowData): P {
    return Object.fromEntries(Object.entries(picks).map(([pick, rows]) => [pick, cow.resolveRows(rows)])) as P;
  }
}
