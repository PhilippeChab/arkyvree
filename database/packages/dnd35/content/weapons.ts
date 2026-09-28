// The weapons by proficiency, which the weapon feats and the proficiency requirements name.

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
