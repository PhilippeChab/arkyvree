import type { Modifier } from "@/database/packages/dnd35/content/types.ts";
import { isValidModifierPath } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { detectModifiersOf, type ModifierDetection, modifierMapping, SAVE_MAP, SKILL_MAP, validateModifiers } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// ---------------------------------------------------------------------------
// Ability name → slug mapping
// ---------------------------------------------------------------------------

const ABILITY_MAP: Record<string, string> = {
  strength: "strength",
  dexterity: "dexterity",
  constitution: "constitution",
  intelligence: "intelligence",
  wisdom: "wisdom",
  charisma: "charisma",
};

// ---------------------------------------------------------------------------
// Internal detection
// ---------------------------------------------------------------------------

function isConditional(text: string, match: RegExpMatchArray): boolean {
  // After a comma, only a condition: ", to a maximum of…", ", for example" qualify nothing
  return /^(?:\s+(?:that|to|for|made|related|involving)\b|,?\s+(?:(?:when|while|if|against|versus)\b|vs\.?\s))/i.test(text.slice((match.index ?? 0) + match[0].length));
}

// ---------------------------------------------------------------------------
// Skill bonus detection
// ---------------------------------------------------------------------------

function detectSkillBonuses(
  text: string,
  modifiers: Modifier[],
  unresolvedModifiers: string[],
): void {
  // "+N racial bonus on X checks" or "+N racial bonus on X, Y, and Z checks"
  const pattern = /\+(\d+)\s+racial\s+bonus\s+on\s+([\w\s,()]+?)\s+checks/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const bonus = parseInt(match[1], 10);
    const skillText = match[2];

    if (isConditional(text, match)) continue;

    const skills = skillText.split(/,\s*(?:and\s+)?|\s+and\s+/);
    for (const raw of skills) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const slug = SKILL_MAP[trimmed.toLowerCase()];
      if (slug) {
        modifiers.push({
          target: `skills.${slug}.misc`,
          operator: "add",
          value: String(bonus),
          valueType: "number",
        });
      } else {
        unresolvedModifiers.push(`Unresolved skill bonus: +${bonus} on "${trimmed}"`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Save bonus detection
// ---------------------------------------------------------------------------

function detectSaveBonuses(
  text: string,
  modifiers: Modifier[],
): void {
  const add = (save: string, bonus: string) => modifiers.push({ target: `saves.${save}.misc`, operator: "add", value: String(parseInt(bonus, 10)), valueType: "number" });

  // "+N racial bonus on all saving throws"
  for (const match of text.matchAll(/\+(\d+)\s+racial\s+bonus\s+on\s+all\s+saving\s+throws/gi)) {
    if (!isConditional(text, match)) for (const save of ["fortitude", "reflex", "will"]) add(save, match[1]);
  }

  // "+N racial bonus on Fortitude saving throws" (specific save)
  for (const match of text.matchAll(/\+(\d+)\s+racial\s+bonus\s+on\s+(\w+)\s+saving\s+throws/gi)) {
    const saveSlug = SAVE_MAP[match[2].toLowerCase()];
    if (saveSlug && !isConditional(text, match)) add(saveSlug, match[1]);
  }
}

// ---------------------------------------------------------------------------
// Detect race modifiers from raw data
// ---------------------------------------------------------------------------

function detectRaceModifiers(entry: RaceReference["raw"][number]): ModifierDetection<Modifier> {
  const modifiers: Modifier[] = [];
  const errors: string[] = [];
  const unresolvedModifiers: string[] = [];

  // 1. Ability adjustments from structured data
  for (const adj of entry.abilityAdjustments) {
    const slug = ABILITY_MAP[adj.ability.toLowerCase()];
    if (slug) {
      modifiers.push({
        target: `abilities.${slug}.misc`,
        operator: "add",
        value: String(adj.value),
        valueType: "number",
      });
    } else {
      unresolvedModifiers.push(`Unknown ability: "${adj.ability}"`);
    }
  }

  // 2. Detect modifiers from racial trait text
  for (const feature of entry.features) {
    const text = feature.description
      ? `${feature.name}: ${feature.description}`
      : feature.name;
    detectSkillBonuses(text, modifiers, unresolvedModifiers);
    detectSaveBonuses(text, modifiers);
  }

  // Validate paths
  const { validated, errors: validationErrors } = validateModifiers(modifiers, isValidModifierPath);
  errors.push(...validationErrors);

  return { modifiers: validated, errors, unresolvedModifiers };
}

/**
 * Whether a bonus applies only sometimes: what follows it says when ("checks that are related to stone", "checks to
 * notice…", "saving throws against poison", "…vs. enchantments", "…, if…").
 */

export function buildRaceDetected(raw: RaceReference["raw"]): RaceReference["detected"] {
  return detectModifiersOf(raw, detectRaceModifiers);
}

export function buildRaceMapping(
  raw: RaceReference["raw"],
  detected: RaceReference["detected"],
  overrides: NonNullable<RaceReference["overrides"]>,
): RaceReference["mapping"] {
  return modifierMapping(raw, detected, overrides, () => ({}));
}
