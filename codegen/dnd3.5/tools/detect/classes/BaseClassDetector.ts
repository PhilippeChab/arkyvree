import { BaseDetector } from "@/codegen/dnd3.5/tools/detect/BaseDetector.ts";
import { findWithPluralVariants } from "@/codegen/dnd3.5/tools/text/names.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import { stripSeparators } from "@/shared/text.ts";

import { ClassTable } from "./ClassTable.ts";

/** A class feature, as its page gives it. */
export type ClassFeature = ClassReference["raw"]["classFeatures"][number];

/** D&D type suffixes embedded in raw class feature names, e.g. "Tattoo (Su or Sp)" */
const TYPE_SUFFIX = /\s*\((?:Ex|Su|Sp|Su or Sp)\)$/i;

/** The class's features by name, lowercased, and without their type ("Rage (Ex)" is "rage (ex)" and "rage"). */
function featuresByName(features: ClassFeature[]): Map<string, ClassFeature> {
  const map = new Map<string, ClassFeature>();
  for (const cf of features) {
    map.set(cf.name.toLowerCase(), cf);
    const stripped = cf.name.replace(TYPE_SUFFIX, "").toLowerCase();
    if (stripped !== cf.name.toLowerCase()) map.set(stripped, cf);
  }
  return map;
}

/** Its page as stored, its alignment filled in from its overrides when the page names none. */
function withAlignment({ overrides, raw }: Pick<ClassReference, "overrides" | "raw">): ClassReference["raw"] {
  const scraped = structuredClone(raw);
  if (overrides?.alignment && !scraped.prerequisites.parsed.alignment)
    scraped.prerequisites.parsed.alignment = overrides.alignment;
  return scraped;
}

/**
 * A class reference's detector's core, which its concerns (`concerns/`) build on: the reference as stored, what its
 * page gives (`raw`, its alignment filled in from its overrides), and what several of its readings look up: its
 * features by name, and the features its table names, each with the levels it's at.
 */
export abstract class BaseClassDetector extends BaseDetector<ClassReference> {
  constructor(stored: Pick<ClassReference, "_meta" | "overrides" | "raw">) {
    super(stored);
    this.raw = withAlignment(stored);
    this.classSlug = stripSeparators(this.raw.name);
    this.table = new ClassTable(this.raw);
    this.featureOccurrences = this.table.featureOccurrences();
    this.features = featuresByName(this.raw.classFeatures);
  }

  /** The class's features by name (`featuresByName`). */
  private readonly features: Map<string, ClassFeature>;
  /** The class's slug, as its paths name it (`classes.wujen.level`). */
  readonly classSlug: string;
  /** The features the class's table names, each with the levels it's at. */
  readonly featureOccurrences: ClassReference["detected"]["featureOccurrences"];
  /** What the class's page gives, its alignment filled in from its overrides. */
  readonly raw: ClassReference["raw"];
  /** The class's table, read. */
  readonly table: ClassTable;

  /** The class feature a name means: its own, or its plural or singular ("Bonus Feat" for "Bonus Feats"). */
  findFeature(name: string): ClassFeature | undefined {
    return findWithPluralVariants(this.features, name);
  }
}
