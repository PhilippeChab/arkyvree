import type { Constructor } from "@/server/mixins.ts";
import { CONSTANTS, SIZE_AC_ATTACK_MOD, SIZE_GRAPPLE_MOD, SIZE_STEPS } from "@/server/rulesets/constants.ts";
import type CombatState from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import { SLOT_MAP, type WeaponSlot } from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
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
import { WEAPON_SET_SLOTS } from "@/server/rulesets/properties/index.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import type DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import { type Item, type Property } from "@/shared/relations.ts";

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

    protected updateWeaponsTotal() {
      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon) continue;

          if (weapon.damage.strmultiplier !== null) {
            const strMod = this.characterAbilities.getAbilityModifier("Strength");
            weapon.damage.strength = Math.floor(strMod * weapon.damage.strmultiplier);
          }

          weapon.tohit.size = SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
          const tohitBonuses = weapon.tohit.strength + weapon.tohit.magic + weapon.tohit.misc + weapon.tohit.size;
          weapon.tohit.total = iterativeAttacks(this.detailedCharacterCombat.bab).map((base) => base + tohitBonuses);

          weapon.damage.total = formatDamageTotal(weapon);
        }
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

      const dexMod = this.characterAbilities.getAbilityModifier("Dexterity");

      for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
        for (const slotKey of WEAPON_SET_SLOTS) {
          const weapon = weaponSet[slotKey];
          if (!weapon || !weapon.finessable) continue;
          if (dexMod > weapon.tohit.strength) {
            weapon.tohit.strength = dexMod;
          }
        }
      }

      this.updateWeaponsTotal();
    }

    // oxlint-disable-next-line arkyvree/function-length -- a long function to split into steps
    addWeapon(
      setIndex: number,
      slot: "Main Hand" | "Off Hand" | "Two Handed",
      item: Item,
      properties: Property[],
      itemId: string | null = null,
    ): void {
      const weaponType = properties.find((property) => property.type === WEAPON_PROFICIENCY);
      if (!weaponType) {
        return;
      }

      const weaponBaseDamage = properties.find((property) => property.type === WEAPON_BASE_DAMAGE);
      const weaponCriticalRange = properties.find((property) => property.type === WEAPON_CRITICAL_RANGE);
      const weaponCriticalMultiplier = properties.find((property) => property.type === WEAPON_CRITICAL_MULTIPLIER);
      const weaponRange = properties.find((property) => property.type === WEAPON_RANGE);
      const weaponReach = properties.find((property) => property.type === WEAPON_REACH);
      const damageTypes = properties.filter((property) => property.type === DAMAGE_TYPE);

      const weaponFamily = properties.find((property) => property.type === WEAPON_FAMILY);
      const weaponMighty = properties.find((property) => property.type === WEAPON_MIGHTY);
      const finessable = properties.some((p) => p.type === WEAPON_FINESSABLE && p.value === "true");
      const isProjectile = ["Bow", "Crossbow", "Sling"].includes(weaponFamily?.value ?? "");

      // Projectile weapons (bows, crossbows, slings) use DEX for attack
      // Thrown weapons (daggers, javelins, etc.) still use STR
      const attackModifier = isProjectile
        ? this.characterAbilities.getAbilityModifier("Dexterity")
        : this.characterAbilities.getAbilityModifier("Strength");

      // Projectile weapons (bows, crossbows, slings) get no STR to damage
      // unless they have a Mighty rating (composite bows), which caps STR bonus
      // Negative STR always applies regardless of Mighty rating
      // Melee/thrown weapons use STR with slot multiplier (full/half/1.5x)
      let damageModifier = 0;
      let strMultiplier: number | null = null;
      if (!isProjectile) {
        const strMod = this.characterAbilities.getAbilityModifier("Strength");
        switch (slot) {
          case "Main Hand":
            strMultiplier = 1;
            damageModifier = strMod;
            break;
          case "Off Hand":
            strMultiplier = 0.5;
            damageModifier = Math.floor(strMod * strMultiplier);
            break;
          case "Two Handed":
            strMultiplier = 1.5;
            damageModifier = Math.floor(strMod * strMultiplier);
            break;
        }
      } else if (weaponMighty) {
        const strMod = this.characterAbilities.getAbilityModifier("Strength");
        const mightyRating = Number(weaponMighty.value);
        damageModifier = strMod < 0 ? strMod : Math.min(strMod, mightyRating);
      }

      const slotKey = SLOT_MAP[slot];
      const setKey = String(setIndex);

      // Create set entry if missing
      if (!this.detailedCharacterCombat.weaponsets[setKey]) {
        this.detailedCharacterCombat.weaponsets[setKey] = {
          mainhand: null,
          offhand: null,
          twohanded: null,
        };
      }

      // Two-handed weapons displace main-hand and off-hand (e.g. unarmed strike default)
      if (slot === "Two Handed") {
        this.detailedCharacterCombat.weaponsets[setKey].mainhand = null;
        this.detailedCharacterCombat.weaponsets[setKey].offhand = null;
      } else {
        this.detailedCharacterCombat.weaponsets[setKey].twohanded = null;
      }

      this.detailedCharacterCombat.weaponsets[setKey][slotKey] = {
        name: item.name,
        itemId,
        proficient: true,
        finessable,
        range: Number(weaponRange?.value ?? 0),
        reach: Number(weaponReach?.value ?? 0),
        slot: slotKey,
        tohit: {
          strength: attackModifier,
          magic: 0,
          misc: 0,
          size: SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0,
          total: iterativeAttacks(this.detailedCharacterCombat.bab).map(
            (base) => base + attackModifier + (SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0),
          ),
        },
        damage: {
          base: weaponBaseDamage?.value ?? "unknown",
          strength: damageModifier,
          magic: 0,
          misc: 0,
          others: [],
          total:
            damageModifier < 0
              ? `${weaponBaseDamage?.value ?? "unknown"} - ${Math.abs(damageModifier)}`
              : damageModifier > 0
                ? `${weaponBaseDamage?.value ?? "unknown"} + ${damageModifier}`
                : (weaponBaseDamage?.value ?? "unknown"),
          types: damageTypes.map((property) => property.value),
          strmultiplier: strMultiplier,
          critical: {
            range: Number(weaponCriticalRange?.value ?? 1),
            multiplier: Number(weaponCriticalMultiplier?.value ?? 1),
          },
        },
      };
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
        const props: Property[] = [
          { type: WEAPON_PROFICIENCY, value: "Natural" },
          { type: WEAPON_BASE_DAMAGE, value: attack.damage },
          { type: DAMAGE_TYPE, value: attack.type },
          { type: WEAPON_CRITICAL_RANGE, value: "1" },
          { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
          { type: WEAPON_FINESSABLE, value: "true" },
        ] as unknown as Property[];
        this.addWeapon(setIndex, slot, { name: displayName } as unknown as Item, props);
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
