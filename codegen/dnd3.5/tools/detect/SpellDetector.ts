import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { sanitizeText } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { type SpellReference } from "@/codegen/dnd3.5/tools/types/spells.ts";
import type { Property } from "@/content/core/builders/customization/types.ts";
import { capitalize } from "@/shared/text.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_SUBSCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";

import { BaseDetector, type Resolved } from "./BaseDetector.ts";

/** A spell of a reference, as scraped. */
type RawSpell = SpellReference["raw"][number];

/**
 * How a spell's text names the spell it's written as: "functions like X", "functions as X", "works as the X spell",
 * "similar to X", "the same as X", or a description opening "As X, except…". The base spell's name runs to a comma, a
 * period, "except" or "but".
 */
const BASE_SPELL_WORDINGS =
  /(?:^As|functions? (?:like|as|similarly to)|works (?:like|as)|similar to|(?:is|otherwise) the same as)\s+(.+?)(?:,|\.| except| but)/gi;

/**
 * A spell's components, by the abbreviation its scraped stat block gives each: the site writes a focus "AF" (the SRD's
 * "F", and the F of "F/DF": Alarm's "V, S, F/DF" is scraped as V, S, AF, DF).
 */
const COMPONENT_MAP: Record<string, string> = {
  V: "Verbal",
  S: "Somatic",
  M: "Material",
  F: "Focus",
  AF: "Focus",
  DF: "Divine Focus",
  XP: "XP Cost",
};

/** Compound component forms used in manual seeds: "M/DF" → "Material/Divine Focus" */
const COMPOUND_COMPONENT_MAP: Record<string, string> = {
  "M/DF": "Material/Divine Focus",
  "F/DF": "Focus/Divine Focus",
};

/**
 * The words a spell's name puts after a comma ("Cure Light Wounds, Mass", "Vigor, Mass Lesser"), which its text puts
 * first ("mass lesser vigor"), and the name they qualify.
 */
const NAME_QUALIFIERS = /^((?:(?:greater|improved|lesser|mass|swift)\s+)+)(.+)$/;

const SUBSCHOOL_CANON: Record<string, string> = Object.fromEntries(SPELL_SUBSCHOOLS.map((s) => [s.toLowerCase(), s]));

/** A reference's spells, each with the stat block's fields its override corrects. */
function correctedSpells({ overrides, raw }: Pick<SpellReference, "overrides" | "raw">): RawSpell[] {
  return raw.map((entry) => {
    const { description: _description, levelEntries: _levelEntries, ...fields } = overrides?.[entry.name] ?? {};
    return { ...entry, ...fields };
  });
}

function expandComponents(components: string[]): string[] {
  const result: string[] = [];
  for (const comp of components) {
    const compound = COMPOUND_COMPONENT_MAP[comp.trim()];
    if (compound) {
      if (!result.includes(compound)) result.push(compound);
      continue;
    }
    const mapped = COMPONENT_MAP[comp.trim()];
    if (mapped && !result.includes(mapped)) result.push(mapped);
  }
  return result;
}

/**
 * The spell `entry`'s text names as its base (`BASE_SPELL_WORDINGS`), of `spells` (by lowercase name), but those it
 * has already walked through (`visited`): the first it names that's one of them, none when it names none.
 */
function findBaseSpell(entry: RawSpell, spells: Map<string, RawSpell>, visited: Set<string>): RawSpell | undefined {
  for (const [, name] of entry.description.matchAll(BASE_SPELL_WORDINGS)) {
    const base = resolveBaseSpell(
      spells,
      name
        .trim()
        .replace(/^(?:a|the) /i, "")
        .replace(/ spell$/i, ""),
    );
    if (base && !visited.has(base.name)) return base;
  }
  return undefined;
}

/** Whether a spell lacks a field its base spell can give it (the spell it's written as). */
function lacksFields(entry: RawSpell): boolean {
  return (
    !entry.range ||
    !entry.duration ||
    entry.components.length === 0 ||
    !entry.savingThrow ||
    !entry.spellResistance ||
    !entry.castingTime
  );
}

