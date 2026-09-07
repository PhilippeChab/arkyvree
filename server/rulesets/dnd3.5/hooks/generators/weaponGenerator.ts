// ── Types ────────────────────────────────────────────────────

type DamageType = "Bludgeoning" | "Piercing" | "Slashing";

export interface WeaponDefinition {
  proficiency: "Simple" | "Martial" | "Exotic";
  family: string;
  baseDamage: string;
  criticalRange: number;
  criticalMultiplier: number;
  damageTypes: DamageType[];
  size: string;
  range?: number;
  reach?: number;
  finessable?: boolean;
}

// ── Weapon Type Definitions ─────────────────────────────────
// Each entry is the canonical definition for a base weapon type.
// All properties are derived from selecting a weapon type name.

const WEAPON_TYPE_DEFINITIONS: Record<string, WeaponDefinition> = {
  // ── Simple ──
  "Gauntlet": { proficiency: "Simple", family: "Close", baseDamage: "1d3", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Tiny", finessable: true },
  "Spiked Gauntlet": { proficiency: "Simple", family: "Close", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Tiny", finessable: true },
  "Dagger": { proficiency: "Simple", family: "Dagger", baseDamage: "1d4", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing", "Slashing"], size: "Tiny", range: 10, finessable: true },
  "Punching Dagger": { proficiency: "Simple", family: "Dagger", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Tiny", finessable: true },
  "Light Mace": { proficiency: "Simple", family: "Mace", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", finessable: true },
  "Sickle": { proficiency: "Simple", family: "Sickle", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Small", finessable: true },
  "Club": { proficiency: "Simple", family: "Club", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Medium", range: 10 },
  "Heavy Mace": { proficiency: "Simple", family: "Mace", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Medium" },
  "Morningstar": { proficiency: "Simple", family: "Mace", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning", "Piercing"], size: "Medium" },
  "Shortspear": { proficiency: "Simple", family: "Spear", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", range: 20 },
  "Longspear": { proficiency: "Simple", family: "Spear", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large", reach: 10 },
  "Quarterstaff": { proficiency: "Simple", family: "Staff", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Large" },
  "Spear": { proficiency: "Simple", family: "Spear", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large", range: 20 },
  "Heavy Crossbow": { proficiency: "Simple", family: "Crossbow", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", range: 120 },
  "Light Crossbow": { proficiency: "Simple", family: "Crossbow", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Small", range: 80 },
  "Dart": { proficiency: "Simple", family: "Thrown", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Tiny", range: 20 },
  "Javelin": { proficiency: "Simple", family: "Spear", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", range: 30 },
  "Sling": { proficiency: "Simple", family: "Sling", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", range: 50 },

  // ── Martial ──
  "Handaxe": { proficiency: "Martial", family: "Axe", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Small", range: 10, finessable: true },
  "Light Hammer": { proficiency: "Martial", family: "Hammer", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", range: 20, finessable: true },
  "Kukri": { proficiency: "Martial", family: "Dagger", baseDamage: "1d4", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Small", finessable: true },
  "Light Pick": { proficiency: "Martial", family: "Pick", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 4, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Sap": { proficiency: "Martial", family: "Close", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", finessable: true },
  "Shortsword": { proficiency: "Martial", family: "Sword", baseDamage: "1d6", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Throwing Axe": { proficiency: "Martial", family: "Axe", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Small", range: 10, finessable: true },
  "Battleaxe": { proficiency: "Martial", family: "Axe", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Medium" },
  "Flail": { proficiency: "Martial", family: "Flail", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Medium" },
  "Longsword": { proficiency: "Martial", family: "Sword", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Medium" },
  "Heavy Pick": { proficiency: "Martial", family: "Pick", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 4, damageTypes: ["Piercing"], size: "Medium" },
  "Rapier": { proficiency: "Martial", family: "Sword", baseDamage: "1d6", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", finessable: true },
  "Scimitar": { proficiency: "Martial", family: "Sword", baseDamage: "1d6", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Medium" },
  "Trident": { proficiency: "Martial", family: "Spear", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", range: 10 },
  "Warhammer": { proficiency: "Martial", family: "Hammer", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Bludgeoning"], size: "Medium" },
  "Falchion": { proficiency: "Martial", family: "Sword", baseDamage: "2d4", criticalRange: 3, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Large" },
  "Glaive": { proficiency: "Martial", family: "Polearm", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Large", reach: 10 },
  "Greataxe": { proficiency: "Martial", family: "Axe", baseDamage: "1d12", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Large" },
  "Greatclub": { proficiency: "Martial", family: "Club", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Large" },
  "Greatsword": { proficiency: "Martial", family: "Sword", baseDamage: "2d6", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Large" },
  "Guisarme": { proficiency: "Martial", family: "Polearm", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Large", reach: 10 },
  "Halberd": { proficiency: "Martial", family: "Polearm", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing", "Slashing"], size: "Large", reach: 10 },
  "Lance": { proficiency: "Martial", family: "Spear", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large" },
  "Heavy Flail": { proficiency: "Martial", family: "Flail", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Large" },
  "Ranseur": { proficiency: "Martial", family: "Polearm", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large", reach: 10 },
  "Scythe": { proficiency: "Martial", family: "Polearm", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 4, damageTypes: ["Piercing", "Slashing"], size: "Large" },
  "Longbow": { proficiency: "Martial", family: "Bow", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large", range: 100 },
  "Composite Longbow": { proficiency: "Martial", family: "Bow", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Large", range: 110 },
  "Shortbow": { proficiency: "Martial", family: "Bow", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Medium", range: 60 },
  "Composite Shortbow": { proficiency: "Martial", family: "Bow", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Piercing"], size: "Medium", range: 70 },

  // ── Exotic ──
  "Kama": { proficiency: "Exotic", family: "Monk", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Small", finessable: true },
  "Nunchaku": { proficiency: "Exotic", family: "Monk", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", finessable: true },
  "Sai": { proficiency: "Exotic", family: "Monk", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Small", finessable: true },
  "Siangham": { proficiency: "Exotic", family: "Monk", baseDamage: "1d6", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Small", finessable: true },
  "Bastard Sword": { proficiency: "Exotic", family: "Sword", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Medium" },
  "Dwarven Waraxe": { proficiency: "Exotic", family: "Axe", baseDamage: "1d10", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Medium" },
  "Whip": { proficiency: "Exotic", family: "Flail", baseDamage: "1d3", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Medium", reach: 15, finessable: true },
  "Spiked Chain": { proficiency: "Exotic", family: "Flail", baseDamage: "2d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Large", reach: 10, finessable: true },
  "Dire Flail": { proficiency: "Exotic", family: "Flail", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Large" },
  "Gnome Hooked Hammer": { proficiency: "Exotic", family: "Hammer", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Bludgeoning", "Piercing"], size: "Medium" },
  "Orc Double Axe": { proficiency: "Exotic", family: "Axe", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing"], size: "Large" },
  "Two-Bladed Sword": { proficiency: "Exotic", family: "Sword", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Slashing"], size: "Large" },
  "Dwarven Urgrosh": { proficiency: "Exotic", family: "Axe", baseDamage: "1d8", criticalRange: 1, criticalMultiplier: 3, damageTypes: ["Slashing", "Piercing"], size: "Large" },
  "Hand Crossbow": { proficiency: "Exotic", family: "Crossbow", baseDamage: "1d4", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Tiny", range: 30 },
  "Repeating Heavy Crossbow": { proficiency: "Exotic", family: "Crossbow", baseDamage: "1d10", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Medium", range: 120 },
  "Repeating Light Crossbow": { proficiency: "Exotic", family: "Crossbow", baseDamage: "1d8", criticalRange: 2, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Small", range: 80 },
  "Bolas": { proficiency: "Exotic", family: "Thrown", baseDamage: "1d4", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Bludgeoning"], size: "Medium", range: 10 },
  "Net": { proficiency: "Exotic", family: "Thrown", baseDamage: "0", criticalRange: 1, criticalMultiplier: 0, damageTypes: [], size: "Medium", range: 10 },
  "Shuriken": { proficiency: "Exotic", family: "Monk", baseDamage: "1d2", criticalRange: 1, criticalMultiplier: 2, damageTypes: ["Piercing"], size: "Tiny", range: 10 },
};

export function getWeaponDefinition(weaponTypeName: string): WeaponDefinition | null {
  return WEAPON_TYPE_DEFINITIONS[weaponTypeName] ?? null;
}
