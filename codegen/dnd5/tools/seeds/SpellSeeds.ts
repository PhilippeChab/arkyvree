import { readComponents, readSpellSave } from "@/codegen/dnd5/tools/detect/spells.ts";
import { normalizeText } from "@/codegen/dnd5/tools/detect/text.ts";
import type { SpellEntry, SpellReference } from "@/codegen/dnd5/tools/types/spells.ts";
import { classSpells } from "@/content/dnd5/builders/aptitudes/names.ts";
import type { LeveledSpellSeed } from "@/content/dnd5/builders/spells/types.ts";
import {
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_CONCENTRATION,
  SPELL_DURATION,
  SPELL_MATERIAL,
  SPELL_RANGE,
  SPELL_RITUAL,
  SPELL_SCHOOL,
} from "@/vocabulary/dnd5/fields/index.ts";
import { SPELL_SCHOOLS } from "@/vocabulary/dnd5/spells.ts";

import { Memos } from "./Memos.ts";

/**
 * A spell reference's seeds (`seeds`), sorted by level, then name: each read off its entry as its override corrects
 * it, listed in the spell list of each class its entry names, at its level (a pool that draws from a list, a
 * warlock's Mystic Arcanum, lists none: `ClassSeed.spells.drawnBy`); its fields its stat block's (its school,
 * casting time, range, components and material, duration, whether it's a ritual or takes concentration), and the
 * saving throw its text calls for first its `resistedBy` link. Its description is its text, then what a higher slot or
 * a higher character level adds ("Using a Higher-Level Spell Slot.", a cantrip's "Cantrip Upgrade.").
 */
export class SpellSeeds {
  constructor(readonly ref: SpellReference) {}

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /** A spell's description: its text, then what a higher slot adds, under the heading the SRD gives it. */
  private description({ description, higher_level, level }: SpellEntry): string {
    if (!higher_level) return normalizeText(description);
    const heading = level === 0 ? "Cantrip Upgrade." : "Using a Higher-Level Spell Slot.";
    return normalizeText(`${description}\n${heading} ${higher_level}`);
  }

  /** A spell's seed: its lists, its fields, the save it calls for, its level. */
  private seed(entry: SpellEntry): LeveledSpellSeed {
    const school = SPELL_SCHOOLS.find((name) => name === entry.school.name);
    if (!school) throw new Error(`${entry.name}: no school is "${entry.school.name}"`);
    const save = readSpellSave(entry.description);
    return {
      name: entry.name,
      description: this.description(entry),
      aptitudes: entry.classes.map(({ name }) => classSpells(name)).sort(),
      fields: {
        [SPELL_SCHOOL]: school,
        [SPELL_CASTING_TIME]: entry.casting_time,
        [SPELL_RANGE]: entry.range,
        [SPELL_COMPONENT]: readComponents(entry.components),
        ...(entry.material ? { [SPELL_MATERIAL]: entry.material } : {}),
        [SPELL_DURATION]: entry.duration,
        [SPELL_RITUAL]: entry.ritual,
        [SPELL_CONCENTRATION]: entry.concentration,
      },
      ...(save ? { links: { resistedBy: save } } : {}),
      level: entry.level,
    };
  }

  /** The classes whose spell lists its spells name, each once, sorted. */
  classes(): string[] {
    return [...new Set(this.ref.raw.flatMap(({ classes }) => classes.map(({ name }) => name)))].sort();
  }

  /** Its spells, each at its level, in its classes' lists: sorted by level, then name. */
  seeds(): LeveledSpellSeed[] {
    return this.memos.of("seeds", () =>
      this.ref.raw
        .map((entry) => this.seed({ ...entry, ...this.ref.overrides?.[entry.name] }))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    );
  }
}
