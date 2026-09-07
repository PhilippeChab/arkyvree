import type { MagicItemCategory, MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { parseCost, parseWeight } from "@/database/packages/dnd35-from-parser/tools/scraper/detectItem.ts";
import { SKILL_MAP, SAVE_MAP } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// ---------------------------------------------------------------------------
// Base item template names (sorted longest-first per category)
// ---------------------------------------------------------------------------

const BASE_WEAPONS = [
  "Repeating Heavy Crossbow", "Repeating Light Crossbow", "Gnome Hooked Hammer",
  "Two-Bladed Sword", "Composite Longbow", "Composite Shortbow", "Dwarven Urgrosh",
  "Orc Double Axe", "Spiked Gauntlet", "Punching Dagger", "Hand Crossbow",
  "Heavy Crossbow", "Light Crossbow", "Dwarven Waraxe", "Bastard Sword",
  "Spiked Chain", "Throwing Axe", "Light Hammer", "Morningstar",
  "Heavy Flail", "Heavy Mace", "Heavy Pick", "Light Mace", "Light Pick",
  "Dire Flail", "Battleaxe", "Greatclub", "Greatsword", "Greataxe",
  "Longsword", "Shortsword", "Warhammer", "Guisarme", "Nunchaku",
  "Shortspear", "Longspear", "Quarterstaff", "Falchion",
  "Scimitar", "Halberd", "Ranseur", "Handaxe", "Trident",
  "Longbow", "Shortbow", "Siangham", "Shuriken",
  "Gauntlet", "Dagger", "Sickle", "Rapier", "Lance",
  "Glaive", "Kukri", "Flail", "Spear", "Club", "Whip",
  "Dart", "Javelin", "Sling", "Scythe", "Kama", "Sap",
  "Bolas", "Net", "Sai",
];

const BASE_ARMOR = [
  "Studded Leather", "Leather Armor", "Padded Armor",
  "Chain Shirt", "Hide Armor", "Scale Mail", "Chain Mail",
  "Breastplate", "Splint Mail", "Banded Mail", "Half-Plate", "Full Plate",
];

const BASE_SHIELDS = [
  "Light Wooden Shield", "Light Steel Shield",
  "Heavy Wooden Shield", "Heavy Steel Shield",
  "Tower Shield", "Buckler",
];

/** Common alternative spellings in SRD descriptions → canonical template name, scoped by category */
const ALIASES: Partial<Record<MagicItemCategory, Record<string, string>>> = {
  specificWeapon: {
    "short sword": "Shortsword",
  },
  specificArmor: {
    chainmail: "Chain Mail",
    "chain mail": "Chain Mail",
    "plate armor": "Full Plate",
  },
  specificShield: {
    "heavy shield": "Heavy Steel Shield",
  },
};

export function detectBaseItem(name: string, description: string, category: MagicItemCategory): string | undefined {
  let candidates: string[];
  if (category === "specificWeapon") candidates = BASE_WEAPONS;
  else if (category === "specificArmor") candidates = BASE_ARMOR;
  else if (category === "specificShield") candidates = BASE_SHIELDS;
  else return undefined;

  const lowerDesc = description.toLowerCase();

  // Check category-scoped aliases first (e.g., "chainmail" → "Chain Mail" for armor only)
  const categoryAliases = ALIASES[category];
  if (categoryAliases) {
    for (const [alias, canonical] of Object.entries(categoryAliases)) {
      if (lowerDesc.includes(alias)) return canonical;
    }
  }

  for (const base of candidates) {
    if (lowerDesc.includes(base.toLowerCase())) return base;
  }

  const lowerName = name.toLowerCase();
  for (const base of candidates) {
    if (lowerName.includes(base.toLowerCase())) return base;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Category → item type mapping
// ---------------------------------------------------------------------------

const CATEGORY_TYPE_MAP: Record<MagicItemCategory, string> = {
  specificArmor: "Armor",
  specificShield: "Shield",
  specificWeapon: "Weapon",
  wondrousItem: "Wondrous Item",
  ring: "Ring",
  rod: "Rod",
  staff: "Staff",
};

// ---------------------------------------------------------------------------
// Slot inference
// ---------------------------------------------------------------------------

const CATEGORY_SLOT_MAP: Partial<Record<MagicItemCategory, string>> = {
  ring: "Finger",
  staff: "Two Handed",
  rod: "Main Hand",
  specificArmor: "Torso",
  specificShield: "Off Hand",
  specificWeapon: "Main Hand",
};

const WONDROUS_SLOT_PATTERNS: [RegExp, string][] = [
  [/\b(?:Belt|Girdle)\b/i, "Waist"],
  [/\b(?:Cloak|Cape|Mantle)\b/i, "Shoulders"],
  [/\b(?:Helm|Crown|Circlet|Headband|Phylactery|Hat|Goggles|Eyes|Lenses)\b/i, "Head"],
  [/\b(?:Amulet|Necklace|Periapt|Medallion|Scarab|Brooch)\b/i, "Neck"],
  [/\b(?:Bracers|Bracelet)\b/i, "Wrists"],
  [/\b(?:Gauntlets?|Gloves?)\b/i, "Hands"],
  [/\b(?:Robe|Vest)\b/i, "Torso"],
  [/\b(?:Boots|Slippers|Sandals)\b/i, "Other"],
];

function inferSlot(name: string, category: MagicItemCategory): string {
  if (category !== "wondrousItem") {
    return CATEGORY_SLOT_MAP[category] ?? "Other";
  }

  for (const [pattern, slot] of WONDROUS_SLOT_PATTERNS) {
    if (pattern.test(name)) return slot;
  }
  return "Other";
}

// ---------------------------------------------------------------------------
// Metadata parsing
// ---------------------------------------------------------------------------

function parseAura(metadataText: string): string | undefined {
  const match = metadataText.match(/(faint|moderate|strong|overwhelming)\s+([\w][\w\s,]+?)(?:;|$)/i);
  if (!match) return undefined;
  const strength = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const school = match[2].trim();
  return `${strength} ${school}`;
}

function parseCasterLevel(metadataText: string): number | undefined {
  const match = metadataText.match(/CL\s+(\d+)(?:st|nd|rd|th)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseMetadataPrice(metadataText: string): string {
  // For variant items, the metadata may have multiple prices — we extract the first one
  const match = metadataText.match(/Price\s+([\d,]+)\s*gp/i);
  if (match) return parseCost(`${match[1]} gp`);
  return "0";
}

function parseMetadataWeight(metadataText: string): string {
  const match = metadataText.match(/Weight\s+([\d.]+)\s*lb/i);
  if (match) return parseWeight(`${match[1]} lb.`);
  return "0";
}

// ---------------------------------------------------------------------------
// Modifier detection
// ---------------------------------------------------------------------------

type Modifier = { target: string; operator: string; value: string; valueType: string };

const ABILITY_MAP: Record<string, string> = {
  strength: "abilities.strength.misc",
  dexterity: "abilities.dexterity.misc",
  constitution: "abilities.constitution.misc",
  intelligence: "abilities.intelligence.misc",
  wisdom: "abilities.wisdom.misc",
  charisma: "abilities.charisma.misc",
};

/** Thematic item names → ability score (for items that don't use the ability name directly) */
const NAME_ABILITY_ALIAS: Record<string, string> = {
  health: "constitution",
  intellect: "intelligence",
};

/** Name-based patterns: item name → modifier. Specific patterns first, generic last. */
const NAME_MODIFIER_PATTERNS: { pattern: RegExp; toModifiers: (match: RegExpMatchArray) => Modifier[] }[] = [
  // Gauntlets of Ogre Power — +2 Strength (no +N in name, hardcoded)
  {
    pattern: /^Gauntlets of Ogre Power$/i,
    toModifiers: () => [{ target: "abilities.strength.misc", operator: "add", value: "2", valueType: "number" }],
  },
  // Amulet of Natural Armor +N
  {
    pattern: /Natural Armor\s*\+(\d+)$/i,
    toModifiers: (m) => [{ target: "combat.ac.natural", operator: "add", value: m[1], valueType: "number" }],
  },
  // Bracers of Armor +N
  {
    pattern: /^Bracers of Armor\s*\+(\d+)$/i,
    toModifiers: (m) => [{ target: "combat.ac.armor", operator: "add", value: m[1], valueType: "number" }],
  },
  // Cloak of Resistance +N
  {
    pattern: /^Cloak of Resistance\s*\+(\d+)$/i,
    toModifiers: (m) => [{ target: "saves.*.misc", operator: "add", value: m[1], valueType: "number" }],
  },
  // Protection +N (deflection to AC)
  {
    pattern: /^Protection\s*\+(\d+)$/i,
    toModifiers: (m) => [{ target: "combat.ac.deflection", operator: "add", value: m[1], valueType: "number" }],
  },
  // Generic ability score items: "Belt of Giant Strength +4", "Amulet of Health +2", etc.
  // Must be LAST — matches any "...Word +N" name, resolves via ability name or alias
  {
    pattern: /(.+?)\s*\+(\d+)$/,
    toModifiers: (m) => {
      const nameWords = m[1].trim().toLowerCase();
      for (const ability of Object.keys(ABILITY_MAP)) {
        if (nameWords.endsWith(ability)) {
          return [{ target: ABILITY_MAP[ability], operator: "add", value: m[2], valueType: "number" }];
        }
      }
      for (const [alias, ability] of Object.entries(NAME_ABILITY_ALIAS)) {
        if (nameWords.endsWith(alias)) {
          return [{ target: ABILITY_MAP[ability], operator: "add", value: m[2], valueType: "number" }];
        }
      }
      return [];
    },
  },
];

function detectModifiers(name: string, description: string): Modifier[] {
  const modifiers: Modifier[] = [];

  // --- Name-based patterns (accumulate, don't short-circuit) ---
  for (const { pattern, toModifiers } of NAME_MODIFIER_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      modifiers.push(...toModifiers(match));
      break; // Only one name pattern should match
    }
  }

  if (!description) return modifiers;

  // Track targets to prevent duplicates from name + description overlap
  const seen = new Set(modifiers.map((m) => m.target));

  /** Skip bonuses in conditional contexts (against X, while X, etc.) */
  function isConditional(matchIndex: number, matchLength: number): boolean {
    const before = description.lastIndexOf(".", matchIndex);
    const after = description.indexOf(".", matchIndex + matchLength);
    const sentence = description.slice(before + 1, after === -1 ? undefined : after).toLowerCase();
    // "when worn/placed/donned/held/grasped/carried" = item usage, not a combat condition
    return /\b(against|while|during|versus|vs\.|if you are|only when|only while|only against|when (?!worn|placed|donned|held|grasped|carried|used|activated))\b/.test(sentence);
  }

  function add(target: string, value: string): void {
    if (!seen.has(target)) {
      modifiers.push({ target, operator: "add", value, valueType: "number" });
      seen.add(target);
    }
  }

  // --- Description-based patterns ---

  // 1. Ability score bonuses: "+N enhancement bonus to Constitution"
  const abilityNames = "Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma";
  const enhRegex = new RegExp(`\\+(\\d+)\\s+(?:enhancement\\s+)?bonus to (?:her |his |the wearer's )?(${abilityNames})\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = enhRegex.exec(description)) !== null) {
    if (isConditional(match.index, match[0].length)) continue;
    const target = ABILITY_MAP[match[2].toLowerCase()];
    if (target) add(target, match[1]);
  }

  // 2. Skill bonuses: "+N <type> bonus on/to [all] [his/her/wearer's/your] <SkillName> checks"
  //    Greedy [^.]+ captures multi-skill patterns ("Swim checks and Climb checks") without crossing sentences
  const skillRegex = /\+(\d+)\s+(?:\w+\s+)?bonus (?:on|to) (?:all\s+)?(?:her |his |its wearer's |the wearer's |your )?([^.]+checks?)/gi;
  while ((match = skillRegex.exec(description)) !== null) {
    if (isConditional(match.index, match[0].length)) continue;
    const value = match[1];
    const skillText = match[2];

    // Split on "checks and" / "checks," to handle multi-skill descriptions
    const parts = skillText.split(/\s+checks?\s+and\s+|\s+checks?\s*,\s*/i);
    for (const raw of parts) {
      const skillName = raw.replace(/\s+checks?$/i, "").trim();
      if (!skillName) continue;
      const slug = SKILL_MAP[skillName.toLowerCase()];
      if (slug) add(`skills.${slug}.misc`, value);
    }
  }

  // 3. Save bonuses: "+N <type> bonus on [all] saving throws"
  const allSavesMatch = description.match(/\+(\d+)\s+\w+\s+bonus on (?:all )?saving throws/i);
  if (allSavesMatch && !isConditional(description.indexOf(allSavesMatch[0]), allSavesMatch[0].length)) {
    add("saves.*.misc", allSavesMatch[1]);
  }

  // Individual saves: "+N <type> bonus on Fortitude/Reflex/Will saves"
  const singleSaveRegex = /\+(\d+)\s+\w+\s+bonus (?:on|to) (?:all\s+)?(fortitude|reflex|will)(?:\s+saving)?\s+(?:saves|throws)/gi;
  while ((match = singleSaveRegex.exec(description)) !== null) {
    if (isConditional(match.index, match[0].length)) continue;
    const slug = SAVE_MAP[match[2].toLowerCase()];
    if (slug) add(`saves.${slug}.misc`, match[1]);
  }

  // 4. Initiative: "+N <type> bonus on/to initiative"
  const initMatch = description.match(/\+(\d+)\s+\w+\s+bonus (?:on|to)\s+initiative/i);
  if (initMatch && !isConditional(description.indexOf(initMatch[0]), initMatch[0].length)) {
    add("combat.initiative.misc", initMatch[1]);
  }

  return modifiers;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Parse all variant prices from metadata text.
 * Returns a map: variant tag → price string, or null if no variants.
 */
function parseAllVariantPrices(metadataText: string): Map<string, string> | null {
  const variantPattern = /([\d,]+)\s*gp\s*\(([^)]+)\)/g;
  const variants = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = variantPattern.exec(metadataText)) !== null) {
    // Strip category prefix and normalize to match cleaned variant names from the parser
    let tag = match[2].trim().replace(/^(?:ring|armor|shield|weapon)\s+/i, "");
    if (tag && !tag.startsWith("+")) {
      tag = tag.replace(/\b\w/g, (c) => c.toUpperCase());
    }
    variants.set(tag, match[1].replace(/,/g, ""));
  }
  return variants.size > 1 ? variants : null;
}

export function buildMagicItemDetected(
  raw: MagicItemReference["raw"],
): MagicItemReference["detected"] {
  const detected: MagicItemReference["detected"] = {};

  for (const entry of raw) {
    const aura = parseAura(entry.metadataText);
    const casterLevel = parseCasterLevel(entry.metadataText);

    // For variant items, extract variant-specific price from metadata.
    // Variant names are appended by the parser: "Protection +1"
    // where "+1" is the cleaned variant tag from "2,000 gp (ring +1)".
    let costGp: string;
    const variants = parseAllVariantPrices(entry.metadataText);
    if (variants) {
      // Find which variant tag this item's name ends with (longest match first)
      const sortedVariants = [...variants.entries()].sort((a, b) => b[0].length - a[0].length);
      let matched = false;
      for (const [tag, price] of sortedVariants) {
        if (entry.name.endsWith(tag)) {
          costGp = price;
          matched = true;
          break;
        }
      }
      costGp ??= matched ? "0" : parseMetadataPrice(entry.metadataText);
    } else {
      costGp = parseMetadataPrice(entry.metadataText);
    }

    const rawEntry = raw.find((r) => r.name === entry.name);
    const description = rawEntry?.description ?? "";
    const modifiers = detectModifiers(entry.name, description);
    const baseItem = detectBaseItem(entry.name, description, entry.category);

    detected[entry.name] = {
      category: entry.category,
      ...(aura ? { aura } : {}),
      ...(casterLevel ? { casterLevel } : {}),
      costGp,
      weight: parseMetadataWeight(entry.metadataText),
      itemType: CATEGORY_TYPE_MAP[entry.category],
      slot: inferSlot(entry.name, entry.category),
      ...(baseItem ? { baseItem } : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
    };
  }

  return detected;
}

export function buildMagicItemMapping(
  _detected: MagicItemReference["detected"],
  existingOverrides?: MagicItemReference["mapping"]["overrides"],
): MagicItemReference["mapping"] {
  return {
    overrides: existingOverrides ?? { reviewed: [] },
  } as MagicItemReference["mapping"];
}
