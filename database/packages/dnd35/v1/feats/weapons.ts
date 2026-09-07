import { stripSeparators } from "@/shared/utils.ts";
import type { FeatSeed, RequirementEntry } from "@/database/packages/dnd35/v1/feats/types.ts";
import { feat, eq, ne, gte, or } from "@/database/packages/dnd35/v1/feats/types.ts";

// ── Weapon lists ──────────────────────────────────────────────

export const SIMPLE_WEAPONS = [
  "Gauntlet", "Unarmed Strike", "Dagger", "Punching Dagger",
  "Light Mace", "Sickle", "Club", "Heavy Mace", "Morningstar",
  "Shortspear", "Longspear", "Quarterstaff", "Spear",
  "Heavy Crossbow", "Light Crossbow", "Dart", "Javelin", "Sling",
];

export const MARTIAL_WEAPONS = [
  "Throwing Axe", "Light Hammer", "Handaxe", "Kukri", "Light Pick", "Sap", "Short Sword",
  "Battleaxe", "Flail", "Longsword", "Heavy Pick", "Rapier", "Scimitar",
  "Trident", "Warhammer",
  "Falchion", "Glaive", "Greataxe", "Greatclub", "Heavy Flail", "Greatsword",
  "Guisarme", "Halberd", "Lance", "Ranseur", "Scythe",
  "Shortbow", "Composite Shortbow", "Longbow", "Composite Longbow",
];

export const EXOTIC_WEAPONS = [
  "Kama", "Nunchaku", "Sai", "Siangham",
  "Bastard Sword", "Dwarven Waraxe", "Whip",
  "Orc Double Axe", "Spiked Chain", "Dire Flail",
  "Two-Bladed Sword", "Dwarven Urgrosh", "Gnome Hooked Hammer",
  "Shuriken", "Hand Crossbow",
  "Repeating Heavy Crossbow", "Repeating Light Crossbow",
  "Net", "Bolas",
];

export const ALL_WEAPONS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS];

const CROSSBOW_WEAPONS = [
  "Heavy Crossbow", "Light Crossbow", "Hand Crossbow",
  "Repeating Heavy Crossbow", "Repeating Light Crossbow",
];

// ── Lookup sets ──────────────────────────────────────────────

const SIMPLE_SET = new Set(SIMPLE_WEAPONS);
const MARTIAL_SET = new Set(MARTIAL_WEAPONS);

// ── Helpers ──────────────────────────────────────────────────

function proficiencyReqs(w: string): RequirementEntry[] {
  if (SIMPLE_SET.has(w)) {
    return [or(eq(feat("Simple Weapon Proficiency")), eq(feat(`Simple Weapon Proficiency: ${w}`)))];
  }
  if (MARTIAL_SET.has(w)) {
    return [or(eq(feat("Martial Weapon Proficiency")), eq(feat(`Martial Weapon Proficiency: ${w}`)))];
  }
  // Exotic — per-weapon only
  return [eq(feat(`Exotic Weapon Proficiency: ${w}`))];
}

// ── Generated feats ───────────────────────────────────────────

function weaponPath(w: string) {
  return `items.weapons.${stripSeparators(w)}`;
}

const weaponFocus: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Weapon Focus: ${w}`,
  description: `You gain a +1 bonus on all attack rolls you make using ${w}.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  modifiers: [
    { target: `${weaponPath(w)}.tohit.misc`, operator: "add", value: "1", valueType: "number" },
  ],
  requirements: [
    ...proficiencyReqs(w),
    gte("combat.bab", 1),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Weapon Focus" }],
}));

const weaponSpecialization: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Weapon Specialization: ${w}`,
  description: `You gain a +2 bonus on all damage rolls you make using ${w}.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  modifiers: [
    { target: `${weaponPath(w)}.damage.misc`, operator: "add", value: "2", valueType: "number" },
  ],
  requirements: [
    eq(feat(`Weapon Focus: ${w}`)),
    gte("classes.fighter.level", 4),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Weapon Specialization" }],
}));

const greaterWeaponFocus: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Greater Weapon Focus: ${w}`,
  description: `You gain a +1 bonus on all attack rolls you make using ${w}. This bonus stacks with other bonuses on attack rolls, including the one from Weapon Focus (see below).`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  modifiers: [
    { target: `${weaponPath(w)}.tohit.misc`, operator: "add", value: "1", valueType: "number" },
  ],
  requirements: [
    eq(feat(`Weapon Focus: ${w}`)),
    gte("classes.fighter.level", 8),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Greater Weapon Focus" }],
}));

const greaterWeaponSpecialization: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Greater Weapon Specialization: ${w}`,
  description: `You gain a +2 bonus on all damage rolls you make using ${w}. This bonus stacks with other bonuses on damage rolls, including the one from Weapon Specialization (see below).`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  modifiers: [
    { target: `${weaponPath(w)}.damage.misc`, operator: "add", value: "2", valueType: "number" },
  ],
  requirements: [
    eq(feat(`Weapon Focus: ${w}`)),
    eq(feat(`Greater Weapon Focus: ${w}`)),
    eq(feat(`Weapon Specialization: ${w}`)),
    gte("classes.fighter.level", 12),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Greater Weapon Specialization" }],
}));

const improvedCritical: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Improved Critical: ${w}`,
  description: `When using ${w}, your threat range is doubled.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  modifiers: [
    { target: `${weaponPath(w)}.damage.critical.range`, operator: "multiply", value: "2", valueType: "number" },
  ],
  requirements: [
    ...proficiencyReqs(w),
    gte("combat.bab", 8),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Improved Critical" }],
}));

const martialWeaponProficiency: FeatSeed[] = MARTIAL_WEAPONS.map((w) => ({
  name: `Martial Weapon Proficiency: ${w}`,
  description: `You make attack rolls with ${w} normally.`,
  aptitudes: ["General"],
  requirements: [
    ne(feat("Martial Weapon Proficiency")),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Martial Weapon Proficiency" }],
}));

const exoticWeaponProficiency: FeatSeed[] = EXOTIC_WEAPONS.map((w) => ({
  name: `Exotic Weapon Proficiency: ${w}`,
  description: `You make attack rolls with the weapon normally.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    gte("combat.bab", 1),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Exotic Weapon Proficiency" }],
}));

const rapidReload: FeatSeed[] = CROSSBOW_WEAPONS.map((w) => ({
  name: `Rapid Reload: ${w}`,
  description: `The time required for you to reload your chosen type of crossbow is reduced to a free action (for a hand or light crossbow) or a move action (for a heavy crossbow). Reloading a crossbow still provokes an attack of opportunity. If you have selected this feat for hand crossbow or light crossbow, you may fire that weapon as many times in a full attack action as you could attack if you were using a bow.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  properties: [{ type: "FEAT_FAMILY", value: "Rapid Reload" }],
}));

export const WEAPON_SPECIFIC_FEATS: FeatSeed[] = [
  ...weaponFocus,
  ...weaponSpecialization,
  ...greaterWeaponFocus,
  ...greaterWeaponSpecialization,
  ...improvedCritical,
  ...martialWeaponProficiency,
  ...exoticWeaponProficiency,
  ...rapidReload,
];
