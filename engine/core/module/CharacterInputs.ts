import type { CowData } from "@/engine/core/cow/index.ts";
import type {
  Campaign,
  CharacterInventory,
  Character as CharacterRecord,
  Modifier,
  Player,
  Requirement,
} from "@/shared/relations.ts";

import type { StoredAdvancement, StoredPick } from "./storage.ts";

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
 * seat in a campaign, its advancements (its levels) and their picks by step, its links by name (`links`), its
 * inventory, and the modifiers set on the character itself, with their requirements. An inventory entry and a pick are
 * the links they are, whose entities are the view's. Read as stored: the engine resolves their references as they
 * enter it (`CharacterInputs`).
 */
export interface CharacterRows {
  advancements: StoredAdvancement[];
  campaign: Campaign | undefined;
  inventory: CharacterInventory[];
  links: CharacterLinks;
  modifiers: Modifier[];
  picks: CharacterPicks;
  player: Player | undefined;
  requirements: Requirement[];
}

/**
 * A character's rows of each link its module stores (`StoredCharacter.links`), by the link's name: each row as its
 * module's declaration reads it (`CharacterLinkTypes`).
 */
export type CharacterLinks = { [K in keyof CharacterLinkTypes]: CharacterLinkTypes[K][] };

/**
 * Its advancements' picks as stored, by step (3.5's `hp`, `abilities`, `skills`, `feats`, `spells`): a step every
 * module declares holds its picks, none a list of none, in the order the server reads them (by the picked entity's
 * name).
 */
export type CharacterPicks = Record<string, StoredPick[]>;

/**
 * A character's rows as its ruleset's view reads them: each reference to an entity (a link's, an advancement's track,
 * an item, a pick's entity and pool) resolved to the one the view shows in its place, a copy's or a sibling winner's,
 * since a row stored before the copy names its source. The engine resolves what it's handed once, as it enters; the
 * server passes rows as stored.
 */
export default class CharacterInputs {
  /** Advancements, each one's track resolved. */
  private static resolveAdvancements(advancements: StoredAdvancement[], cow: CowData): StoredAdvancement[] {
    return advancements.map((advancement) =>
      advancement.trackId === null ? advancement : { ...advancement, trackId: cow.resolve(advancement.trackId) },
    );
  }

  /** Picks by step, each one's entity and pool resolved. */
  private static resolvePicks(picks: CharacterPicks, cow: CowData): CharacterPicks {
    return Object.fromEntries(
      Object.entries(picks).map(([step, stored]) => [
        step,
        stored.map((pick) => ({
          ...pick,
          entityId: pick.entityId === null ? null : cow.resolve(pick.entityId),
          viaId: pick.viaId === null ? null : cow.resolve(pick.viaId),
        })),
      ]),
    );
  }

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
        advancements: CharacterInputs.resolveAdvancements(rows.advancements, cow),
        inventory: cow.resolveRows(rows.inventory),
        links: CharacterInputs.resolveNamed(
          rows.links as Record<string, Record<string, unknown>[]>,
          cow,
        ) as CharacterLinks,
        picks: CharacterInputs.resolvePicks(rows.picks, cow),
      },
    };
  }

  /** Several characters' inputs (a parent's children's), each resolved. */
  static resolveAll(inputs: CharacterInput[], cow: CowData): CharacterInput[] {
    return inputs.map((input) => CharacterInputs.resolve(input, cow));
  }

  /** A character's rows by name (its links), each row's entity resolved. */
  static resolveNamed<P extends Record<string, Record<string, unknown>[]>>(picks: P, cow: CowData): P {
    return Object.fromEntries(Object.entries(picks).map(([pick, rows]) => [pick, cow.resolveRows(rows)])) as P;
  }
}
