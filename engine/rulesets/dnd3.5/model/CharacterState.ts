import { CharacterBase, type InventoryEntry } from "@/engine/core/character/index.ts";
import type { Klass } from "@/shared/relations.ts";

import { type Dnd35Components } from "./CharacterComponents.ts";
import type { LoadedCharacterData } from "./loading/DetailedCharacterDataLoader.ts";
import type { CustomizedClassLevel, CustomizedFeat, CustomizedPower } from "./loading/loadedEntities.ts";

/**
 * A 3.5 character's state, on core's (`CharacterBase`): its components, and what its build loads. Its concerns add the
 * build's steps (`Builds`), its own issues and the names its issues give (`Diagnoses`), the spells and feats it has
 * without a pick (`PossessesVirtually`) and core's validation (`Validates`); `DetailedCharacter` wires them.
 */
export default abstract class CharacterState extends CharacterBase<Dnd35Components, LoadedCharacterData> {
  // Diagnostic helpers (resolveEntityName / resolveModifierSourceName) run
  // per unmet-requirement when formatting validation errors. Build lookup
  // maps once on first use and reuse across subsequent resolve calls.
  // The index is cached for the lifetime of the DetailedCharacter instance;
  // it relies on the loaded feats, powers, inventory, class levels and race
  // being immutable after `build()` returns. If any
  // future code mutates those post-build, invalidate this field first.
  protected diagnosticsIndex?: {
    featsById: Map<string, CustomizedFeat>;
    inventoryByItemId: Map<string, InventoryEntry>;
    klassLevelsById: Map<string, CustomizedClassLevel>;
    modifierOwner: Map<string, { name: string; type: string }>;
    powersById: Map<string, CustomizedPower>;
    rulesetKlassesById: Map<string, Klass>;
  };

  /** The feats the character holds, with their customizations: picked, granted, planned or from its modifiers. */
  getHeldFeats() {
    return this.data.feats;
  }

  /** The powers the character knows, each in its pool: picked, granted, planned or from its modifiers (`virtual`). */
  getHeldPowers() {
    return this.data.powers;
  }
}
