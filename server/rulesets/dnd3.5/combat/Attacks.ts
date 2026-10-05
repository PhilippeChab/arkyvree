import type { Constructor } from "@/server/mixins.ts";
import { CONSTANTS, SIZE_AC_ATTACK_MOD, SIZE_GRAPPLE_MOD, SIZE_STEPS } from "@/server/rulesets/constants.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import {
  type NaturalAttackKind,
  SLOT_MAP,
  type WeaponAbilities,
  type WeaponSlot,
} from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import type { WeaponProperty } from "@/server/rulesets/dnd3.5/types.ts";
import { SIZE_ORDER, WEAPON_SET_SLOTS } from "@/server/rulesets/properties/index.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import {
  DAMAGE_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FINESSABLE,
  WEAPON_MIGHTY,
  WEAPON_ONE_HANDED_PENALTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
} from "@/shared/dnd3.5/properties/index.ts";
import { type Item } from "@/shared/relations.ts";

// D&D 3.5 damage die progression for size adjustments.
// All weapon/unarmed damages are defined for Medium size; shift up for Large, down for Small, etc.
const DAMAGE_PROGRESSION = [
  "1",
  "1d2",
  "1d3",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "2d6",
  "2d8",
  "2d10",
  "3d6",
  "3d8",
  "4d6",
  "4d8",
];

/**
 * The share of its Strength bonus a weapon adds to damage in each slot: all of it, half, or one and a half (a light
 * weapon's all of it in two hands).
 */
const SLOT_STRENGTH_MULTIPLIERS: Record<string, number> = { "Main Hand": 1, "Off Hand": 0.5, "Two Handed": 1.5 };

/** A natural attack's proficiency: its damage dice are the creature's own, from its stat block, already at its size. */
const NATURAL_PROFICIENCY = "Natural";

function iterativeAttacks(bab: number): number[] {
  const attacks: number[] = [];
  for (let bonus = bab; bonus > 0; bonus -= CONSTANTS.ATTACK_STEP) {
    attacks.push(bonus);
  }
  return attacks.length > 0 ? attacks : [bab];
}

function formatDamageTotal(damage: WeaponSlot["damage"]): string {
  const totalBonus = damage.strength + damage.magic + damage.misc;
  const others = damage.others.length > 0 ? ` ${damage.others.join(" ")}` : "";

  if (totalBonus < 0) return `${damage.base} - ${Math.abs(totalBonus)}${others}`;
  if (totalBonus > 0) return `${damage.base} + ${totalBonus}${others}`;
  return `${damage.base}${others}`;
}

function adjustDamageForSize(baseDamage: string, size: string): string {
  const step = SIZE_STEPS[size] ?? 0;
  if (step === 0) return baseDamage;

  const index = DAMAGE_PROGRESSION.indexOf(baseDamage);
  if (index === -1) return baseDamage;

  const adjusted = Math.max(0, Math.min(DAMAGE_PROGRESSION.length - 1, index + step));
  return DAMAGE_PROGRESSION[adjusted];
}

/**
 * What the hand holding a weapon makes of it: whether it's light (Tiny or Small by the weapon table, written for
 * Medium: every weapon is sized for its wielder, its damage too), its share of the Strength bonus to damage (melee and
 * thrown weapons, slings), a light weapon's whole one in two hands, and a crossbow's penalty in one hand, which it
 * takes two to load.
 */
function handTraits(
  slot: "Main Hand" | "Off Hand" | "Two Handed",
  property: (type: string) => WeaponProperty | undefined,
): { light: boolean; share: number; penalty: number } {
  const light = (SIZE_ORDER[property(WEAPON_SIZE)?.value ?? ""] ?? Infinity) < SIZE_ORDER.Medium;
  const share =
    slot === "Two Handed" && light ? SLOT_STRENGTH_MULTIPLIERS["Main Hand"] : SLOT_STRENGTH_MULTIPLIERS[slot];
  const penalty = slot === "Two Handed" ? 0 : Number(property(WEAPON_ONE_HANDED_PENALTY)?.value ?? 0);
  return { light, share, penalty };
}

