import type { Constructor } from "@/server/mixins.ts";
import { CONSTANTS, SIZE_AC_ATTACK_MOD, SIZE_GRAPPLE_MOD, SIZE_STEPS } from "@/server/rulesets/constants.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import {
  SLOT_MAP,
  type WeaponAbilities,
  type WeaponSet,
  type WeaponSlot,
} from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import {
  DAMAGE_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FINESSABLE,
  WEAPON_MIGHTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { WeaponProperty } from "@/server/rulesets/dnd3.5/types.ts";
import { SIZE_ORDER, WEAPON_SET_SLOTS } from "@/server/rulesets/properties/index.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
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

function iterativeAttacks(bab: number): number[] {
  const attacks: number[] = [];
  for (let bonus = bab; bonus > 0; bonus -= CONSTANTS.ATTACK_STEP) {
    attacks.push(bonus);
  }
  return attacks.length > 0 ? attacks : [bab];
}

function formatDamageTotal(weapon: WeaponSlot): string {
  const totalBonus = weapon.damage.strength + weapon.damage.magic + weapon.damage.misc;
  const others = weapon.damage.others.length > 0 ? ` ${weapon.damage.others.join(" ")}` : "";

  if (totalBonus < 0) return `${weapon.damage.base} - ${Math.abs(totalBonus)}${others}`;
  if (totalBonus > 0) return `${weapon.damage.base} + ${totalBonus}${others}`;
  return `${weapon.damage.base}${others}`;
}

function adjustDamageForSize(baseDamage: string, size: string): string {
  const step = SIZE_STEPS[size] ?? 0;
  if (step === 0) return baseDamage;

  const index = DAMAGE_PROGRESSION.indexOf(baseDamage);
  if (index === -1) return baseDamage;

  const adjusted = Math.max(0, Math.min(DAMAGE_PROGRESSION.length - 1, index + step));
  return DAMAGE_PROGRESSION[adjusted];
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

    protected updateGrappleTotal() {
      const g = this.detailedCharacterCombat.grapple;
      g.bab = this.detailedCharacterCombat.bab;
      g.strength = this.characterAbilities.getAbilityModifier("Strength");
      g.size = SIZE_GRAPPLE_MOD[this.raceSize] ?? 0;
      g.total = g.bab + g.strength + g.size + g.misc;
    }

    /**
     * A weapon's Strength to damage: its slot's share of a bonus and a penalty in full, or a penalty and a bonus up to
     * its rating (a bow's). A weapon whose WEAPON_STRENGTH_DAMAGE is "None" (a crossbow) adds none.
     */
    private updateStrengthDamage(weapon: WeaponSlot, strengthRating: number | null) {
      const strength = this.characterAbilities.getAbilityModifier("Strength");
      const multiplier = weapon.damage.strmultiplier;
      if (multiplier !== null) {
        // The SRD halves or raises a Strength bonus by the hand, never a penalty
        weapon.damage.strength = strength < 0 && multiplier > 0 ? strength : Math.floor(strength * multiplier);
      } else if (strengthRating !== null) {
        weapon.damage.strength = strength < 0 ? strength : Math.min(strength, strengthRating);
      }
    }

    /**
     * Each hand's attacks when the set holds an equipped weapon in each (not an unarmed strike or a natural attack): the
     * main hand's own, the off hand's first and the extra ones `offhandattacks` counts, each lower by an attack step, all
     * with the hand's two-weapon penalty, which a light off-hand weapon lessens.
     */
    private updateTwoWeaponAttacks({ mainhand, offhand }: WeaponSet) {
      if (!mainhand?.itemId || !offhand?.itemId) {
        if (mainhand) mainhand.twoweapon = null;
        if (offhand) offhand.twoweapon = null;
        return;
      }

      const { twoweapon } = this.detailedCharacterCombat;
      const lightBonus = offhand.light ? CONSTANTS.LIGHT_OFF_HAND_BONUS : 0;
      const mainHandAttacks = (attacks: number[]) => attacks.map((attack) => attack + twoweapon.mainhand + lightBonus);
      const offHandAttacks = (attacks: number[]) =>
        Array.from(
          { length: Math.max(1, twoweapon.offhandattacks) },
          (_, index) => attacks[0] + twoweapon.offhand + lightBonus - index * CONSTANTS.ATTACK_STEP,
        );

      mainhand.twoweapon = {
        total: mainHandAttacks(mainhand.tohit.total),
        thrown: mainhand.thrown ? mainHandAttacks(mainhand.thrown.total) : null,
      };
      offhand.twoweapon = {
        total: offHandAttacks(offhand.tohit.total),
        thrown: offhand.thrown ? offHandAttacks(offhand.thrown.total) : null,
      };
    }

    /** A weapon's to-hit and damage, from the character's abilities as they stand. */
    private updateWeaponTotal(weapon: WeaponSlot) {
      const abilities = this.weaponAbilities.get(weapon);
      if (abilities) {
        weapon.tohit.strength = this.attackModifier(abilities);
        this.updateStrengthDamage(weapon, abilities.strengthRating);
      }

      weapon.tohit.size = SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
      const tohitBonuses = weapon.tohit.strength + weapon.tohit.magic + weapon.tohit.misc + weapon.tohit.size;
      weapon.tohit.total = iterativeAttacks(this.detailedCharacterCombat.bab).map((base) => base + tohitBonuses);
      weapon.thrown = !weapon.ranged && weapon.range > 0 ? this.thrownAttack(weapon) : null;

      weapon.damage.total = formatDamageTotal(weapon);
    }

    protected updateWeaponsTotal() {
      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (weapon) this.updateWeaponTotal(weapon);
        }
        this.updateTwoWeaponAttacks(weaponSet);
      }
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

    /** The armor check penalty of the shields the character carries, which a finessed attack takes. */
    private shieldCheckPenalty(): number {
      const shields = new Set(Object.values(this.detailedCharacterCombat.shields));
      return [...shields].reduce((penalty, shield) => penalty + shield.checkpenalty, 0);
    }

    /** A melee weapon's thrown attack: Dexterity to hit, as every ranged attack, with the weapon's own bonuses. */
    private thrownAttack(weapon: WeaponSlot): NonNullable<WeaponSlot["thrown"]> {
      const dexterity = this.characterAbilities.getAbilityModifier("Dexterity");
      const bonuses = dexterity + weapon.tohit.magic + weapon.tohit.misc + weapon.tohit.size;
      return { dexterity, total: iterativeAttacks(this.detailedCharacterCombat.bab).map((base) => base + bonuses) };
    }

    /** Costs each weapon the character isn't proficient with the non-proficiency penalty: 4 to hit, nothing else. */
    applyProficiencyPenalties(unproficientItemIds: Set<string>) {
      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon?.itemId || !unproficientItemIds.has(weapon.itemId)) continue;

          weapon.proficient = false;
          weapon.tohit.misc += CONSTANTS.NONPROFICIENCY_PENALTY;
        }
      }

      this.updateWeaponsTotal();
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

      this.updateWeaponsTotal();
    }

    addWeapon(
      setIndex: number,
      slot: "Main Hand" | "Off Hand" | "Two Handed",
      item: Pick<Item, "name">,
      properties: WeaponProperty[],
      itemId: string | null = null,
    ): void {
      const property = (type: string) => properties.find((p) => p.type === type);
      if (!property(WEAPON_PROFICIENCY)) return;
      const baseDamage = property(WEAPON_BASE_DAMAGE)?.value ?? "unknown";
      const ranged = properties.some((p) => p.type === WEAPON_RANGED && p.value === "true");
      // Light by the weapon table (Tiny and Small, written for Medium): every weapon is sized for its wielder, its damage too
      const light = (SIZE_ORDER[property(WEAPON_SIZE)?.value ?? ""] ?? Infinity) < SIZE_ORDER.Medium;
      // Strength adds to damage by the slot's share (melee and thrown weapons, slings) unless the weapon says otherwise
      const strengthDamage = property(WEAPON_STRENGTH_DAMAGE)?.value ?? "Slot";
      const handShare =
        slot === "Two Handed" && light ? SLOT_STRENGTH_MULTIPLIERS["Main Hand"] : SLOT_STRENGTH_MULTIPLIERS[slot];
      const strMultiplier = strengthDamage === "Slot" ? (handShare ?? null) : null;
      const mighty = property(WEAPON_MIGHTY);

      const slotKey = SLOT_MAP[slot];
      const setKey = String(setIndex);
      this.clearSlots(setKey, slot);
      const weapon: WeaponSlot = {
        name: item.name,
        itemId,
        proficient: true,
        finessable: properties.some((p) => p.type === WEAPON_FINESSABLE && p.value === "true"),
        light,
        ranged,
        range: Number(property(WEAPON_RANGE)?.value ?? 0),
        reach: Number(property(WEAPON_REACH)?.value ?? 0),
        slot: slotKey,
        tohit: { strength: 0, magic: 0, misc: 0, size: 0, total: [] },
        thrown: null,
        twoweapon: null,
        damage: {
          base: baseDamage,
          strength: 0,
          magic: 0,
          misc: 0,
          others: [],
          total: baseDamage,
          types: properties.filter((p) => p.type === DAMAGE_TYPE).map((p) => p.value),
          strmultiplier: strMultiplier,
          critical: {
            range: Number(property(WEAPON_CRITICAL_RANGE)?.value ?? 1),
            multiplier: Number(property(WEAPON_CRITICAL_MULTIPLIER)?.value ?? 1),
          },
        },
      };
      this.weaponAbilities.set(weapon, {
        // The SRD's attack rolls: Strength on a melee weapon's, Dexterity on a ranged weapon's
        attack: ranged ? "Dexterity" : "Strength",
        finesse: false,
        strengthRating: strengthDamage === "Rating" ? Number(mighty?.value ?? 0) : null,
        ratingRequired: strengthDamage === "Rating" && mighty !== undefined,
      });
      this.updateWeaponTotal(weapon);
      this.detailedCharacterCombat.weaponsets[setKey][slotKey] = weapon;
    }

    /**
     * Replace the default Unarmed Strike with the bonded creature's natural
     * attacks. Each attack becomes a weapon entry — primary in Main Hand, then
     * Off Hand for set 0; additional attacks spill into set 1 and beyond.
     * "Two Handed" is intentionally excluded: addWeapon wipes mainhand/offhand
     * when filling that slot, which would clobber prior natural attacks.
     */
    setNaturalAttacks(attacks: { name: string; damage: string; type: string; count?: number }[]): void {
      this.detailedCharacterCombat.weaponsets = {};
      if (attacks.length === 0) return;

      const slots: ("Main Hand" | "Off Hand")[] = ["Main Hand", "Off Hand"];
      for (let idx = 0; idx < attacks.length; idx++) {
        const attack = attacks[idx];
        const setIndex = Math.floor(idx / slots.length);
        const slot = slots[idx % slots.length];
        const displayName = attack.count && attack.count > 1 ? `${attack.name} (x${attack.count})` : attack.name;
        const props: WeaponProperty[] = [
          { type: WEAPON_PROFICIENCY, value: "Natural" },
          { type: WEAPON_BASE_DAMAGE, value: attack.damage },
          { type: DAMAGE_TYPE, value: attack.type },
          { type: WEAPON_CRITICAL_RANGE, value: "1" },
          { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
          { type: WEAPON_FINESSABLE, value: "true" },
        ];
        this.addWeapon(setIndex, slot, { name: displayName }, props);
      }
    }

    adjustWeaponDamageForSize() {
      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon) continue;

          weapon.damage.base = adjustDamageForSize(weapon.damage.base, this.raceSize);
          weapon.damage.total = formatDamageTotal(weapon);
        }
      }
    }
  }
  return WithAttacks;
}
