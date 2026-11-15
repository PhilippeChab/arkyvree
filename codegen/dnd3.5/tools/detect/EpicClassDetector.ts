import { NUMBER_WORDS } from "@/codegen/dnd3.5/tools/terms/numbers.ts";
import { stripOrdinalPrefix } from "@/codegen/dnd3.5/tools/text/names.ts";
import type { ClassReferenceFile } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type {
  EpicClassEntry,
  EpicClassFields,
  EpicClassReference,
  EpicFeature,
} from "@/codegen/dnd3.5/tools/types/epicClasses.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";

import { BaseDetector } from "./BaseDetector.ts";

/** The levels of a table's entries of a feature, by what each entry names. */
type Occurrences = Map<string, number[]>;

/** A table's entry of a bonus feat, the class's own pool's. */
const BONUS_FEAT = /^bonus feat$/i;

/** A paragraph's pattern: "every four levels", "every three levels higher than 18th". */
const EVERY = /every (\w+) levels/i;

/** A list's sentences after its feats ("In addition to the feats on this list, …"), which aren't feats. */
const LIST_END = /\.\s+[A-Z].*$|\.$/;

/** What a table's entry gives past its feature's name: its number ("Rage 7/day", "Trap sense +8", "Sneak attack +11d6"). */
const VALUE = /\s*(?:[+\d].*)?$/;

/**
 * The SRD's epic class progressions' detector: what each class's table and paragraphs give (`detected`), read against
 * its core class's features (`core`): each entry of its Special column a feature of its core class whose pattern goes
 * on (its first level past 20th, and every so many levels after: its table's spacing, or its paragraph's "every four
 * levels" when the table shows it once), its bonus feats' pattern, and its bonus feat list's feats; and each class as
 * the seeds make it (`mapping`), to the last class level (`MAX_CLASS_LEVEL`), its overrides applied.
 */
export class EpicClassDetector extends BaseDetector<EpicClassReference> {
  constructor(
    stored: Pick<EpicClassReference, "_meta" | "overrides" | "raw">,
    private readonly core: ClassReferenceFile[],
  ) {
    super(stored);
  }

  /** The levels each entry of a class's table names, by its feature's name ("Rage 7/day": rage). */
  private static occurrences(entry: EpicClassEntry): Occurrences {
    const occurrences: Occurrences = new Map();
    for (const { level, special } of entry.table) {
      for (const written of special) {
        const name = stripOrdinalPrefix(written).replace(VALUE, "").trim().toLowerCase();
        occurrences.set(name, [...(occurrences.get(name) ?? []), level]);
      }
    }
    return occurrences;
  }

  /** The feature's paragraph's "every so many levels", by the feature's name in it ("Barbarian Rage", "Smite Evil"). */
  private static paragraphSpacing(entry: EpicClassEntry, name: string): number | undefined {
    const paragraph = entry.features.find((feature) => feature.name.toLowerCase().includes(name.toLowerCase()));
    const word = paragraph?.description.match(EVERY)?.[1]?.toLowerCase();
    return word === undefined ? undefined : (NUMBER_WORDS[word] ?? (Number(word) || undefined));
  }

  /** A pattern of an entry's levels: its first, and its spacing (the table's, else its paragraph's). */
  private static pattern(entry: EpicClassEntry, name: string, levels: number[]) {
    const every = EpicClassDetector.spacing(levels) ?? EpicClassDetector.paragraphSpacing(entry, name);
    return every === undefined ? undefined : { first: levels[0], every };
  }

  /** A pattern's spacing in the levels it shows, or none when they don't keep one, or show it once. */
  private static spacing(levels: number[]): number | undefined {
    if (levels.length < 2) return undefined;
    const every = levels[1] - levels[0];
    return levels.every((level, i) => i === 0 || level - levels[i - 1] === every) ? every : undefined;
  }

  /** Each class's detected section. */
  protected override detected(): EpicClassReference["detected"] {
    return Object.fromEntries(this.stored.raw.map((entry) => [entry.name, this.detect(entry)]));
  }

  /** Each class as the seeds make it: its detected patterns, its overrides applied. */
  protected override mapping(detected: EpicClassReference["detected"]): EpicClassReference["mapping"] {
    const overrides = this.stored.overrides ?? {};
    const mapping: Record<string, EpicClassFields> = {};
    for (const entry of this.stored.raw) {
      const det = detected[entry.name];
      const ovr = overrides[entry.name];
      const bonusParagraph = entry.features.find((feature) => feature.name === "Bonus Feats")?.description ?? "";
      mapping[entry.name] = {
        classFeatureAptitude: `${entry.name} Class Feature`,
        features: ovr?.features ?? det.features,
        bonusFeats: ovr?.bonusFeats ?? {
          feature: `Epic Bonus Feat (${entry.name})`,
          description: bonusParagraph,
          first: det.bonusFeats?.first ?? MAX_CLASS_LEVEL + 1,
          every: det.bonusFeats?.every ?? 1,
        },
        bonusFeatList: ovr?.bonusFeatList ?? { aptitude: `Epic ${entry.name} Bonus Feat`, feats: det.feats },
        ...(ovr?.joins ? { joins: ovr.joins } : {}),
        ...(ovr?.skip ? { skip: true } : {}),
      };
    }
    return mapping;
  }

  /** The names of a core class's features, by their lowercase name ("trap sense": Trap Sense). */
  private coreFeatures(className: string): Map<string, string> {
    const ref = this.core.find((file) => file.ref.raw.name === className)?.ref;
    return new Map((ref?.raw.classFeatures ?? []).map((feature) => [feature.name.toLowerCase(), feature.name]));
  }

  /** What a class's table and paragraphs give: its features' patterns, its bonus feats', its list's feats. */
  private detect(entry: EpicClassEntry): EpicClassReference["detected"][string] {
    const core = this.coreFeatures(entry.name);
    const features: EpicFeature[] = [];
    const unresolved: string[] = [];
    let bonusFeats: Omit<EpicFeature, "feature"> | undefined;
    for (const [name, levels] of EpicClassDetector.occurrences(entry)) {
      const pattern = EpicClassDetector.pattern(entry, name, levels);
      const feature = core.get(name);
      if (!pattern) unresolved.push(`${name}: no pattern in levels ${levels.join(", ")}`);
      else if (BONUS_FEAT.test(name)) bonusFeats = pattern;
      else if (feature) features.push({ feature: `${feature} (${entry.name})`, ...pattern });
      else unresolved.push(`${name}: no feature of the ${entry.name} has this name`);
    }
    const feats = entry.bonusFeatList
      .replace(LIST_END, "")
      .split(",")
      .map((feat) => feat.trim())
      .filter(Boolean);
    return {
      features,
      feats,
      ...(bonusFeats ? { bonusFeats } : {}),
      ...(unresolved.length > 0 ? { unresolved } : {}),
    };
  }
}
