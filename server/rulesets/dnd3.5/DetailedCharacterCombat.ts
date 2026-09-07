import { CONSTANTS, SIZE_AC_ATTACK_MOD, SIZE_GRAPPLE_MOD, SIZE_STEPS } from "@/server/rulesets/constants.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import type DetailedCharacterEncumbrance from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import type { EncumbranceData } from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import type DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  DAMAGE_TYPE,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FAMILY,
  WEAPON_MIGHTY,
  WEAPON_RANGE,
  WEAPON_REACH,
  WEAPON_PROFICIENCY,
  WEAPON_FINESSABLE,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import { WEAPON_SET_SLOTS } from "@/server/rulesets/properties/index.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import type DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import type DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import { type CharacterLevel, type Item, type Property, type Race } from "@/shared/relations.ts";
import { deriveSegmentLabels } from "@/shared/utils.ts";

const NAVIGATABLE_PATHS = [
  // Self-targeting weapon paths (resolved to the source item's equipped weapon slot)
  { path: "tohit.strength", description: "Weapon attack strength modifier", type: "number" as const, sortOrder: 0 },
  { path: "tohit.magic", description: "Enhancement bonus", type: "number" as const, sortOrder: 0 },
  { path: "tohit.size", description: "Size modifier to attack", type: "number" as const, sortOrder: 0 },
  { path: "tohit.misc", description: "Other bonuses to attack", type: "number" as const, sortOrder: 0 },
  { path: "damage.base", description: "Base damage dice", type: "string" as const, sortOrder: 1 },
  { path: "damage.strength", description: "Weapon damage strength modifier", type: "number" as const, sortOrder: 1 },
  { path: "damage.magic", description: "Enhancement bonus", type: "number" as const, sortOrder: 1 },
  { path: "damage.misc", description: "Other bonuses to damage", type: "number" as const, sortOrder: 1 },
  { path: "damage.critical.range", description: "Weapon critical threat range", type: "number" as const, sortOrder: 1 },
  { path: "damage.critical.multiplier", description: "Critical hit multiplier", type: "number" as const, sortOrder: 1 },
  { path: "damage.strmultiplier", description: "Str-to-damage ratio (1x/0.5x/1.5x)", type: "number" as const, sortOrder: 1 },
  // Armor class
  { path: "ac.base", description: "Default 10", type: "number" as const, sortOrder: 2 },
  { path: "ac.armor", description: "Armor bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.shield", description: "Shield bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.dexterity", description: "Dexterity bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.natural", description: "Natural armor bonus", type: "number" as const, sortOrder: 2 },
  { path: "ac.deflection", description: "Deflection bonus to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.size", description: "Size modifier to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.misc", description: "Other bonuses to AC", type: "number" as const, sortOrder: 2 },
  { path: "ac.total", description: "All AC bonuses combined", type: "number" as const, sortOrder: 2, requirementOnly: true },
  { path: "ac.touch", description: "Ignores armor, shield, natural", type: "number" as const, sortOrder: 2 },
  { path: "ac.flatfooted", description: "Ignores Dex bonus", type: "number" as const, sortOrder: 2 },
  // Hit points
  { path: "hp.base", description: "From hit dice rolls", type: "number" as const },
  { path: "hp.constitution", description: "Con modifier per level", type: "number" as const },
  { path: "hp.misc", description: "Other bonuses to HP", type: "number" as const },
  { path: "hp.total", description: "All HP sources combined", type: "number" as const, requirementOnly: true },
  // Initiative
  { path: "initiative.dexterity", description: "Dex modifier", type: "number" as const },
  { path: "initiative.misc", description: "Other bonuses to initiative", type: "number" as const },
  { path: "initiative.total", description: "All initiative bonuses combined", type: "number" as const, requirementOnly: true },
  // Attack
  { path: "bab", description: "From class progression", type: "number" as const },
  { path: "grapple.bab", description: "BAB contribution", type: "number" as const },
  { path: "grapple.strength", description: "Str modifier", type: "number" as const },
  { path: "grapple.size", description: "From race size", type: "number" as const },
  { path: "grapple.misc", description: "Other bonuses to grapple", type: "number" as const },
  { path: "grapple.total", description: "All grapple bonuses combined", type: "number" as const, requirementOnly: true },
  // Movement
  { path: "speed.base", description: "From race (ft)", type: "number" as const },
  { path: "speed.misc", description: "Other bonuses to speed (ft)", type: "number" as const },
  { path: "speed.total", description: "Final movement speed (ft)", type: "number" as const, requirementOnly: true },
  { path: "encumbrance.carriedweight", description: "Total weight of items (lbs)", type: "number" as const },
  { path: "encumbrance.heavyload", description: "Max carry capacity (lbs)", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  tohit: "To Hit",
  ac: "Armor Class",
  hp: "Hit Points",
  bab: "Base Attack Bonus",
  grapple: "Grapple",
  encumbrance: "Encumbrance",
  carriedweight: "Carried Weight",
  heavyload: "Heavy Load",
};

function iterativeAttacks(bab: number): number[] {
  const attacks: number[] = [];
  for (let bonus = bab; bonus > 0; bonus -= 5) {
    attacks.push(bonus);
  }
  return attacks.length > 0 ? attacks : [bab];
}

// D&D 3.5 damage die progression for size adjustments.
// All weapon/unarmed damages are defined for Medium size; shift up for Large, down for Small, etc.
const DAMAGE_PROGRESSION = [
  "1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "2d10", "3d6", "3d8", "4d6", "4d8",
];


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

type WeaponSlot = {
  name: string;
  itemId: string | null;
  proficient: boolean;
  finessable: boolean;
  range: number;
  reach: number;
  slot: string;
  tohit: {
    strength: number;
    magic: number;
    misc: number;
    size: number;
    total: number[];
  };
  damage: {
    base: string;
    strength: number;
    magic: number;
    misc: number;
    others: string[];
    total: string;
    types: string[];
    strmultiplier: number | null;
    critical: {
      range: number;
      multiplier: number;
    };
  };
};

export type WeaponSet = {
  mainhand: WeaponSlot | null;
  offhand: WeaponSlot | null;
  twohanded: WeaponSlot | null;
};

export type DetailedCharacterComprehensiveCombat = {
  ac: {
    base: number;
    armor: number;
    shield: number;
    dexterity: number;
    natural: number;
    deflection: number;
    size: number;
    misc: number;
    total: number;
    touch: number;
    flatfooted: number;
  };
  hp: {
    base: number;
    constitution: number;
    misc: number;
    total: number;
  };
  initiative: {
    dexterity: number;
    misc: number;
    total: number;
  };
  bab: number;
  grapple: {
    bab: number;
    strength: number;
    size: number;
    misc: number;
    total: number;
  };
  speed: {
    base: number;
    misc: number;
    total: number;
  };
  encumbrance: EncumbranceData;
  weaponsets: Record<string, WeaponSet>;
  armors: ArmorsData;
  shields: ShieldsData;
};

const SLOT_MAP: Record<string, keyof WeaponSet> = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
};