function normalizeDescriptor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  // Only normalize all-lowercase scrapes (e.g. "good"); leave mixed-case
  // compounds like "Fire or Cold" or "Mind-Affecting" untouched.
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.split("-").map(capitalize).join("-");
}

function normalizeSpellResistance(value: string): string {
  // Lowercase the canonical "(harmless)" / "(harmless, object)" parenthetical
  return value.replace(/\(Harmless/g, "(harmless");
}

/** Collapse whitespace/newlines and normalize spell stat text */
function normalizeSpellText(text: string): string {
  return normalizeWs(sanitizeText(text)).replace(/(\d+)\s*\/\s*/g, "$1/"); // "1 round/ level" → "1 round/level"
}

function normalizeSubschool(value: string): string {
  // "divination (scrying)" → "Scrying"; "teleportation" → "Teleportation"
  const parenMatch = value.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].trim().toLowerCase();
    if (SUBSCHOOL_CANON[inner]) return SUBSCHOOL_CANON[inner];
  }
  const lower = value.trim().toLowerCase();
  return SUBSCHOOL_CANON[lower] ?? value;
}

/**
 * The spell of `spells` (by lowercase name) a spell's text names `name`: by its name, its qualifiers moved after a
 * comma ("mass lesser vigor" → "Vigor, Mass Lesser"), or the end of its name ("interposing hand" → "Bigby's
 * Interposing Hand").
 */
function resolveBaseSpell(spells: Map<string, RawSpell>, name: string): RawSpell | undefined {
  const lower = name.toLowerCase();
  const qualified = lower.match(NAME_QUALIFIERS);
  return (
    spells.get(lower) ??
    (qualified ? spells.get(`${qualified[2]}, ${qualified[1].trim().replace(/\s+/g, " ")}`) : undefined) ??
    [...spells.values()].find((spell) => spell.name.toLowerCase().endsWith(` ${lower}`))
  );
}

function simplifyRange(range: string): string {
  // Strip leaked "Area/Effect/Target:" labels from upstream parser glitches
  // (e.g. "Touch Area/Effect/Target: Animal touched" → "Touch")
  const stripped = range.replace(/\s+(Area|Effect|Target)\/.*$/i, "").trim();
  if (stripped.startsWith("Close")) return "Close";
  if (stripped.startsWith("Medium")) return "Medium";
  if (stripped.startsWith("Long")) return "Long";
  return stripped;
}

/**
 * A spell's properties: its school, subschool and descriptors, casting time, range, target, effect and area, duration,
 * components. A field its source leaves empty (a range, a target, a duration…) gives none.
 */
function spellProperties(entry: RawSpell): Property[] {
  const properties: Property[] = [];
  properties.push({ type: SPELL_SCHOOL, value: entry.school });
  if (entry.subschool) properties.push({ type: SPELL_SUBSCHOOL, value: normalizeSubschool(entry.subschool) });
  for (const desc of entry.descriptors) properties.push({ type: SPELL_DESCRIPTOR, value: normalizeDescriptor(desc) });

  properties.push({
    type: SPELL_CASTING_TIME,
    value: normalizeSpellText(entry.castingTime || "1 standard action"),
  });
  const rangeValue = simplifyRange(normalizeSpellText(entry.range));
  if (rangeValue) properties.push({ type: SPELL_RANGE_TYPE, value: rangeValue });
  if (entry.target) properties.push({ type: SPELL_TARGET, value: normalizeSpellText(entry.target) });
  if (entry.effect) properties.push({ type: SPELL_EFFECT, value: normalizeSpellText(entry.effect) });
  if (entry.area) properties.push({ type: SPELL_AREA_OF_EFFECT, value: normalizeSpellText(entry.area) });
  const durationValue = normalizeSpellText(entry.duration);
  if (durationValue) properties.push({ type: SPELL_DURATION, value: durationValue });
  properties.push({
    type: SPELL_RESISTANCE,
    value: normalizeSpellResistance(normalizeSpellText(entry.spellResistance || "No")),
  });
  for (const compName of expandComponents(entry.components))
    properties.push({ type: SPELL_COMPONENT, value: compName });

  return properties;
}

