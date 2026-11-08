import type { SheetStat } from "@/engine/core/module/index.ts";
import type { CarryingData } from "@/engine/rulesets/dnd5/model/combat/CarryingComponent.ts";
import type { SetArmorClass, WeaponSet, WeaponSlot } from "@/engine/rulesets/dnd5/model/combat/CombatState.ts";
import { WEAPON_SET_SLOTS } from "@/engine/rulesets/dnd5/rules/InventorySlots.ts";
import { formatSigned } from "@/shared/text.ts";

/**
 * One attack a sheet lists for a weapon, as the sheet prints it: its label (the slot, "thrown" added), to-hit, damage
 * and its type, the rolls it scores a critical hit on, its range (normal and long) and its mastery, when its wielder
 * uses it.
 */
interface AttackRow {
  attack: string;
  critical: string;
  damage: string;
  key: string;
  label: string;
  mastery: string;
  range: string;
  types: string;
}

/**
 * What a sheet reads of a character's combat: its stats, its Proficiency Bonus, the attacks it makes in an Attack
 * action, the rolls it scores a critical hit on, what it carries, and its weapon sets, each with its Armor Class (its
 * component's `getCombat`).
 */
interface CombatStats {
  attacks: number;
  carrying: CarryingData;
  critical: { range: number };
  hp: { total: number };
  initiative: { total: number };
  proficiency: { total: number };
  speed: { total: number };
  weaponsets: Record<
    string,
    Record<(typeof WEAPON_SET_SLOTS)[number], SheetWeaponSource | null> & {
      ac: SheetArmorClass;
      shield: Pick<WeaponSet["shield"], "names">;
    }
  >;
}

/** A weapon as a sheet lists it: its name, whether its wielder is proficient with it, and its attacks. */
interface SheetWeapon {
  name: string;
  proficient: boolean;
  rows: AttackRow[];
}

/**
 * A weapon set as a sheet lists it: its index, stored from 0, the names of the items its hands hold (an unarmed strike
 * holds none), its Armor Class (and its box, labelled: `armorClass`), and its weapons with their attacks.
 */
interface SheetWeaponSet {
  ac: SheetArmorClass;
  armorClass: SheetStat[];
  held: string[];
  set: number;
  weapons: SheetWeapon[];
}

/** What a sheet reads of a weapon: its name, proficiency, properties, range and mastery, and its to-hit and damage. */
interface SheetWeaponSource extends Pick<
  WeaponSlot,
  "itemId" | "mastery" | "name" | "properties" | "proficient" | "range"
> {
  damage: Pick<WeaponSlot["damage"], "total" | "type">;
  tohit: Pick<WeaponSlot["tohit"], "total">;
}

/** A weapon set's Armor Class as a sheet lists it: its total. */
type SheetArmorClass = Pick<SetArmorClass, "total">;

/** A weapon slot's label, as an item's location names it. */
const SLOT_LABELS = { mainhand: "Main Hand", offhand: "Off Hand", twohanded: "Two Handed" } as const;

/**
 * A character's combat as its sheets print it, the web sheet's and the PDF's alike: its Proficiency Bonus, its speed
 * in feet, and each weapon's attacks, written as the SRD 5.2.1 writes them.
 */
export default class CombatSheet {
  /**
   * A weapon's attacks, a row each: its own (melee or ranged), then a melee weapon's thrown one if it has the Thrown
   * property, which reaches as far as its range.
   */
  private static attackRows(weapon: SheetWeaponSource, slot: string, critical: string): AttackRow[] {
    const range = weapon.range ? `${weapon.range.normal}/${weapon.range.long} ft.` : "";
    const row = (ways: string[], ranged: boolean): AttackRow => {
      const label = [slot, ...ways].join(", ");
      return {
        key: label,
        label,
        attack: formatSigned(weapon.tohit.total),
        damage: weapon.damage.total,
        critical,
        range: ranged ? range : "",
        mastery: weapon.mastery ?? "",
        types: weapon.damage.type,
      };
    };
    const thrown = weapon.properties.includes("Thrown");
    const ranged = weapon.range !== null && !thrown;
    return thrown ? [row([], false), row(["thrown"], true)] : [row([], ranged)];
  }

