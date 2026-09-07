import type { ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { isValidModifierPath } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { SKILL_MAP, SAVE_MAP, validateModifiers } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

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
// Detect race modifiers from raw data
// ---------------------------------------------------------------------------

export function buildRaceDetected(raw: RaceReference["raw"]): RaceReference["detected"] {
  const detected: RaceReference["detected"] = {};

  for (const entry of raw) {
    const { modifiers, errors, unresolvedModifiers } = detectRaceModifiers(entry);

    detected[entry.name] = {
      modifiers,
      ...(errors.length > 0 ? { errors } : {}),
      ...(unresolvedModifiers.length > 0 ? { unresolvedModifiers } : {}),
    };
  }

  return detected;
}

export function buildRaceMapping(
  raw: RaceReference["raw"],
  detected: RaceReference["detected"],
  overrides: RaceReference["mapping"]["overrides"],
): RaceReference["mapping"] {
  const mapping = { overrides } as RaceReference["mapping"];
  for (const entry of raw) {
    const det = detected[entry.name];
    const ovr = overrides[entry.name];
    const description = ovr?.description ?? entry.description;
    const modifiers = ovr?.modifiers ?? det?.modifiers ?? [];

    mapping[entry.name] = {
      description,
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(ovr?.skip ? { skip: true } : {}),
    };
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Internal detection
// ---------------------------------------------------------------------------

function detectRaceModifiers(entry: RaceReference["raw"][number]): {
  modifiers: ModifierSeed[];
  errors: string[];
  unresolvedModifiers: string[];
} {
  const modifiers: ModifierSeed[] = [];
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

  // 3. Human special traits
  if (entry.name === "Human") {
    detectHumanTraits(entry.features, modifiers);
  }

  // Validate paths
  const { validated, errors: validationErrors } = validateModifiers(modifiers, isValidModifierPath);
  errors.push(...validationErrors);

  return { modifiers: validated, errors, unresolvedModifiers };
}

// ---------------------------------------------------------------------------
// Skill bonus detection
// ---------------------------------------------------------------------------

function detectSkillBonuses(
  text: string,
  modifiers: ModifierSeed[],
  unresolvedModifiers: string[],
): void {
  // "+N racial bonus on X checks" or "+N racial bonus on X, Y, and Z checks"
  const pattern = /\+(\d+)\s+racial\s+bonus\s+on\s+([\w\s,()]+?)\s+checks/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const bonus = parseInt(match[1], 10);
    const skillText = match[2];

    // Skip conditional bonuses: "checks that are related to...", "checks to notice..."
    const afterMatch = text.substring(match.index + match[0].length);
    if (/^\s+(?:that\b|to\b|when\b|made\b|related\b|involving\b)/i.test(afterMatch)) continue;

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
  modifiers: ModifierSeed[],
): void {
  // "+N racial bonus on all saving throws"
  const allSavesMatch = text.match(/\+(\d+)\s+racial\s+bonus\s+on\s+all\s+saving\s+throws/i);
  if (allSavesMatch) {
    const bonus = parseInt(allSavesMatch[1], 10);
    for (const save of ["fortitude", "reflex", "will"]) {
      modifiers.push({
        target: `saves.${save}.misc`,
        operator: "add",
        value: String(bonus),
        valueType: "number",
      });
    }
    return;
  }

  // "+N racial bonus on Fortitude saving throws" (specific save)
  const specificSaveMatch = text.match(/\+(\d+)\s+racial\s+bonus\s+on\s+(\w+)\s+saving\s+throws/i);
  if (specificSaveMatch) {
    const bonus = parseInt(specificSaveMatch[1], 10);
    const saveSlug = SAVE_MAP[specificSaveMatch[2].toLowerCase()];
    if (saveSlug) {
      modifiers.push({
        target: `saves.${saveSlug}.misc`,
        operator: "add",
        value: String(bonus),
        valueType: "number",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Human special traits
// ---------------------------------------------------------------------------

function detectHumanTraits(
  features: { name: string; description: string }[],
  modifiers: ModifierSeed[],
): void {
  const fullText = features.map((f) => `${f.name} ${f.description}`).join(" ");

  // Bonus feat at 1st level
  if (/extra feat at 1st level|bonus feat at 1st level|1 extra feat at 1st level/i.test(fullText)) {
    modifiers.push({
      target: "aptitudes.general.allowed",
      operator: "add",
      value: "1",
      valueType: "number",
    });
  }

  // Extra skill points
  if (/4 extra skill points at 1st level|extra skill point at each|1 extra skill point at each additional level/i.test(fullText)) {
    modifiers.push({
      target: "skills.budget.perlevel",
      operator: "add",
      value: "1",
      valueType: "number",
    });
  }
}
