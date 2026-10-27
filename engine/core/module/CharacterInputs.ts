import type { CowData } from "@/engine/core/cow/index.ts";
import type {
  Campaign,
  CharacterInventory,
  Character as CharacterRecord,
  Modifier,
  Player,
  Requirement,
} from "@/shared/relations.ts";

import type { StoredAdvancement, StoredCharacterLink, StoredPick } from "./storage.ts";

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
 * A character's own rows, which the server reads (`readCharacterInput`) and its module builds the character from: its
 * seat in a campaign, its advancements (its levels) and their picks by step, its links by role (`links`), its
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
 * Its links of each role it holds many of, as stored, by role (3.5's `score`, its ability scores, and `speaks`, its
 * languages): a role every module declares holds its links, none a list of none, in the order they were made.
 */
export type CharacterLinks = Record<string, StoredCharacterLink[]>;

/**
 * Its advancements' picks as stored, by step (3.5's `hp`, `abilities`, `skills`, `feats`, `spells`): a step every
 * module declares holds its picks, none a list of none, in the order the server reads them (by the picked entity's
 * name).
 */
export type CharacterPicks = Record<string, StoredPick[]>;

/**
 * A character's rows as its ruleset's view reads them: each reference to an entity (a single link's, a link's, an
 * advancement's entry, an inventory entry's item, a pick's entity and pool) resolved to the one the view shows in its
 * place, a copy's or a sibling winner's, since a row stored before the copy names its source. The engine resolves what
 * it's handed once, as it enters; the server passes rows as stored.
 */
export default class CharacterInputs {
  /** Advancements, each one's entry resolved. */
  private static resolveAdvancements(advancements: StoredAdvancement[], cow: CowData): StoredAdvancement[] {
    return advancements.map((advancement) =>
      advancement.entryId === null ? advancement : { ...advancement, entryId: cow.resolve(advancement.entryId) },
    );
  }

  /** Links by role, each one's entity resolved. */
  private static resolveLinks(links: CharacterLinks, cow: CowData): CharacterLinks {
    return Object.fromEntries(
      Object.entries(links).map(([role, stored]) => [
        role,
        stored.map((link) => ({ ...link, entityId: cow.resolve(link.entityId) })),
      ]),
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

  /** A character's row, each of its single links' entities resolved. */
  private static resolveRecord(record: CharacterRecord, cow: CowData): CharacterRecord {
    const links = Object.entries(record.links).map(([role, entityId]) => [role, cow.resolve(entityId)]);
    return { ...record, links: Object.fromEntries(links) };
  }

  /** A character's input, its parent's too, its rows' references resolved. */
  static resolve(input: CharacterInput, cow: CowData): CharacterInput {
    if (cow.isEmpty()) return input;
    const { rows } = input;
    return {
      ...(input.parent && { parent: CharacterInputs.resolve(input.parent, cow) }),
      record: CharacterInputs.resolveRecord(input.record, cow),
      rows: {
        ...rows,
        advancements: CharacterInputs.resolveAdvancements(rows.advancements, cow),
        inventory: CharacterInputs.resolveEntries(rows.inventory, cow),
        links: CharacterInputs.resolveLinks(rows.links, cow),
        picks: CharacterInputs.resolvePicks(rows.picks, cow),
      },
    };
  }

  /** Several characters' inputs (a parent's children's), each resolved. */
  static resolveAll(inputs: CharacterInput[], cow: CowData): CharacterInput[] {
    return inputs.map((input) => CharacterInputs.resolve(input, cow));
  }

  /** Inventory entries, each one's item resolved: the same array when the scope resolves nothing. */
  static resolveEntries<E extends { itemId: string }>(entries: E[], cow: CowData): E[] {
    if (cow.isEmpty()) return entries;
    return entries.map((entry) => ({ ...entry, itemId: cow.resolve(entry.itemId) }));
  }
}
