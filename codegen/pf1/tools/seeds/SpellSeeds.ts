import { SpellDetector } from "@/codegen/pf1/tools/detect/spells/SpellDetector.ts";
import type { SpellEntry, SpellReference } from "@/codegen/pf1/tools/types/spells.ts";
import type { LeveledSpellSeed } from "@/content/pf1/builders/spells/types.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { SPELL_SAVE_EFFECT } from "@/vocabulary/pf1/fields/index.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";

import { Memos } from "./Memos.ts";

/** A spell's corrections made by hand: its stat block's texts by label, and its description. */
interface SpellOverride {
  description?: string;
  fields?: Record<string, string>;
}

/** A saving throw that allows none: "none", and the "no" a few pages write. */
const NO_SAVING_THROW = /^(?:none|no)$/i;

/** A saving throw that opens on a save's name ("Will negates"): the save, and the rest, what a successful one does. */
const SAVING_THROW = new RegExp(`^(${SAVE_NAMES.join("|")})\\s+(.+)$`);

/** A spell's override, as its reference stores it (`overrides[name]`): what of it is a correction. */
function readOverride(value: unknown): SpellOverride {
  if (!isRecord(value)) return {};
  const fields = readTexts(value.fields);
  return {
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(fields ? { fields } : {}),
  };
}

/** The texts of `value` (an override's fields), by label: those that are text. */
function readTexts(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/**
 * A spell reference's seeds (`seeds`), sorted by level, then name: each read from its page (`SpellDetector`) as its
 * override corrects it, on the Core Rulebook's classes' spell lists its level line names, filed at its lowest level on
 * them. What a spell's page gives that no reading takes is what's left to review in its level's file (`reviewNotes`);
 * what the Core Rulebook has none of, later books' classes and descriptors, is left out (`leftOut`).
 */
export class SpellSeeds {
  constructor(readonly ref: SpellReference) {}

  /**
   * A saving throw as what a successful save does (its `SPELL_SAVE_EFFECT`) and the save it is (its `resistedBy` link,
   * by the save's name, one of the vocabulary's: `SAVE_NAMES`): "Will negates" is Will, "negates". Text that opens on
   * no save's name ("see text", "none or Will negates") is all effect, with no link, so a seed never names a save the
   * seeder would refuse; "none" is neither. Two saves ("Will negates; Fortitude half") are the first's, the rest its
   * effect.
   */
  static readSavingThrow(savingThrow: string): Pick<LeveledSpellSeed, "fields" | "links"> {
    if (!savingThrow || NO_SAVING_THROW.test(savingThrow)) return { fields: {} };
    const match = savingThrow.match(SAVING_THROW);
    if (!match) return { fields: { [SPELL_SAVE_EFFECT]: savingThrow } };
    return { fields: { [SPELL_SAVE_EFFECT]: match[2] }, links: { resistedBy: match[1] } };
  }

  /**
   * Refuses two spells with the same description and Level line: one read off another's section of a page that prints
   * several (Summon Monster I to IX's), which would file it at the other's levels.
   */
  static refuseCopies(entries: SpellEntry[]): void {
    const read = new Map<string, string>();
    for (const { description, fields, name } of entries) {
      const key = JSON.stringify([description, fields.Level ?? ""]);
      const copied = read.get(key);
      if (copied !== undefined) throw new Error(`Spells "${copied}" and "${name}" have the same description and Level`);
      read.set(key, name);
    }
  }

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /** A spell's page as its override corrects it: its stat block's texts and its description replaced. */
  private corrected(entry: SpellEntry): SpellEntry {
    const override = readOverride(this.ref.overrides?.[entry.name]);
    return {
      ...entry,
      description: override.description ?? entry.description,
      fields: { ...entry.fields, ...override.fields },
    };
  }

  /** Each spell's page read, as its override corrects it: two spells read alike refused (`refuseCopies`). */
  private detectors(): SpellDetector[] {
    return this.memos.of("detectors", () => {
      const entries = this.ref.raw.map((entry) => this.corrected(entry));
      SpellSeeds.refuseCopies(entries);
      return entries.map((entry) => new SpellDetector(entry));
    });
  }

  /**
   * A spell's seed: on each Core Rulebook class's spell list its level line names, at its level on it (`aptitudeLevels`
   * where they differ), filed at the lowest (0 when it's on none, which its notes say).
   */
  private seed(detector: SpellDetector): LeveledSpellSeed {
    const aptitudeLevels = detector.aptitudeLevels();
    const levels = Object.values(aptitudeLevels);
    const level = levels.length > 0 ? Math.min(...levels) : 0;
    const save = SpellSeeds.readSavingThrow(detector.savingThrow());
    return {
      name: detector.name(),
      description: detector.description(),
      aptitudes: Object.keys(aptitudeLevels).sort(),
      ...(levels.some((other) => other !== level) ? { aptitudeLevels } : {}),
      fields: { ...detector.fields(), ...save.fields },
      ...(save.links && { links: save.links }),
      level,
    };
  }

  /**
   * What its spells' pages give that the Core Rulebook has none of, each once, sorted: the classes their level lines
   * name, and the descriptors their school lines give (later books', and pointers to their text).
   */
  leftOut(): { classes: string[]; descriptors: string[] } {
    const detectors = this.detectors();
    return {
      classes: [...new Set(detectors.flatMap((detector) => detector.otherClasses()))].sort(),
      descriptors: [...new Set(detectors.flatMap((detector) => detector.leftOutDescriptors()))].sort(),
    };
  }

  /** What's left to review of the spells filed at `level`: each what its page gives that no reading takes. */
  reviewNotes(level: number): string[] {
    return this.detectors()
      .filter((detector) => this.seed(detector).level === level)
      .flatMap((detector) => detector.unread().map((unread) => `${detector.name()}: ${unread}`))
      .sort();
  }

  /** Its spells, each at its level, on the spell lists its level line names: sorted by level, then name. */
  seeds(): LeveledSpellSeed[] {
    return this.memos.of("seeds", () =>
      this.detectors()
        .map((detector) => this.seed(detector))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    );
  }
}