/** A character's attacks: its base attack bonus, grapple, and each weapon's to-hit and damage. */
export function Attacks<B extends Constructor<CombatState>>(Base: B) {
  abstract class WithAttacks extends Base {
    protected initializeBaseAttackBonus(
      classes: ReturnType<DetailedCharacterClasses["getClasses"]>,
      klassLevelProperties: Map<string, { bab: number; skills: number }>,
    ): void {
      const baseAttackBonusFromClasses = Object.values(classes).reduce((acc, klass) => {
        const lastLevel = klass.levels.at(-1);
        if (!lastLevel) return acc;
        return acc + (klassLevelProperties.get(lastLevel.klassLevel.id)?.bab ?? 0);
      }, 0);

      this.detailedCharacterCombat.bab = baseAttackBonusFromClasses;
    }

    /** The grapple: misc is an input; the base attack bonus's, Strength's and the size's parts and the total are read. */
    protected initializeGrapple(): void {
      const combat = this.detailedCharacterCombat;
      const strength = () => this.characterAbilities.getAbilityModifier("Strength");
      const size = () => SIZE_GRAPPLE_MOD[this.raceSize] ?? 0;
      combat.grapple = {
        get bab() {
          return combat.bab;
        },
        get strength() {
          return strength();
        },
        get size() {
          return size();
        },
        misc: 0,
        get total() {
          return this.bab + this.strength + this.size + this.misc;
        },
      };
    }

    /**
     * How a weapon's attack and damage follow the abilities: the SRD's attack rolls, Strength on a melee weapon's and
     * Dexterity on a ranged weapon's, and a bow's Strength rating (its WEAPON_MIGHTY) when Strength adds to its damage
     * by it.
     */
    private abilitiesOf(ranged: boolean, strengthDamage: string, mighty: WeaponProperty | undefined): WeaponAbilities {
      return {
        attack: ranged ? "Dexterity" : "Strength",
        finesse: false,
        strengthRating: strengthDamage === "Rating" ? Number(mighty?.value ?? 0) : null,
        ratingRequired: strengthDamage === "Rating" && mighty !== undefined,
      };
    }

    /**
     * What abilities give a weapon's attack: its ability's modifier, or Dexterity's less a carried shield's check penalty
     * when Weapon Finesse makes that better. A composite bow drawn with a Strength bonus below its rating takes −2.
     */
    private attackModifier({ attack, finesse, strengthRating, ratingRequired }: WeaponAbilities): number {
      const abilities = this.characterAbilities;
      let modifier = abilities.getAbilityModifier(attack);
      if (finesse) {
        modifier = Math.max(modifier, abilities.getAbilityModifier("Dexterity") + this.shieldCheckPenalty());
      }
      if (ratingRequired && abilities.getAbilityModifier("Strength") < (strengthRating ?? 0)) {
        modifier += CONSTANTS.COMPOSITE_BOW_PENALTY;
      }
      return modifier;
    }

    /** The weapon set, created if missing, with the slots the weapon displaces emptied. */
    private clearSlots(setKey: string, slot: "Main Hand" | "Off Hand" | "Two Handed") {
      if (!this.detailedCharacterCombat.weaponsets[setKey]) {
        this.detailedCharacterCombat.weaponsets[setKey] = { mainhand: null, offhand: null, twohanded: null };
      }
      // Two-handed weapons displace main-hand and off-hand (e.g. unarmed strike default)
      if (slot === "Two Handed") {
        this.detailedCharacterCombat.weaponsets[setKey].mainhand = null;
        this.detailedCharacterCombat.weaponsets[setKey].offhand = null;
      } else {
        this.detailedCharacterCombat.weaponsets[setKey].twohanded = null;
      }
    }

    /**
     * What the gear costs every attack: the armor check penalty of each armor and shield worn without proficiency,
     * and a tower shield's bulk.
     */
    private gearPenalty(): number {
      const { armors, shields } = this.detailedCharacterCombat;
      const gear = new Set([...Object.values(armors), ...Object.values(shields)]);
      const unproficient = [...gear].reduce((penalty, item) => penalty + (item.proficient ? 0 : item.checkpenalty), 0);
      return unproficient + (this.towerShield ? CONSTANTS.TOWER_SHIELD_PENALTY : 0);
    }

    /**
     * A natural weapon's attacks: one at the base attack bonus, whatever it is, and when it's the creature's primary one
     * (`repeats`), the extra ones `combat.naturalattacks.extraattacks` counts, each at −5.
     */
    private naturalAttacks(repeats: boolean): number[] {
      const { bab, naturalattacks } = this.detailedCharacterCombat;
      const extra = repeats ? Math.max(0, naturalattacks.extraattacks) : 0;
      return [bab, ...Array.from({ length: extra }, () => bab - CONSTANTS.ATTACK_STEP)];
    }

    /**
     * A double weapon's other end, when it's held in two hands: its attacks as a light off-hand weapon's (two-weapon
     * fighting's off-hand penalty lessened by 2, its first and the extra ones `offhandattacks` counts, each 5 lower), and
     * its damage: its own dice, sized for its wielder, with half the Strength bonus and the weapon's magic and misc.
     */
    private offEndAttack(weapon: WeaponSlot, setKey: string): WeaponSlot["offend"] {
      const otherDice = this.doubleWeapons.get(weapon);
      if (!otherDice || this.detailedCharacterCombat.weaponsets[setKey]?.twohanded !== weapon) return null;
      const { twoweapon } = this.detailedCharacterCombat;
      const first = weapon.tohit.total[0] + twoweapon.offhandpenalty + CONSTANTS.LIGHT_OFF_HAND_BONUS;
      const total = Array.from(
        { length: Math.max(1, twoweapon.offhandattacks) },
        (_, index) => first - index * CONSTANTS.ATTACK_STEP,
      );
      const base = adjustDamageForSize(otherDice, this.raceSize);
      return { total, damage: formatDamageTotal({ ...weapon.damage, base, strength: this.strengthDamage(0.5, null) }) };
    }

    /**
     * The armor check penalty of the shields the character carries, which a finessed attack takes: of those it's
     * proficient with, another's costing every attack already (`gearPenalty`).
     */
    private shieldCheckPenalty(): number {
      const shields = new Set(Object.values(this.detailedCharacterCombat.shields));
      return [...shields].reduce((penalty, shield) => penalty + (shield.proficient ? shield.checkpenalty : 0), 0);
    }

    /**
     * A weapon's Strength to damage: its slot's share of a bonus and a penalty in full, or a penalty and a bonus up to
     * its rating (a bow's). A weapon whose WEAPON_STRENGTH_DAMAGE is "None" (a crossbow) adds none.
     */
    private strengthDamage(multiplier: number | null, strengthRating: number | null): number {
      const strength = this.characterAbilities.getAbilityModifier("Strength");
      // The SRD halves or raises a Strength bonus by the hand, never a penalty
      if (multiplier !== null) return strength < 0 && multiplier > 0 ? strength : Math.floor(strength * multiplier);
      if (strengthRating !== null) return strength < 0 ? strength : Math.min(strength, strengthRating);
      return 0;
    }

    /** A melee weapon's thrown attack: Dexterity to hit, as every ranged attack, with the weapon's own bonuses. */
    private thrownAttack(weapon: WeaponSlot): NonNullable<WeaponSlot["thrown"]> {
      const dexterity = this.characterAbilities.getAbilityModifier("Dexterity");
      const { tohit } = weapon;
      const throwing = this.detailedCharacterCombat.throwing.tohit;
      const bonuses = dexterity + tohit.magic + tohit.misc + tohit.size + tohit.gearpenalty + throwing;
      return { dexterity, total: iterativeAttacks(this.detailedCharacterCombat.bab).map((base) => base + bonuses) };
    }

    /**
     * A hand's attacks when the weapon's set holds an equipped weapon in each (not an unarmed strike or a natural
     * attack): the main hand's own, the off hand's first and the extra ones `offhandattacks` counts, each lower by an
     * attack step, all with the hand's two-weapon penalty, which a light off-hand weapon lessens.
     */
    private twoWeaponAttacks(weapon: WeaponSlot, setKey: string): WeaponSlot["twoweapon"] {
      const { mainhand, offhand, twohanded } = this.detailedCharacterCombat.weaponsets[setKey] ?? {};
      const { twoweapon } = this.detailedCharacterCombat;
      // A double weapon in two hands fights as two weapons, its other end a light off-hand one (`offEndAttack`)
      if (weapon === twohanded && this.doubleWeapons.has(weapon)) {
        const penalty = twoweapon.mainhandpenalty + CONSTANTS.LIGHT_OFF_HAND_BONUS;
        const damage = formatDamageTotal({ ...weapon.damage, strength: this.strengthDamage(1, null) });
        return { total: weapon.tohit.total.map((attack) => attack + penalty), thrown: null, damage };
      }
      if (!mainhand?.itemId || !offhand?.itemId || (weapon !== mainhand && weapon !== offhand)) return null;

      // A light off-hand weapon lessens both penalties, and so does a one-handed one with Oversized Two-Weapon Fighting
      const lightBonus = offhand.light || this.oversizedOffHand ? CONSTANTS.LIGHT_OFF_HAND_BONUS : 0;
      const attacks =
        weapon === mainhand
          ? (totals: number[]) => totals.map((attack) => attack + twoweapon.mainhandpenalty + lightBonus)
          : (totals: number[]) =>
              Array.from(
                { length: Math.max(1, twoweapon.offhandattacks) },
                (_, index) => totals[0] + twoweapon.offhandpenalty + lightBonus - index * CONSTANTS.ATTACK_STEP,
              );
      const thrown = weapon.thrown;
      return { total: attacks(weapon.tohit.total), thrown: thrown ? attacks(thrown.total) : null };
    }

    /**
     * A weapon's damage: its dice (an input, which a modifier's `set` replaces; `dice` reads them sized for the wielder),
     * the Strength its hand or its kind adds (`strmultiplier`, an input), its magic and misc bonuses, and its critical.
     */
    private weaponDamage(
      properties: WeaponProperty[],
      dice: { read: () => string; write: (value: string) => void },
      strmultiplier: number | null,
      strengthRating: number | null,
    ): WeaponSlot["damage"] {
      const property = (type: string) => properties.find((p) => p.type === type);
      const strengthDamage = (multiplier: number | null) => this.strengthDamage(multiplier, strengthRating);
      return {
        get base() {
          return dice.read();
        },
        set base(value: string) {
          dice.write(value);
        },
        get strength() {
          return strengthDamage(this.strmultiplier);
        },
        magic: 0,
        misc: 0,
        others: [],
        get total() {
          return formatDamageTotal(this);
        },
        types: properties.filter((p) => p.type === DAMAGE_TYPE).map((p) => p.value),
        strmultiplier,
        critical: {
          range: Number(property(WEAPON_CRITICAL_RANGE)?.value ?? 1),
          multiplier: Number(property(WEAPON_CRITICAL_MULTIPLIER)?.value ?? 1),
        },
      };
    }

    /** Lets a one-handed off-hand weapon count as light, for a feat with FEAT_OVERSIZED_TWO_WEAPON_FIGHTING. */
    applyOversizedTwoWeaponFighting(hasOversized: boolean): void {
      this.oversizedOffHand = hasOversized;
    }

    /**
     * Costs each weapon the character isn't proficient with the non-proficiency penalty, 4 to hit and nothing else, by
     * the entry holding it (a bastard sword can be proficient in two hands, not in one), and marks the armor and shields
     * it isn't proficient with, whose check penalty every attack takes.
     */
    applyProficiencyPenalties(unproficient: { id: string; itemId: string }[]) {
      const { weaponsets, armors, shields } = this.detailedCharacterCombat;
      const entryIds = new Set(unproficient.map((entry) => entry.id));
      const itemIds = new Set(unproficient.map((entry) => entry.itemId));
      for (const weaponSet of Object.values(weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon?.entryId || !entryIds.has(weapon.entryId)) continue;

          weapon.proficient = false;
          weapon.tohit.misc += CONSTANTS.NONPROFICIENCY_PENALTY;
        }
      }
      for (const gear of [...Object.values(armors), ...Object.values(shields)]) {
        if (itemIds.has(gear.itemId)) gear.proficient = false;
      }
    }

    /** Lets each finessable weapon that attacks with Strength attack with Dexterity, for a feat with FEAT_WEAPON_FINESSE. */
    applyWeaponFinesse(hasFinesse: boolean): void {
      if (!hasFinesse) return;

      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon?.finessable) continue;
          const abilities = this.weaponAbilities.get(weapon);
          if (abilities?.attack === "Strength") abilities.finesse = true;
        }
      }
    }

    /**
     * A weapon in a hand of a set. Its inputs (the magic and misc bonuses, the dice, the hand's Strength share, the
     * critical) are what modifiers change; what comes from the abilities, the size, the gear and the set is computed
     * when read: the to-hit's ability, size, gear and secondary parts and totals, the thrown and two-weapon attacks, the
     * Strength to damage, and the dice sized for the wielder (a natural attack's are already the creature's own, its
     * stat block's). A natural attack (`natural`) attacks once, with the extra ones of the primary that `repeats`.
     */
    addWeapon(
      setIndex: number,
      slot: "Main Hand" | "Off Hand" | "Two Handed",
      item: Pick<Item, "name">,
      properties: WeaponProperty[],
      held: { itemId: string; entryId: string } | null = null,
      natural: { kind: NaturalAttackKind; repeats: boolean } | null = null,
    ): WeaponSlot | null {
      const property = (type: string) => properties.find((p) => p.type === type);
      const proficiency = property(WEAPON_PROFICIENCY)?.value;
      if (!proficiency) return null;
      const ranged = properties.some((p) => p.type === WEAPON_RANGED && p.value === "true");
      const { light, share: handShare, penalty: handPenalty } = handTraits(slot, property);
      // Strength adds to damage by the slot's share unless the weapon says otherwise: a bow's rating, a crossbow's none
      const strengthDamage = property(WEAPON_STRENGTH_DAMAGE)?.value ?? "Slot";
      const abilities = this.abilitiesOf(ranged, strengthDamage, property(WEAPON_MIGHTY));
      let dice = property(WEAPON_BASE_DAMAGE)?.value ?? "unknown";
      const sizedDice = proficiency !== NATURAL_PROFICIENCY;

      const slotKey = SLOT_MAP[slot];
      const setKey = String(setIndex);
      this.clearSlots(setKey, slot);
      // What the weapon reads of the character, when read
      const sheet = {
        attackModifier: () => this.attackModifier(abilities),
        size: () => SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0,
        gearPenalty: () => this.gearPenalty() + handPenalty,
        // What only some weapons take: a secondary natural attack's penalty, and a thrown weapon's or a sling's bonus (a
        // ranged weapon Strength adds to by the hand, not a bow or a crossbow)
        kindBonus: () =>
          (natural?.kind === "secondary" ? this.detailedCharacterCombat.naturalattacks.secondarypenalty : 0) +
          (ranged && strengthDamage === "Slot" ? this.detailedCharacterCombat.throwing.tohit : 0),
        attacks: () =>
          natural ? this.naturalAttacks(natural.repeats) : iterativeAttacks(this.detailedCharacterCombat.bab),
        thrown: (weapon: WeaponSlot) => (!ranged && weapon.range > 0 ? this.thrownAttack(weapon) : null),
        twoWeapon: (weapon: WeaponSlot) => this.twoWeaponAttacks(weapon, setKey),
        offEnd: (weapon: WeaponSlot) => this.offEndAttack(weapon, setKey),
        dice: () => (sizedDice ? adjustDamageForSize(dice, this.raceSize) : dice),
      };
      const weapon: WeaponSlot = {
        name: item.name,
        itemId: held?.itemId ?? null,
        entryId: held?.entryId ?? null,
        natural: natural?.kind ?? null,
        proficient: true,
        finessable: properties.some((p) => p.type === WEAPON_FINESSABLE && p.value === "true"),
        light,
        ranged,
        range: Number(property(WEAPON_RANGE)?.value ?? 0),
        reach: Number(property(WEAPON_REACH)?.value ?? 0),
        wielded: slotKey,
        tohit: {
          get strength() {
            return sheet.attackModifier();
          },
          magic: 0,
          misc: 0,
          get size() {
            return sheet.size();
          },
          get gearpenalty() {
            return sheet.gearPenalty();
          },
          get total() {
            const bonuses = this.strength + this.magic + this.misc + this.size + this.gearpenalty + sheet.kindBonus();
            return sheet.attacks().map((base) => base + bonuses);
          },
        },
        get thrown() {
          return sheet.thrown(this);
        },
        get twoweapon() {
          return sheet.twoWeapon(this);
        },
        get offend() {
          return sheet.offEnd(this);
        },
        damage: this.weaponDamage(
          properties,
          {
            read: sheet.dice,
            write: (value) => {
              dice = value;
            },
          },
          strengthDamage === "Slot" ? (handShare ?? null) : null,
          abilities.strengthRating,
        ),
      };
      this.weaponAbilities.set(weapon, abilities);
      const otherDice = property(WEAPON_DOUBLE_DAMAGE)?.value;
      if (otherDice) this.doubleWeapons.set(weapon, otherDice);
      this.detailedCharacterCombat.weaponsets[setKey][slotKey] = weapon;
      return weapon;
    }

    /**
     * Replace the default Unarmed Strike with the bonded creature's natural attacks, by its stat block. Each becomes a
     * weapon entry, two to a set (its main and off hand only hold them: "Two Handed" would clear both), primary or
     * secondary as the stat block has it: a primary one adds its whole Strength bonus to damage, one and a half when
     * it's the creature's only attack, a secondary one half. The first primary is the one an extra attack repeats.
     */
    setNaturalAttacks(
      attacks: { name: string; damage: string; type: string; count?: number; secondary?: true; misc?: number }[],
    ): void {
      const combat = this.detailedCharacterCombat;
      combat.weaponsets = {};
      const count = attacks.reduce((sum, attack) => sum + (attack.count ?? 1), 0);
      combat.naturalattacks = { ...combat.naturalattacks, count };
      if (attacks.length === 0) return;
      const primary = attacks.find((attack) => !attack.secondary);

      const slots: ("Main Hand" | "Off Hand")[] = ["Main Hand", "Off Hand"];
      for (let idx = 0; idx < attacks.length; idx++) {
        const attack = attacks[idx];
        const setIndex = Math.floor(idx / slots.length);
        const slot = slots[idx % slots.length];
        const displayName = attack.count && attack.count > 1 ? `${attack.name} (x${attack.count})` : attack.name;
        const props: WeaponProperty[] = [
          { type: WEAPON_PROFICIENCY, value: NATURAL_PROFICIENCY },
          { type: WEAPON_BASE_DAMAGE, value: attack.damage },
          { type: DAMAGE_TYPE, value: attack.type },
          { type: WEAPON_CRITICAL_RANGE, value: "1" },
          { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
          { type: WEAPON_FINESSABLE, value: "true" },
        ];
        const kind = attack.secondary ? "secondary" : "primary";
        const weapon = this.addWeapon(setIndex, slot, { name: displayName }, props, null, {
          kind,
          repeats: attack === primary,
        });
        if (!weapon) continue;
        weapon.damage.strmultiplier = attack.secondary ? 0.5 : count === 1 ? 1.5 : 1;
        weapon.tohit.misc += attack.misc ?? 0;
      }
    }
  }
  return WithAttacks;
}