/**
 * A spell with the fields its stat block leaves out taken from its base spell, the spell its text says it's written as
 * ("functions like X", "As X, except…": `findBaseSpell`), of `spells` (the spell's book's and the core rules', by
 * lowercase name): what its own stat block states stays. Follows the chain: e.g. Mass Charm Monster → Charm Monster →
 * Charm Person.
 */
function withBaseSpellFields(rawEntry: RawSpell, spells: Map<string, RawSpell>): RawSpell {
  let entry = rawEntry;
  if (!lacksFields(entry)) return entry;
  // Walk the chain of base spells up to 3 levels deep
  let current: RawSpell | undefined = entry;
  const visited = new Set<string>([entry.name]);
  for (let depth = 0; depth < 3 && current; depth++) {
    const base = findBaseSpell(current, spells, visited);
    if (!base) break;
    visited.add(base.name);

    const range = entry.range || base.range;
    // A spell only its caster is the target of ("Personal", not "Personal or touch") has no saving throw or spell
    // resistance line: it takes none from its base
    const personal = range.trim().toLowerCase() === "personal";
    entry = {
      ...entry,
      castingTime: entry.castingTime || base.castingTime,
      range,
      duration: entry.duration || base.duration,
      components: entry.components.length > 0 ? entry.components : base.components,
      // Only inherit target/area/effect if this spell has none at all
      ...(!entry.target && !entry.effect && !entry.area
        ? {
            target: base.target,
            effect: base.effect,
            area: base.area,
          }
        : {}),
      // Only inherit savingThrow/spellResistance if truly empty (not scraped)
      savingThrow: entry.savingThrow || (personal ? "" : base.savingThrow),
      spellResistance: entry.spellResistance || (personal ? "" : base.spellResistance),
    };
    // Continue walking if still missing fields
    if (!lacksFields(entry)) break;
    current = base;
  }
  return entry;
}

/**
 * A spell reference's detector: what each spell's text gives (`detected`: its properties and its saving throw,
 * normalized), its stat block's fields as its overrides correct them, those it leaves out taken from the spell it's
 * written as ("functions like", "As X, except…"), the book's or the core rules' (`coreRules`); and its description and
 * level entries, its overrides applied (`mapping`).
 */
export class SpellDetector extends BaseDetector<SpellReference> {
  constructor(
    stored: StoredReference<"spell">,
    private readonly coreRules: Pick<SpellReference, "overrides" | "raw">,
  ) {
    super(stored);
  }

  /** Each spell's properties and saving throw. */
  protected override detected(): SpellReference["detected"] {
    const spells = correctedSpells(this.stored);
    // The spells one can be written as, by lowercase name: the book's, then the core rules' it doesn't have
    const byName = new Map<string, RawSpell>();
    for (const entry of [...spells, ...correctedSpells(this.coreRules)]) {
      const name = entry.name.toLowerCase();
      if (!byName.has(name)) byName.set(name, entry);
    }

    const detected: SpellReference["detected"] = {};
    for (const corrected of spells) {
      const entry = withBaseSpellFields(corrected, byName);
      detected[entry.name] = {
        properties: spellProperties(entry),
        savingThrow: normalizeSpellText(entry.savingThrow || "None"),
      };
    }
    return detected;
  }

  /** Each spell's description and level entries, its overrides applied. */
  protected override mapping(): SpellReference["mapping"] {
    const { overrides, raw } = this.stored;
    return Object.fromEntries(
      raw.map((entry) => {
        const override = overrides?.[entry.name];
        return [
          entry.name,
          {
            description: override?.description ?? entry.description,
            levelEntries: [...entry.levelEntries, ...(override?.levelEntries ?? [])],
          },
        ];
      }),
    );
  }

  /** The reference with what's derived from it: its detected section and its mapping, its overrides as stored. */
  override resolve(): Resolved<SpellReference> {
    return { ...this.stored, detected: this.detected(), mapping: this.mapping() };
  }
}
