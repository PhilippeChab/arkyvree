/**
 * The name table PCGen's 3.5 files are read through: what PCGen calls an ability, an alignment, a feat pool, a place on
 * the body, and the items and feats whose names no general rule turns into the app's (`PcgenNames` reads the rest:
 * "Sword (Bastard)" is "Bastard Sword", "Rope (Hempen/50 Ft.)" is "Rope, hempen (50 ft.)").
 */

import type { ItemLocation } from "@/shared/enums.ts";
import type { Alignment } from "@/vocabulary/dnd3.5/identity.ts";

/** The ability a PCGen stat key names. */
export const PCGEN_ABILITIES = new Map<string, string>([
  ["CHA", "Charisma"],
  ["CON", "Constitution"],
  ["DEX", "Dexterity"],
  ["INT", "Intelligence"],
  ["STR", "Strength"],
  ["WIS", "Wisdom"],
]);

/** The alignment a PCGen alignment key names. */
export const PCGEN_ALIGNMENTS = new Map<string, Alignment>([
  ["CE", "Chaotic Evil"],
  ["CG", "Chaotic Good"],
  ["CN", "Chaotic Neutral"],
  ["LE", "Lawful Evil"],
  ["LG", "Lawful Good"],
  ["LN", "Lawful Neutral"],
  ["N", "True Neutral"],
  ["NE", "Neutral Evil"],
  ["NG", "Neutral Good"],
  ["TN", "True Neutral"],
]);

/** The app's feat a PCGen feat key names, where the feat's own name differs. */
export const PCGEN_FEATS = new Map<string, string>([
  ["Exotic Weapon Master ~ Show Off", "Show Off (Exotic Weapon Master Exotic Weapon Stunt)"],
]);

/** The app's item a PCGen item names, where no general rule turns one into the other. */
export const PCGEN_ITEMS = new Map<string, string>([
  ["Bottle (Glass/Wine)", "Bottle, wine, glass"],
  ["Bread (Loaf)", "Bread, per loaf"],
  ["Chainmail", "Chain Mail"],
  ["Cheese (Hunk)", "Cheese, hunk of"],
  ["Donkey", "Donkey or mule"],
  ["Hide", "Hide Armor"],
  ["Ladder (10 Ft.)", "Ladder, 10-foot"],
  ["Leather", "Leather Armor"],
  ["Masterwork Silver Dagger", "Silver Dagger, Masterwork"],
  ["Meat (Chunk)", "Meat, chunk of"],
  ["Mule", "Donkey or mule"],
  ["Padded", "Padded Armor"],
  ["Pole (10 Ft.)", "Pole, 10-foot"],
  ["Shield (Heavy/Metal)", "Heavy Steel Shield"],
  ["Shield (Heavy/Steel)", "Heavy Steel Shield"],
  ["Shield (Heavy/Wood)", "Heavy Wooden Shield"],
  ["Shield (Heavy/Wooden)", "Heavy Wooden Shield"],
  ["Shield (Light/Metal)", "Light Steel Shield"],
  ["Shield (Light/Steel)", "Light Steel Shield"],
  ["Shield (Light/Wood)", "Light Wooden Shield"],
  ["Shield (Light/Wooden)", "Light Wooden Shield"],
  ["Shield (Tower/Wood)", "Tower Shield"],
  ["Shield (Tower)", "Tower Shield"],
]);

/**
 * Where an item a PCGen equipment set places on the body goes: a hand, or `"slot"`, the item's own slot (a ring's
 * finger, a cloak's shoulders), which the app reads off the item.
 */
export const PCGEN_LOCATIONS = new Map<string, ItemLocation | "slot">([
  ["Arms", "slot"],
  ["Armor", "slot"],
  ["Back", "slot"],
  ["Belt", "slot"],
  ["Body", "slot"],
  ["Both Hands", "Two Handed"],
  ["Clothing", "slot"],
  ["Double Weapon", "Two Handed"],
  ["Eyes", "slot"],
  ["Face", "slot"],
  ["Fingers", "slot"],
  ["Foot", "slot"],
  ["Hands", "slot"],
  ["Head", "slot"],
  ["Leg", "slot"],
  ["Neck", "slot"],
  ["Primary Hand", "Main Hand"],
  ["Robe", "slot"],
  ["Secondary Hand", "Off Hand"],
  ["Shield", "Off Hand"],
  ["Shirt", "slot"],
  ["Shoulders", "slot"],
  ["Skin", "slot"],
  ["Torso", "slot"],
  ["Waist", "slot"],
  ["Wrists", "slot"],
]);

/** The app's feat pool a PCGen ability pool names: its general feats', a class's bonus feats'. */
export const PCGEN_POOLS = new Map<string, string>([
  ["Domain", "Cleric Domain"],
  ["FEAT", "General"],
  ["Fighter Feat", "Fighter Bonus Feat"],
  ["Monk Feat LVL 1", "Monk Bonus Feat (1st)"],
  ["Monk Feat LVL 2", "Monk Bonus Feat (2nd)"],
  ["Monk Feat LVL 6", "Monk Bonus Feat (6th)"],
  ["Wizard Feat", "Wizard Bonus Feat"],
]);
