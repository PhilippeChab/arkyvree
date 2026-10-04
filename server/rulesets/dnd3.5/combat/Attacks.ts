import type { Constructor } from "@/server/mixins.ts";
import { CONSTANTS, SIZE_AC_ATTACK_MOD, SIZE_GRAPPLE_MOD, SIZE_STEPS } from "@/server/rulesets/constants.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import { SLOT_MAP, type WeaponAbilities, type WeaponSlot } from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import {
  DAMAGE_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MIGHTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_REACH,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { WeaponProperty } from "@/server/rulesets/dnd3.5/types.ts";
import { WEAPON_SET_SLOTS } from "@/server/rulesets/properties/index.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import type DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
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

/** The weapon families that fire projectiles, which attack with Dexterity. */
const PROJECTILE_FAMILIES = ["Bow", "Crossbow", "Sling"];

/** The share of its Strength modifier a weapon adds to damage in each slot: all of it, half, or one and a half. */
const SLOT_STRENGTH_MULTIPLIERS: Record<string, number> = { "Main Hand": 1, "Off Hand": 0.5, "Two Handed": 1.5 };

function iterativeAttacks(bab: number): number[] {
  const attacks: number[] = [];
  for (let bonus = bab; bonus > 0; bonus -= 5) {
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
     * A weapon's Strength to damage: its slot's share of the modifier (a melee or thrown weapon, a sling), or a bow's
     * (a penalty, and a bonus up to its Mighty rating). A crossbow adds none.
     */
    private updateStrengthDamage(weapon: WeaponSlot, bowMighty: number | null) {
      const strength = this.characterAbilities.getAbilityModifier("Strength");
      if (weapon.damage.strmultiplier !== null) {
        weapon.damage.strength = Math.floor(strength * weapon.damage.strmultiplier);
      } else if (bowMighty !== null) {
        weapon.damage.strength = strength < 0 ? strength : Math.min(strength, bowMighty);
      }
    }

    /** A weapon's to-hit and damage, from the character's abilities as they stand. */
    private updateWeaponTotal(weapon: WeaponSlot) {
      const abilities = this.weaponAbilities.get(weapon);
      if (abilities) {
        weapon.tohit.strength = this.attackModifier(abilities.attack);
        this.updateStrengthDamage(weapon, abilities.bowMighty);
      }

      weapon.tohit.size = SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
      const tohitBonuses = weapon.tohit.strength + weapon.tohit.magic + weapon.tohit.misc + weapon.tohit.size;
      weapon.tohit.total = iterativeAttacks(this.detailedCharacterCombat.bab).map((base) => base + tohitBonuses);

      weapon.damage.total = formatDamageTotal(weapon);
    }

    protected updateWeaponsTotal() {
      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (weapon) this.updateWeaponTotal(weapon);
        }
      }
    }

    /** The ability modifier a weapon attacks with. */
    private attackModifier(attack: WeaponAbilities["attack"]): number {
      const strength = this.characterAbilities.getAbilityModifier("Strength");
      if (attack === "Strength") return strength;
      const dexterity = this.characterAbilities.getAbilityModifier("Dexterity");
      return attack === "Dexterity" ? dexterity : Math.max(strength, dexterity);
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

    applyWeaponFinesse(characterFeats: DetailedCharacterFeats): void {
      const hasFinesse = characterFeats.getFeat("Weapon Finesse")?.possessed ?? false;
      if (!hasFinesse) return;

      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon?.finessable) continue;
          const abilities = this.weaponAbilities.get(weapon);
          if (abilities?.attack === "Strength") abilities.attack = "Finesse";
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
      const family = property(WEAPON_FAMILY)?.value ?? "";
      // A bow's Strength to damage is its own (a crossbow's none); a sling's is a thrown weapon's, the slot's share
      const isBow = family === "Bow";
      const strMultiplier = isBow || family === "Crossbow" ? null : (SLOT_STRENGTH_MULTIPLIERS[slot] ?? null);

      const slotKey = SLOT_MAP[slot];
      const setKey = String(setIndex);
      this.clearSlots(setKey, slot);
      const weapon: WeaponSlot = {
        name: item.name,
        itemId,
        proficient: true,
        finessable: properties.some((p) => p.type === WEAPON_FINESSABLE && p.value === "true"),
        range: Number(property(WEAPON_RANGE)?.value ?? 0),
        reach: Number(property(WEAPON_REACH)?.value ?? 0),
        slot: slotKey,
        tohit: { strength: 0, magic: 0, misc: 0, size: 0, total: [] },
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
        // Projectile weapons attack with Dexterity; thrown weapons (daggers, javelins…) still use Strength
        attack: PROJECTILE_FAMILIES.includes(family) ? "Dexterity" : "Strength",
        bowMighty: isBow ? Number(property(WEAPON_MIGHTY)?.value ?? 0) : null,
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
