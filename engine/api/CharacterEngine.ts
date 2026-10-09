import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";

import LevelUpEngine from "./LevelUpEngine.ts";
import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a character, past the view and the character the handle binds. */
type Args<K extends keyof Module["characters"]> = Rest<Module["characters"][K], [RulesetView, CharacterInput]>;

/** The engine bound to a character, from its rows (`input`): its sheets, its inventory and its level flows. */
export default class CharacterEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly input: CharacterInput,
  ) {}

  /**
   * The character's sheet, as the API answers it: a player character's with its bonded creatures', their private notes
   * as the viewer reads them (all of them, blank, or no field); or a bonded creature's, from its master's.
   */
  describe(...args: Args<"describeCharacter">) {
    return this.module.characters.describeCharacter(this.view, this.input, ...args);
  }

  /**
   * The character as a campaign member reads it (`reading`): partly, who it is and what it looks like (`partial`), or
   * its sheet with its bonded creatures', their private notes shown or blank.
   */
  describeForMember(...args: Args<"describeCampaignCharacter">) {
    return this.module.characters.describeCampaignCharacter(this.view, this.input, ...args);
  }

  /** The character's printed sheet: the PDF document the server renders. */
  describeSheet(...args: Args<"describeCharacterSheet">) {
    return this.module.characters.describeCharacterSheet(this.view, this.input, ...args);
  }

  /** The character's level flows: its level-up wizard's steps and pickers, and what its level saves write. */
  levelUp() {
    return new LevelUpEngine(this.view, this.module, this.input);
  }

  /**
   * What an inventory entry's add or edit stores: its placement and charges, refused when the item isn't the ruleset's,
   * its charges disagree, or it can't be equipped where the request asks.
   */
  planInventoryEntry(...args: Args<"planInventoryEntry">) {
    return this.module.characters.planInventoryEntry(this.view, this.input, ...args);
  }
}
