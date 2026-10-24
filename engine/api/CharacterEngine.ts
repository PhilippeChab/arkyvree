import { type CharacterInput, CharacterInputs } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CharacterHandle from "./CharacterHandle.ts";
import LevelUpEngine from "./LevelUpEngine.ts";
import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a character, past the view and the character the handle binds. */
type Args<K extends keyof Module["characters"]> = Rest<Module["characters"][K], [RulesetView, CharacterInput]>;

/**
 * The engine bound to a character, from its rows (`input`): its sheets, its links, its inventory and its level flows.
 * Its rows, and its children's, are read as the view reads them (`CharacterInputs`): the server hands them as stored.
 */
export default class CharacterEngine extends CharacterHandle {
  constructor(view: RulesetView, module: Module, input: CharacterInput) {
    super(view, module, CharacterInputs.resolve(input, view.rulesetData.cow));
  }

  /**
   * The character's sheet, as the API answers it: a character's, its children's subsheets among its blocks, or a
   * child's, from its parent's; its private notes shown or left out (`notes`).
   */
  describe(...[children, ...rest]: Args<"describe">) {
    return this.module.characters.describe(this.view, this.input, this.resolveChildren(children), ...rest);
  }

  /**
   * The character as a campaign member reads it (`reading`): partly, who it is and what it looks like (`partial`), or
   * its sheet, its private notes shown or left out.
   */
  describeForMember(...[children, ...rest]: Args<"describeForMember">) {
    return this.module.characters.describeForMember(this.view, this.input, this.resolveChildren(children), ...rest);
  }

  /**
   * What the character has of a picked link, and what its picks leave it room for, by the view's ids: what the link's
   * picker offers.
   */
  describeLinkPicks(...args: Args<"describeLinkPicks">) {
    return this.module.characters.describeLinkPicks(this.view, this.input, ...args);
  }

  /**
   * Why a location (in a weapon set, for a hand) can't take one more item of the character's, if it can't: what the
   * inventory dialogs warn of before a save refuses it.
   */
  describePlacement(...args: Args<"describePlacement">) {
    return this.module.characters.describePlacement(this.view, this.input, ...args);
  }

  /** The character's printed sheet: the PDF document the server renders. */
  describeSheet(...args: Args<"describeSheet">) {
    return this.module.characters.describeSheet(this.view, this.input, ...args);
  }

  /** The character's level flows: its level-up wizard's steps and pickers, and what its level saves write. */
  levelUp() {
    return new LevelUpEngine(this.view, this.module, this.input);
  }

  /**
   * What an edit of the character writes: its fields' columns, by the keys its sheet's fields block gives them, and its
   * picked links' picks it sends, each checked.
   */
  planEdit(...args: Args<"planEdit">) {
    return this.module.characters.planEdit(this.view, this.input, ...args);
  }

  /**
   * What an inventory entry's add or edit stores: its item (an added one by the view's id), its placement and charges,
   * refused when the item isn't the ruleset's, its charges disagree, or it can't be equipped where the request asks.
   */
  planInventoryEntry(...args: Args<"planInventoryEntry">) {
    return this.module.characters.planInventoryEntry(this.view, this.input, ...args);
  }

  /**
   * The picks of a picked link the character's edit stores, by the view's ids: refused when one isn't the ruleset's,
   * is sent twice, or is a new pick past what its rules let it have.
   */
  planLinkPicks(...args: Args<"planLinkPicks">) {
    return this.module.characters.planLinkPicks(this.view, this.input, ...args);
  }
}
