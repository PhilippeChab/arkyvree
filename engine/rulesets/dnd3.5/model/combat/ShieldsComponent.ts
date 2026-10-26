import { CharacterComponent, type InventoryEntry } from "@/engine/core/character/index.ts";
import { type ItemFieldValues } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type InventoryComponent from "@/engine/rulesets/dnd3.5/model/inventory/InventoryComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import { stripSeparators } from "@/shared/text.ts";
import { MASTERWORK_CHECK_PENALTY_REDUCTION } from "@/vocabulary/dnd3.5/combat.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A type's shields, by the inventory entry holding each: one entry held in two sets is one shield, in each set. */
type ShieldGroup = Record<string, ShieldSlot>;

/** Grouping key (normalized) → ShieldGroup */
type ShieldsData = Record<string, ShieldGroup>;

/** A shield the character has equipped: its AC, its penalties, and its cap on the Dexterity bonus to AC. */
export interface ShieldSlot {
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  itemId: string;
  /** Its maximum Dexterity bonus to AC: a tower shield's, 99 (none) for the others, as an armor's */
  maxdex: number;
  name: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  spellfailure: number;
}

/**
 * The shields a character has equipped, the inventory's (`InventoryComponent.getEquipped`): each under its type, beside
 * the type's others (`items.shields.<type>` reaches them all), and in the weapon set whose off hand holds it.
 */
export default class ShieldsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly inventory: InventoryComponent) {
    super();
  }

  /** Each weapon set's shields, by the set's key (stored from 0): what its armor class and its attacks read. */
  private readonly sets: Record<string, ShieldSlot[]> = {};

  private readonly shields: ShieldsData = {};

  /** Each shield the inventory has equipped, in its order. */
  override initialize() {
    for (const { entry, fields } of this.inventory.getEquipped())
      if (entry.item.fields[ITEM_TYPE] === "Shield") this.registerShield(entry, fields);
  }

  /**
   * A shield under its type, and in each weapon set its entry is in (the first, for an entry stored without one): the
   * same shield in each, its penalties counted once.
   */
  private registerShield(entry: InventoryEntry, fields: ItemFieldValues): void {
    const { id, item } = entry;
    if (fields.shield.proficiency === null) return;

    const acBonus = fields.shield.acBonus ?? 0;
    let checkPenalty = fields.checkPenalty ?? 0;
    const spellFailure = fields.spellFailure ?? 0;
    const maxDex = fields.maxDex ?? 99;

    if (fields.masterwork === true) checkPenalty = Math.min(checkPenalty + MASTERWORK_CHECK_PENALTY_REDUCTION, 0);

    const shieldSlot: ShieldSlot = {
      name: item.name,
      itemId: item.id,
      proficient: true,
      // Its AC's total is computed when read, from the bonus and what modifiers add
      ac: {
        bonus: acBonus,
        misc: 0,
        get total() {
          return this.bonus + this.misc;
        },
      },
      checkpenalty: checkPenalty,
      spellfailure: spellFailure,
      maxdex: maxDex,
    };

    // Under its type: a heavy wooden shield's `heavywooden`
    const grouping = fields.shield.type === null ? "" : stripSeparators(fields.shield.type);
    if (grouping) (this.shields[grouping] ??= {})[id] = shieldSlot;
    for (const set of ItemPlacement.heldSets(entry)) (this.sets[String(set)] ??= []).push(shieldSlot);
  }

  /**
   * The check penalty the shields give the skills: the worst weapon set's, as a shield carried in any set weighs on
   * them.
   */
  getCheckPenalty(): number {
    const penalties = Object.values(this.sets).map((slots) => slots.reduce((sum, slot) => sum + slot.checkpenalty, 0));
    return Math.min(0, ...penalties);
  }

  getShields(): ShieldsData {
    return this.shields;
  }

  /** Each weapon set's shields, by the set's key: a set without a shield has none. */
  getShieldSets(): Readonly<Record<string, ShieldSlot[]>> {
    return this.sets;
  }
}

export type { ShieldsData };
