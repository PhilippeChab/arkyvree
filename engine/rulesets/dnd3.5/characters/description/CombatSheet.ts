import type { WeaponSlot } from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import { WEAPON_SET_SLOTS } from "@/engine/rulesets/dnd3.5/model/inventory/InventorySlots.ts";
import { capitalize, formatSigned } from "@/shared/text.ts";

/**
 * One attack a sheet lists for a weapon, as the sheet prints it: its label (the slot, "thrown" and "two weapons"
 * added), to-hit, damage (a double weapon's other end's its own), critical, range and damage types.
 */
interface AttackRow {
  attack: string;
  critical: string;
  damage: string;
  key: string;
  label: string;
  range: string;
  types: string;
}

/** What a sheet reads of a character's combat: its stats, its speed and its weapon sets (its component's `getCombat`). */
interface CombatStats {
  speed: { total: number };
  weaponsets: Record<string, Record<(typeof WEAPON_SET_SLOTS)[number], SheetWeaponSource | null>>;
}

/** A weapon as a sheet lists it: its name, whether its wielder is proficient with it, and its attacks. */
interface SheetWeapon {
  name: string;
  proficient: boolean;
  rows: AttackRow[];
}

/** A weapon set as a sheet lists it: its index, stored from 0, and the weapons it holds. */
interface SheetWeaponSet {
  set: number;
  weapons: SheetWeapon[];
}

/** What a sheet reads of a weapon: its name, proficiency and kind, and its attacks' to-hit, damage, critical and range. */
interface SheetWeaponSource extends Pick<
  WeaponSlot,
  "name" | "natural" | "offend" | "proficient" | "range" | "ranged" | "thrown" | "twoweapon"
> {
  damage: Pick<WeaponSlot["damage"], "critical" | "total" | "types">;
  tohit: Pick<WeaponSlot["tohit"], "total">;
}

/** A weapon slot's label, as an item's location names it. */
const SLOT_LABELS = { mainhand: "Main Hand", offhand: "Off Hand", twohanded: "Two Handed" } as const;

/**
 * A character's combat as its sheets print it, the web sheet's and the PDF's alike: its base attack bonus's attacks,
 * its speed in feet, and each weapon's attacks, written as the SRD writes them.
 */
export default class CombatSheet {
  /**
   * A weapon's attacks, a row each: its own (melee or ranged), then a melee weapon's thrown one if it has a range, then
   * the same with two weapons if its set holds one in each hand (or it's a double weapon), and a double weapon's other
   * end.
   */
  private static attackRows(weapon: SheetWeaponSource, slot: string): AttackRow[] {
    const ownRange = weapon.ranged ? `${weapon.range} ft.` : "Melee";
    const thrownRange = `${weapon.range} ft.`;
    const row = (ways: string[], attack: number[], range: string, damage?: string): AttackRow => {
      const label = [slot, ...ways].join(", ");
      return {
        key: label,
        label,
        attack: CombatSheet.formatAttacks(attack),
        damage: damage ?? weapon.damage.total,
        critical: CombatSheet.formatCritical(weapon.damage.critical),
        range,
        types: weapon.damage.types.join(", "),
      };
    };

    const rows = [row([], weapon.tohit.total, ownRange)];
    if (weapon.thrown) rows.push(row(["thrown"], weapon.thrown.total, thrownRange));
    if (weapon.twoweapon) {
      const { damage, thrown, total } = weapon.twoweapon;
      rows.push(row(["two weapons"], total, ownRange, damage || undefined));
      if (thrown) rows.push(row(["thrown", "two weapons"], thrown, thrownRange));
    }
    if (weapon.offend) rows.push(row(["other end"], weapon.offend.total, ownRange, weapon.offend.damage));
    return rows;
  }

  /** An attack's to-hit, its iterative attacks signed and joined ("+9/+4"); "—" for none. */
  private static formatAttacks(attack: number[]): string {
    if (attack.length === 0) return "—";
    return attack.map((bonus) => formatSigned(bonus)).join("/");
  }

  /**
   * A weapon's critical as the SRD writes it: its multiplier alone for a threat on a 20 ("×3"), else its threat range
   * before it ("19–20/×2"). `range` is how many rolls threaten, the 20 and those under it.
   */
  private static formatCritical(critical: WeaponSlot["damage"]["critical"]): string {
    const multiplier = `×${critical.multiplier}`;
    return critical.range > 1 ? `${21 - critical.range}–20/${multiplier}` : multiplier;
  }

  /** The label a sheet gives a weapon: its slot's, or a natural attack's kind ("Primary", "Secondary"), whatever slot holds it. */
  private static slotLabel(weapon: SheetWeaponSource, slot: keyof typeof SLOT_LABELS): string {
    return weapon.natural ? capitalize(weapon.natural) : SLOT_LABELS[slot];
  }

  /** The weapon sets that hold a weapon, by their index, each weapon with its attacks. */
  private static weaponSets(weaponsets: CombatStats["weaponsets"]): SheetWeaponSet[] {
    return Object.entries(weaponsets)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([set, slots]) => ({
        set: Number(set),
        weapons: WEAPON_SET_SLOTS.flatMap((slot) => {
          const weapon = slots[slot];
          if (!weapon) return [];
          const rows = CombatSheet.attackRows(weapon, CombatSheet.slotLabel(weapon, slot));
          return [{ name: weapon.name, proficient: weapon.proficient, rows }];
        }),
      }))
      .filter(({ weapons }) => weapons.length > 0);
  }

  /**
   * The character's combat (`combat`, its component) as its sheets print it: its stats, its base attack bonus's
   * attacks a round ("+11/+6/+1"), its speed in feet ("30 ft."), and its weapon sets' attacks (the sets themselves, as
   * the rules hold them, left out).
   */
  static describe<C extends CombatStats>(combat: { getBabAttacks(): number[]; getCombat(): C }) {
    const { weaponsets, ...stats } = combat.getCombat();
    return {
      ...stats,
      babLabel: CombatSheet.formatAttacks(combat.getBabAttacks()),
      speedLabel: `${stats.speed.total} ft.`,
      weaponSets: CombatSheet.weaponSets(weaponsets),
    };
  }
}
