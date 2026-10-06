import { isConditional } from "@/database/packages/dnd35-from-parser/tools/scraper/conditional.ts";
import { isValidModifierPath } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import { readSkillBonuses } from "@/database/packages/dnd35-from-parser/tools/scraper/skillBonuses.ts";
import {
  detectModifiersOf,
  type ModifierDetection,
  modifierMapping,
  SAVE_MAP,
  validateModifiers,
} from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import type { Modifier } from "@/database/packages/dnd35/content/types.ts";

const ABILITY_MAP: Record<string, string> = {
  strength: "strength",
  dexterity: "dexterity",
  constitution: "constitution",
  intelligence: "intelligence",
  wisdom: "wisdom",
  charisma: "charisma",
};

/**
 * Whether the bonus `match` read applies only sometimes (`isConditional`): what follows it says when ("checks that are
 * related to stone", "checks to notice…", "saving throws against poison", "…vs. enchantments", "…, if…").
 */
function conditional(text: string, match: RegExpMatchArray): boolean {
  const start = match.index ?? 0;
  return isConditional(text, start, start + match[0].length);
}

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
    const text = feature.description ? `${feature.name}: ${feature.description}` : feature.name;
    detectSkillBonuses(text, modifiers, unresolvedModifiers);
    detectSaveBonuses(text, modifiers);
  }

  // Validate paths
  const { validated, errors: validationErrors } = validateModifiers(modifiers, isValidModifierPath);
  errors.push(...validationErrors);

  return { modifiers: validated, errors, unresolvedModifiers };
}

function detectSaveBonuses(text: string, modifiers: Modifier[]): void {
  const add = (save: string, bonus: string) =>
    modifiers.push({
      target: `saves.${save}.misc`,
      operator: "add",
      value: String(parseInt(bonus, 10)),
      valueType: "number",
    });

  // "+N racial bonus on all saving throws"
  for (const match of text.matchAll(/\+(\d+)\s+racial\s+bonus\s+on\s+all\s+saving\s+throws/gi)) {
    if (!conditional(text, match)) for (const save of ["fortitude", "reflex", "will"]) add(save, match[1]);
  }

  // "+N racial bonus on Fortitude saving throws" (specific save)
  for (const match of text.matchAll(/\+(\d+)\s+racial\s+bonus\s+on\s+(\w+)\s+saving\s+throws/gi)) {
    const saveSlug = SAVE_MAP[match[2].toLowerCase()];
    if (saveSlug && !conditional(text, match)) add(saveSlug, match[1]);
  }
}

function detectSkillBonuses(text: string, modifiers: Modifier[], unresolvedModifiers: string[]): void {
  // "+N racial bonus on X checks" or "+N racial bonus on X, Y, and Z checks"
  for (const bonus of readSkillBonuses(text, (match) => conditional(text, match))) {
    if (bonus.slug) {
      modifiers.push({ target: `skills.${bonus.slug}.misc`, operator: "add", value: bonus.value, valueType: "number" });
    } else {
      unresolvedModifiers.push(`Unresolved skill bonus: +${bonus.value} on "${bonus.name}"`);
    }
  }
}

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