  /** The rolls an attack scores a critical hit on, `range` of them up to the 20: "20", "19–20", "18–20". */
  private static formatCritical(range: number): string {
    return range > 1 ? `${21 - range}–20` : "20";
  }

  /** A distance in feet as the SRD writes it: "30 ft.", "1,000 ft.". */
  private static formatFeet(feet: number): string {
    return `${feet.toLocaleString("en-US")} ft.`;
  }

  /**
   * The weapon sets, by their index: each one's Armor Class, as its values stand, the items its hands hold (its
   * weapons', an unarmed strike holding none, then its shield's), and each weapon with its attacks. A set that holds no
   * weapon (a shield alone) is a loadout all the same.
   */
  private static weaponSets(weaponsets: CombatStats["weaponsets"], critical: string): SheetWeaponSet[] {
    return Object.entries(weaponsets)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([set, slots]) => {
        const held = WEAPON_SET_SLOTS.flatMap((slot) => slots[slot] ?? []);
        return {
          set: Number(set),
          ac: { total: slots.ac.total },
          armorClass: CombatSheet.describeArmorClass(slots.ac),
          held: [...held.filter((weapon) => weapon.itemId).map((weapon) => weapon.name), ...slots.shield.names],
          weapons: WEAPON_SET_SLOTS.flatMap((slot) => {
            const weapon = slots[slot];
            if (!weapon) return [];
            const rows = CombatSheet.attackRows(weapon, SLOT_LABELS[slot], critical);
            return [{ name: weapon.name, proficient: weapon.proficient, rows }];
          }),
        };
      });
  }

  /**
   * The character's combat (`combat`, its component) as its sheets print it: its stats, its Proficiency Bonus
   * ("+2"), its speed in feet ("30 ft."), each weapon set's Armor Class and attacks (the sets themselves, as the rules
   * hold them, left out), whether the character has weapon sets (`hasWeaponSets`: an item in a set's hand, without
   * which its one loadout, its first set, striking unarmed, is shown with no set's heading), and what it carries.
   */
  static describe<C extends CombatStats & { ac: unknown }>(combat: { getCombat(): C }) {
    const { ac: _parts, weaponsets, ...stats } = combat.getCombat();
    const weaponSets = CombatSheet.weaponSets(weaponsets, CombatSheet.formatCritical(stats.critical.range));
    const proficiencyLabel = formatSigned(stats.proficiency.total);
    const speedLabel = CombatSheet.formatFeet(stats.speed.total);
    return {
      ...stats,
      proficiencyLabel,
      speedLabel,
      weaponSets,
      hasWeaponSets: weaponSets.some(({ held }) => held.length > 0),
      load: CombatSheet.describeLoad(stats.carrying),
      // Its line, in the PDF's order
      stats: [
        { label: "HP", value: String(stats.hp.total) },
        { label: "Initiative", value: formatSigned(stats.initiative.total) },
        { label: "Speed", value: speedLabel },
        { label: "Proficiency Bonus", value: proficiencyLabel },
        { label: "Attacks", value: String(stats.attacks) },
      ] satisfies SheetStat[],
    };
  }

  /** A weapon set's Armor Class in its box. */
  static describeArmorClass(ac: SheetArmorClass): SheetStat[] {
    return [{ label: "AC", value: String(ac.total) }];
  }

  /**
   * What a character carries, against what it can: its carried weight, its carrying capacity and what it can drag, lift
   * or push, each with its label and a short one for a box (`figures`, in pounds), and whether it carries more than it
   * can (`status`: its speed is then 5 feet at most; none otherwise).
   */
  static describeLoad(carrying: CarryingData) {
    const figures = [
      { label: "Carried Weight", shortLabel: "Carried", weight: carrying.carriedweight },
      { label: "Carrying Capacity", shortLabel: "Capacity", weight: carrying.capacity },
      { label: "Drag, Lift, or Push", shortLabel: "Drag/Lift", weight: carrying.draglift },
    ];
    const status = carrying.overloaded ? { label: "Over Capacity", tone: "error" as const } : null;
    return { figures, status };
  }
}