export default class DetailedCharacterCombat {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS, SEGMENT_LABELS);
  }

  static generateTargetPaths(
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const path of NAVIGATABLE_PATHS) {
      if ("requirementOnly" in path && path.requirementOnly && kind === "modifier") continue;
      paths.push({
        path: `combat.${path.path}`,
        category: "combat",
        description: path.description,
        valueType: path.type,
        operators: kind === "modifier" ? ["add", "subtract", "multiply", "divide", "set"] : [
          "equal",
          "not_equal",
          "greater_than",
          "less_than",
          "greater_than_or_equal",
          "less_than_or_equal",
        ],
        ...("sortOrder" in path && { sortOrder: path.sortOrder }),
      });
    }

    return paths;
  }

  private readonly detailedCharacterCombat: DetailedCharacterComprehensiveCombat = {
    ac: {
      base: CONSTANTS.DEFAULT_AC_BASE,
      armor: 0,
      shield: 0,
      dexterity: 0,
      natural: 0,
      deflection: 0,
      size: 0,
      misc: 0,
      total: CONSTANTS.DEFAULT_AC_BASE,
      touch: CONSTANTS.DEFAULT_AC_BASE,
      flatfooted: CONSTANTS.DEFAULT_AC_BASE,
    },
    hp: {
      base: 0,
      constitution: 0,
      misc: 0,
      total: 0,
    },
    initiative: {
      dexterity: 0,
      misc: 0,
      total: 0,
    },
    bab: 0,
    grapple: {
      bab: 0,
      strength: 0,
      size: 0,
      misc: 0,
      total: 0,
    },
    speed: {
      base: CONSTANTS.DEFAULT_SPEED,
      misc: 0,
      total: CONSTANTS.DEFAULT_SPEED,
    },
    encumbrance: {
      carriedweight: 0,
      lightload: 0,
      mediumload: 0,
      heavyload: 0,
      load: "light" as const,
      maxdex: Infinity,
      checkpenalty: 0,
    },
    weaponsets: {},
    armors: {},
    shields: {},
  };

  private shieldMaxDex = Infinity;
  private hasSpeedReducingArmor = false;
  private characterSkills: DetailedCharacterSkills | null = null;
  private characterEncumbrance: DetailedCharacterEncumbrance | null = null;
  private raceSize = "Medium";
  private hitDiceOverride: number | null = null;

  constructor(
    private readonly characterAbilities: DetailedCharacterAbilities,
    private readonly characterClasses: DetailedCharacterClasses,
  ) {}

  setSkills(skills: DetailedCharacterSkills) {
    this.characterSkills = skills;
  }

  setEncumbranceSource(encumbrance: DetailedCharacterEncumbrance) {
    this.characterEncumbrance = encumbrance;
  }

  initialize(
    race: Race,
    klassLevelProperties: Map<string, { bab: number; skills: number }>,
  ) {
    this.raceSize = race.size;

    const dexterityModifier = this.characterAbilities.getAbilityModifier("Dexterity");
    const constitutionModifier = this.characterAbilities.getAbilityModifier("Constitution");

    const classes = this.characterClasses.getClasses();
    const levels = Object.values(classes).reduce((acc, klass) => {
      for (const level of klass.levels) {
        acc.push(level.characterLevel);
      }
      return acc;
    }, [] as CharacterLevel[]);

    this.initializeArmorClass(dexterityModifier);
    this.initializeHitPoints(levels, constitutionModifier);
    this.initializeInitiative(dexterityModifier);
    this.initializeBaseAttackBonus(classes, klassLevelProperties);
    this.initializeSpeed(race);

    this.addWeapon(
      0,
      "Main Hand",
      { name: "Unarmed Strike" } as unknown as Item,
      [
        { type: WEAPON_PROFICIENCY, value: "Unarmed" },
        { type: WEAPON_BASE_DAMAGE, value: "1d3" },
        { type: DAMAGE_TYPE, value: "Bludgeoning" },
        { type: WEAPON_CRITICAL_RANGE, value: "1" },
        { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
        { type: WEAPON_FINESSABLE, value: "true" },
      ] as unknown as Property[],
    );
  }

  getCombat(): DetailedCharacterComprehensiveCombat {
    return this.detailedCharacterCombat;
  }

  setArmorsData(armors: ArmorsData): void {
    this.detailedCharacterCombat.armors = armors;
  }

  setShieldsData(shields: ShieldsData): void {
    this.detailedCharacterCombat.shields = shields;
  }

  getCombatElement(
    element:
      | "ac"
      | "hp"
      | "initiative"
      | "bab"
      | "grapple"
      | "speed"
      | "weaponsets",
  ): DetailedCharacterComprehensiveCombat[typeof element] {
    return this.detailedCharacterCombat[element];
  }

  updateTotals() {
    if (this.characterEncumbrance) {
      this.characterEncumbrance.updateTotals();
      const enc = this.characterEncumbrance.getEncumbrance();
      this.detailedCharacterCombat.encumbrance = enc;
    }
    this.recalculateDexterityAc();
    this.updateArmorClassTotal();
    this.updateHitPointsTotal();
    this.updateInitiativeTotal();
    this.updateGrappleTotal();
    this.updateSpeedTotal();
    this.updateWeaponsTotal();
    this.characterSkills?.updateTotals();
  }

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
    const weaponCriticalRange = properties.find((property) =>
      property.type === WEAPON_CRITICAL_RANGE
    );
    const weaponCriticalMultiplier = properties.find((property) =>
      property.type === WEAPON_CRITICAL_MULTIPLIER
    );
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
        total: damageModifier < 0
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
      const displayName = (attack.count && attack.count > 1)
        ? `${attack.name} (x${attack.count})`
        : attack.name;
      const props: Property[] = [
        { type: WEAPON_PROFICIENCY, value: "Natural" },
        { type: WEAPON_BASE_DAMAGE, value: attack.damage },
        { type: DAMAGE_TYPE, value: attack.type },
        { type: WEAPON_CRITICAL_RANGE, value: "1" },
        { type: WEAPON_CRITICAL_MULTIPLIER, value: "2" },
        { type: WEAPON_FINESSABLE, value: "true" },
      ] as unknown as Property[];
      this.addWeapon(
        setIndex,
        slot,
        { name: displayName } as unknown as Item,
        props,
      );
    }
  }

  addShield(
    properties: Property[],
  ) {
    const shield = properties.find((property) => property.type === SHIELD_PROFICIENCY);
    if (!shield) {
      return;
    }

    const acBonus = properties.find((property) => property.type === SHIELD_AC_BONUS);
    if (acBonus) {
      this.detailedCharacterCombat.ac.shield = Number(acBonus.value);
    }

    const dexterityLimitation =
      properties.find((property) => property.type === ARMOR_MAX_DEX)?.value ?? null;
    if (dexterityLimitation) {
      this.shieldMaxDex = Math.min(this.shieldMaxDex, Number(dexterityLimitation));
    }

    this.recalculateDexterityAc();
    this.updateArmorClassTotal();
  }

  addArmor(
    properties: Property[],
  ) {
    const armor = properties.find((property) => property.type === ARMOR_PROFICIENCY);
    if (!armor) {
      return;
    }

    if (armor.value === "Medium" || armor.value === "Heavy") {
      this.hasSpeedReducingArmor = true;
    }

    const acBonus = properties.find((property) => property.type === ARMOR_AC_BONUS);
    if (acBonus) {
      this.detailedCharacterCombat.ac.armor = Number(acBonus.value);
    }

    this.recalculateDexterityAc();
    this.updateArmorClassTotal();
  }

  private initializeArmorClass(dexterityModifier: number): void {
    this.detailedCharacterCombat.ac.dexterity = dexterityModifier;
    this.updateArmorClassTotal();
  }

  private initializeHitPoints(levels: CharacterLevel[], constitutionModifier: number): void {
    const baseHitPoints = levels.reduce((acc, level) => acc + level.hp, 0);
    const constitutionBonus = constitutionModifier * levels.length;

    this.detailedCharacterCombat.hp = {
      base: baseHitPoints,
      constitution: constitutionBonus,
      misc: 0,
      total: baseHitPoints + constitutionBonus,
    };
  }

  private initializeInitiative(dexterityModifier: number): void {
    this.detailedCharacterCombat.initiative.dexterity = dexterityModifier;
    this.detailedCharacterCombat.initiative.total =
      this.detailedCharacterCombat.initiative.dexterity +
      this.detailedCharacterCombat.initiative.misc;
  }

  private initializeBaseAttackBonus(
    classes: ReturnType<DetailedCharacterClasses["getClasses"]>,
    klassLevelProperties: Map<string, { bab: number; skills: number }>,
  ): void {
    const baseAttackBonusFromClasses = Object.values(classes).reduce(
      (acc, klass) => {
        const lastLevel = klass.levels.at(-1);
        if (!lastLevel) return acc;
        return acc + (klassLevelProperties.get(lastLevel.klassLevel.id)?.bab ?? 0);
      },
      0,
    );

    this.detailedCharacterCombat.bab = baseAttackBonusFromClasses;
  }

  private initializeSpeed(race: Race): void {
    this.detailedCharacterCombat.speed.base = race.baseSpeed;
    this.detailedCharacterCombat.speed.total = this.detailedCharacterCombat.speed.base +
      this.detailedCharacterCombat.speed.misc;
  }

  private recalculateDexterityAc(): void {
    const baseDexMod = this.characterAbilities.getAbilityModifier("Dexterity");

    // Find the minimum maxdex across all unique armors
    const uniqueArmors = new Set(Object.values(this.detailedCharacterCombat.armors));
    let minMaxDex = Infinity;
    for (const armor of uniqueArmors) {
      minMaxDex = Math.min(minMaxDex, armor.maxdex);
    }

    // Also consider shield dex cap
    minMaxDex = Math.min(minMaxDex, this.shieldMaxDex);

    // Also consider encumbrance dex cap
    minMaxDex = Math.min(minMaxDex, this.detailedCharacterCombat.encumbrance.maxdex);

    this.detailedCharacterCombat.ac.dexterity = minMaxDex === Infinity
      ? baseDexMod
      : Math.min(baseDexMod, minMaxDex);
  }

  private updateArmorClassTotal() {
    const ac = this.detailedCharacterCombat.ac;
    ac.size = SIZE_AC_ATTACK_MOD[this.raceSize] ?? 0;
    ac.total = ac.base + ac.armor + ac.shield + ac.dexterity + ac.natural + ac.deflection + ac.size + ac.misc;
    ac.touch = ac.total - ac.armor - ac.shield - ac.natural;
    ac.flatfooted = ac.total - Math.max(0, ac.dexterity);
  }

  private updateGrappleTotal() {
    const g = this.detailedCharacterCombat.grapple;
    g.bab = this.detailedCharacterCombat.bab;
    g.strength = this.characterAbilities.getAbilityModifier("Strength");
    g.size = SIZE_GRAPPLE_MOD[this.raceSize] ?? 0;
    g.total = g.bab + g.strength + g.size + g.misc;
  }

  private updateHitPointsTotal() {
    const hp = this.detailedCharacterCombat.hp;
    const numberOfLevels = this.hitDiceOverride ?? Object.values(this.characterClasses.getClasses()).reduce((acc, klass) => acc + klass.level, 0);
    hp.constitution = this.characterAbilities.getAbilityModifier("Constitution") * numberOfLevels;
    hp.total = hp.base + hp.constitution + hp.misc;
  }

  setHitDiceOverride(hd: number | null) {
    this.hitDiceOverride = hd;
  }

  private updateInitiativeTotal() {
    this.detailedCharacterCombat.initiative.total =
      this.detailedCharacterCombat.initiative.dexterity +
      this.detailedCharacterCombat.initiative.misc;
  }

  private updateSpeedTotal() {
    const base = this.detailedCharacterCombat.speed.base;
    const misc = this.detailedCharacterCombat.speed.misc;
    const load = this.detailedCharacterCombat.encumbrance.load;

    if (load === "overloaded") {
      this.detailedCharacterCombat.speed.total = 5;
    } else if (load === "medium" || load === "heavy" || this.hasSpeedReducingArmor) {
      const reducedBase = this.characterEncumbrance
        ? this.characterEncumbrance.getEncumberedSpeed(base)
        : base;
      this.detailedCharacterCombat.speed.total = reducedBase + misc;
    } else {
      this.detailedCharacterCombat.speed.total = base + misc;
    }
  }

  applyProficiencyPenalties(characterRequirements: DetailedCharacterRequirements) {
    const { unmetRequirementGroups } = characterRequirements.getRequirements();

    for (const weaponSet of Object.values(this.detailedCharacterCombat.weaponsets)) {
      for (const slotKey of WEAPON_SET_SLOTS) {
        const weapon = weaponSet[slotKey];
        if (!weapon || !weapon.itemId) continue;

        const isUnmet = unmetRequirementGroups.some((group) =>
          group.some((requirement) =>
            requirement.entityId === weapon.itemId && requirement.entityType === "items"
          )
        );

        if (isUnmet) {
          weapon.proficient = false;
          weapon.tohit.misc += CONSTANTS.NONPROFICIENCY_PENALTY;
        }
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

  private updateWeaponsTotal() {
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
        weapon.tohit.total = iterativeAttacks(this.detailedCharacterCombat.bab).map(
          (base) => base + tohitBonuses,
        );

        weapon.damage.total = formatDamageTotal(weapon);
      }
    }
  }
}
