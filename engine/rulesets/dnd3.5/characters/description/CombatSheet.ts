import type { SetArmorClass, WeaponSet, WeaponSlot } from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import AttackRules from "@/engine/rulesets/dnd3.5/rules/AttackRules.ts";
import { WEAPON_SET_SLOTS } from "@/engine/rulesets/dnd3.5/rules/InventorySlots.ts";
import { capitalize, formatSigned } from "@/shared/text.ts";
import { COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";

/**
 * How far an attack reaches, as a sheet prints it: a ranged or thrown attack's farthest range ("1,100 ft."), and its
 * penalty for each range increment past the first ("-2 / 110 ft."), empty when it reaches only one (a net's); both
 * empty in melee, or without a range increment.
 */
interface AttackRange {
  increment: string;
  range: string;
}

/**
 * One attack a sheet lists for a weapon, as the sheet prints it: its label (the slot, "thrown" and "two weapons"
 * added), to-hit, damage (a double weapon's other end's its own), critical, range, range increment and damage types.
 */
interface AttackRow extends AttackRange {
  attack: string;
  critical: string;
  damage: string;
  key: string;
  label: string;
  types: string;
}

/**
 * What a sheet reads of a character's combat: its stats, its base attack bonus, its speed and its weapon sets, each with
 * its armor class (its component's `getCombat`).
 */
interface CombatStats {
  bab: number;
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
 * holds none), its armor class, and its weapons with their attacks.
 */
interface SheetWeaponSet {
  ac: SheetArmorClass;
  held: string[];
  set: number;
  weapons: SheetWeapon[];
}

/** What a sheet reads of a weapon: its name, proficiency and kind, and its attacks' to-hit, damage, critical and range. */
interface SheetWeaponSource extends Pick<
  WeaponSlot,
  "itemId" | "maxRange" | "name" | "natural" | "offend" | "proficient" | "range" | "ranged" | "thrown" | "twoweapon"
> {
  damage: Pick<WeaponSlot["damage"], "critical" | "total" | "types">;
  tohit: Pick<WeaponSlot["tohit"], "total">;
}

/** A weapon set's armor class as a sheet lists it: AC, touch AC and flat-footed AC. */
type SheetArmorClass = Pick<SetArmorClass, "flatfooted" | "total" | "touch">;

/** The range of an attack that has none: a melee one's, or a ranged one's without a range increment. */
const NO_RANGE: AttackRange = { range: "", increment: "" };

/** A weapon slot's label, as an item's location names it. */
const SLOT_LABELS = { mainhand: "Main Hand", offhand: "Off Hand", twohanded: "Two Handed" } as const;

/**
 * A character's combat as its sheets print it, the web sheet's and the PDF's alike: its base attack bonus's attacks,
 * its speed in feet, and each weapon's attacks, written as the SRD writes them.
 */
export default class CombatSheet {
  /** A weapon set's armor class as its values stand: AC, touch AC and flat-footed AC, read once. */
  private static armorClass({ total, touch, flatfooted }: SheetArmorClass): SheetArmorClass {
    return { total, touch, flatfooted };
  }

  /**
   * A weapon's range, shot or thrown: the farthest it reaches ("1,100 ft."), and the penalty for each range increment
   * past the first, signed as the sheet signs a bonus ("-2 / 110 ft."), none when it reaches no farther than its first
   * (a net's). None without a range increment.
   */
  private static attackRange(weapon: SheetWeaponSource): AttackRange {
    if (weapon.range <= 0) return NO_RANGE;
    const penalty = formatSigned(COMBAT_RULES.RANGE_INCREMENT_PENALTY);
    return {
      range: CombatSheet.formatFeet(weapon.maxRange),
      increment: weapon.maxRange > weapon.range ? `${penalty} / ${CombatSheet.formatFeet(weapon.range)}` : "",
    };
  }

  /**
   * A weapon's attacks, a row each: its own (melee or ranged), then a melee weapon's thrown one if it has a range, then
   * the same with two weapons if its set holds one in each hand (or it's a double weapon), and a double weapon's other
   * end. A ranged or thrown row gives its range and its range increment.
   */
  private static attackRows(weapon: SheetWeaponSource, slot: string): AttackRow[] {
    const range = CombatSheet.attackRange(weapon);
    const row = (ways: string[], attack: number[], ranged: boolean, damage?: string): AttackRow => {
      const label = [slot, ...ways].join(", ");
      return {
        key: label,
        label,
        attack: CombatSheet.formatAttacks(attack),
        damage: damage ?? weapon.damage.total,
        critical: CombatSheet.formatCritical(weapon.damage.critical),
        ...(ranged ? range : NO_RANGE),
        types: weapon.damage.types.join(", "),
      };
    };

    const rows = [row([], weapon.tohit.total, weapon.ranged)];
    if (weapon.thrown) rows.push(row(["thrown"], weapon.thrown.total, true));
    if (weapon.twoweapon) {
      const { damage, thrown, total } = weapon.twoweapon;
      rows.push(row(["two weapons"], total, weapon.ranged, damage || undefined));
      if (thrown) rows.push(row(["thrown", "two weapons"], thrown, true));
    }
    if (weapon.offend) rows.push(row(["other end"], weapon.offend.total, weapon.ranged, weapon.offend.damage));
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

  /** A distance in feet as the SRD writes it: "30 ft.", "1,000 ft.". */
  private static formatFeet(feet: number): string {
    return `${feet.toLocaleString("en-US")} ft.`;
  }

  /** The label a sheet gives a weapon: its slot's, or a natural attack's kind ("Primary", "Secondary"), whatever slot holds it. */
  private static slotLabel(weapon: SheetWeaponSource, slot: keyof typeof SLOT_LABELS): string {
    return weapon.natural ? capitalize(weapon.natural) : SLOT_LABELS[slot];
  }

  /**
   * The weapon sets, by their index: each one's armor class, as its values stand, the items its hands hold (its
   * weapons', a natural attack and an unarmed strike holding none, then its shield's), and each weapon with its
   * attacks. A set that holds no weapon (a shield alone) is a loadout all the same.
   */
  private static weaponSets(weaponsets: CombatStats["weaponsets"]): SheetWeaponSet[] {
    return Object.entries(weaponsets)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([set, slots]) => {
        const held = WEAPON_SET_SLOTS.flatMap((slot) => slots[slot] ?? []);
        return {
          set: Number(set),
          ac: CombatSheet.armorClass(slots.ac),
          held: [...held.filter((weapon) => weapon.itemId).map((weapon) => weapon.name), ...slots.shield.names],
          weapons: WEAPON_SET_SLOTS.flatMap((slot) => {
            const weapon = slots[slot];
            if (!weapon) return [];
            const rows = CombatSheet.attackRows(weapon, CombatSheet.slotLabel(weapon, slot));
            return [{ name: weapon.name, proficient: weapon.proficient, rows }];
          }),
        };
      });
  }

  /**
   * The character's combat (`combat`, its component) as its sheets print it: its stats, its base attack bonus's
   * attacks a round ("+11/+6/+1"), its speed in feet ("30 ft."), each weapon set's armor class and attacks (the sets
   * themselves, as the rules hold them, left out, and the armor class's parts, which no sheet breaks down), and whether
   * the character has weapon sets (`hasWeaponSets`): an item in a set's hand, without which its one loadout, its first
   * set, striking unarmed, is shown with no set's heading.
   */
  static describe<C extends CombatStats & { ac: unknown }>(combat: { getCombat(): C }) {
    const { ac: _parts, weaponsets, ...stats } = combat.getCombat();
    const weaponSets = CombatSheet.weaponSets(weaponsets);
    return {
      ...stats,
      babLabel: CombatSheet.formatBab(stats.bab),
      speedLabel: CombatSheet.formatFeet(stats.speed.total),
      weaponSets,
      hasWeaponSets: weaponSets.some(({ held }) => held.length > 0),
    };
  }

  /**
   * A base attack bonus as the sheets and a class's table write it: its attacks a round, signed and joined ("+6/+1").
   */
  static formatBab(bab: number): string {
    return CombatSheet.formatAttacks(AttackRules.listIterativeAttacks(bab));
  }
}
