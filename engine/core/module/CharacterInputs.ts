import type {
  characterAbilitiesInCharacter,
  languagesInCharacter,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelSkillsInCharacter,
} from "@/drizzle/schema.ts";
import type { CowData } from "@/engine/core/cow/index.ts";
import type {
  Campaign,
  CharacterInventory,
  CharacterLevel,
  Character as CharacterRecord,
  Item,
  Modifier,
  Player,
  Requirement,
} from "@/shared/relations.ts";

/** A level's picks, or a character's: its feats', powers' and skills' rows. */
type PickRows = Record<"feats" | "powers" | "skills", Record<string, unknown>[]>;

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
 * in a campaign, its ability scores, languages, inventory and levels, every saved level's picks (the links, whose
 * entities are the view's), and the modifiers set on the character itself, with their requirements. Read as stored:
 * the engine resolves their references as they enter it (`CharacterInputs`).
 */
export interface CharacterRows {
  abilities: (typeof characterAbilitiesInCharacter.$inferSelect)[];
  campaign: Campaign | undefined;
  inventory: (CharacterInventory & { itemsInRule: Item })[];
  languages: (typeof languagesInCharacter.$inferSelect)[];
  levels: CharacterLevel[];
  modifiers: Modifier[];
  picks: {
    feats: (typeof levelFeatsInCharacter.$inferSelect)[];
    powers: (typeof levelPowersInCharacter.$inferSelect)[];
    skills: (typeof levelSkillsInCharacter.$inferSelect)[];
  };
  player: Player | undefined;
  requirements: Requirement[];
}

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
