/** The weapon and armor proficiencies a class's "Weapon and Armor Proficiency" feature grants. */

import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { grantFeat } from "@/content/dnd3.5/builders/feats/possession.ts";
import { stripSeparators } from "@/shared/text.ts";
import { EXOTIC_WEAPONS, MARTIAL_WEAPONS, SIMPLE_WEAPONS } from "@/vocabulary/dnd3.5/weapons.ts";

import { ModifierReading } from "./ModifierReading.ts";

/** Aliases for description text → canonical weapon names */
const WEAPON_ALIASES: Record<string, string[]> = {
  "crossbow (light or heavy)": ["Light Crossbow", "Heavy Crossbow"],
  "crossbow (hand, light, or heavy)": ["Hand Crossbow", "Light Crossbow", "Heavy Crossbow"],
  "dagger (any type)": ["Dagger", "Punching Dagger"],
  "shortbow (normal and composite)": ["Shortbow", "Composite Shortbow"],
  "hand axe": ["Handaxe"],
  "short sword": ["Shortsword"],
};

/** Weapon name → proficiency slug lookup: a later list's name replaces an earlier one's */
const WEAPON_PROF_MAP = new Map<string, string>([
  ...SIMPLE_WEAPONS.map((w) => [w.toLowerCase(), `simpleweaponproficiency${stripSeparators(w)}`] as const),
  ...MARTIAL_WEAPONS.map((w) => [w.toLowerCase(), `martialweaponproficiency${stripSeparators(w)}`] as const),
  ...EXOTIC_WEAPONS.map((w) => [w.toLowerCase(), `exoticweaponproficiency${stripSeparators(w)}`] as const),
]);

function detectSpecificWeapons(desc: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  const d = desc.toLowerCase();

  // Extract weapon list: "plus the X, Y, and Z" or "proficient with the X, Y, and Z"
  // Also handle "proficient are X, Y, and Z" (dndtools.net monk phrasing)
  // Try multiple patterns and pick the one that actually contains weapon names
  const patterns = [/(?:proficient are)\s+([^.]+)/, /(?:plus the)\s+([^.]+)/, /(?:proficient with(?: the)?)\s+([^.]+)/];
  let listMatch: RegExpMatchArray | null = null;
  for (const p of patterns) {
    const m = d.match(p);
    if (m) {
      listMatch = m;
      break;
    }
  }
  if (!listMatch) return [];

  const listText = listMatch[1];

  // First check aliases
  for (const [alias, weapons] of Object.entries(WEAPON_ALIASES)) {
    if (listText.includes(alias)) {
      for (const w of weapons) {
        const slug = WEAPON_PROF_MAP.get(w.toLowerCase());
        if (slug && !seen.has(slug)) {
          seen.add(slug);
          slugs.push(slug);
        }
      }
    }
  }

  // Then check individual weapon names (longest first to avoid partial matches)
  const weaponNames = [...WEAPON_PROF_MAP.keys()].sort((a, b) => b.length - a.length);
  for (const wName of weaponNames) {
    if (listText.includes(wName)) {
      const slug = WEAPON_PROF_MAP.get(wName)!;
      if (seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
    }
  }

  return slugs;
}

/** The proficiency feats a class's proficiency text grants, as modifiers that grant them. */
function proficiencyModifiers(desc: string): ModifierSeed[] {
  const mods: ModifierSeed[] = [];
  const d = desc.toLowerCase();

  // "gain no proficiency with any weapon or armor" → no modifiers (prestige classes)
  if (/gain no proficiency with any weapon or armor/.test(d)) return [];

  // Only use proficiency sentences for armor/shield detection (avoid spell failure text)
  const profSentences = d
    .split(/\.\s+/)
    .filter((s) => /proficien/.test(s))
    .join(". ");

  // Weapons
  if (/all simple and martial weapons/.test(profSentences))
    mods.push(grantFeat("simpleweaponproficiency"), grantFeat("martialweaponproficiency"));
  else if (/all simple weapons/.test(profSentences)) mods.push(grantFeat("simpleweaponproficiency"));

  // Specific weapon proficiencies (e.g. "plus the rapier, sap, shortbow")
  const specificWeapons = detectSpecificWeapons(profSentences);
  for (const slug of specificWeapons) mods.push(grantFeat(slug));

  // Armor — "all types of armor" / "all armor" / listing all three
  if (/all types of armor|all armor|heavy, medium, and light|light, medium, and heavy/.test(profSentences)) {
    mods.push(
      grantFeat("armorproficiencylight"),
      grantFeat("armorproficiencymedium"),
      grantFeat("armorproficiencyheavy"),
    );
  } else {
    if (/light (and medium )?armor|light, medium/i.test(profSentences)) mods.push(grantFeat("armorproficiencylight"));
    if (/medium (and heavy )?armor|medium armor|light and medium armor/i.test(profSentences))
      mods.push(grantFeat("armorproficiencymedium"));
    if (/heavy armor|medium and heavy armor/i.test(profSentences)) mods.push(grantFeat("armorproficiencyheavy"));
  }

  // Shields
  if (/not with shields|not.*with.*shields|but not with shields/.test(profSentences)) {
    // explicitly no shield proficiency
  } else if (/shields \(including tower shields\)|all armor and shields/.test(profSentences)) {
    mods.push(grantFeat("shieldproficiency"), grantFeat("towershieldproficiency"));
  } else if (/shields \(except tower shields\)/.test(profSentences)) {
    mods.push(grantFeat("shieldproficiency"));
  } else if (/\bshields\b/.test(profSentences) && !/tower shields/.test(profSentences)) {
    mods.push(grantFeat("shieldproficiency"));
  }
  // "proficiency with tower shields" alone (prestige class additions like Purple Dragon Knight)
  if (
    /proficiency with tower shields/.test(profSentences) &&
    !mods.some((m) => m.target.includes("towershieldproficiency"))
  )
    mods.push(grantFeat("towershieldproficiency"));

  return mods;
}

/**
 * The modifiers a class's "Weapon and Armor Proficiency" feature gives: the proficiency feats it grants. Their paths
 * aren't checked: a feat granted (`feats.*`) is none the engine's modifier paths list.
 */
export class ProficiencyModifiers extends ModifierReading {
  constructor(text: string) {
    super();
    this.modifiers.push(...proficiencyModifiers(text));
  }
}
