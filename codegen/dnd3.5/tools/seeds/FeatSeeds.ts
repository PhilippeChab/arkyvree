import { normalizeName } from "@/codegen/dnd3.5/tools/text/names.ts";
import { normalizeDescription } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import type { FeatReference } from "@/codegen/dnd3.5/tools/types/feats.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/dnd3.5/builders/customization/types.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";

import { GrantText } from "./GrantText.ts";
import { ReferenceSeeds } from "./ReferenceSeeds.ts";

type FeatEntry = {
  entry: FeatReference["raw"][number];
  mapped: FeatReference["mapping"][string];
};

/** A template feat's family, which the generated code makes a feat of per item (weapon, skill, school…). */
export type TemplateFamily = {
  aptitudes: string[];
  description: string;
  familyName: string;
  featNameMap: Record<string, string>;
  modifiers: ModifierSeed[];
  /** The content's list its feats are made over, as the generated code names it (`ALL_WEAPONS`, `SKILL_NAMES`…). */
  options: string;
  /** Its feats require proficiency with their weapon (`proficiencyRequirements`). */
  proficient: boolean;
  requirements: RequirementEntry[];
  type: TemplateType;
};

/** The kind of item a template family makes a feat for. */
export type TemplateType = NonNullable<FeatReference["mapping"][string]["template"]>["type"];

/** The content's list a template family of each type is made over, as the generated code names it. */
const FAMILY_OPTIONS: Record<TemplateType, string> = {
  crossbow: "CROSSBOW_WEAPONS",
  school: "MAGIC_SCHOOLS",
  skill: "SKILL_NAMES",
  weapon: "ALL_WEAPONS",
};

/** The weapon families made over their own weapons, not every weapon: a proficiency's. */
const OWN_WEAPONS: Record<string, string> = { "Exotic Weapon Proficiency": "EXOTIC_WEAPONS" };

/** The weapon families whose feats require proficiency with their weapon (SRD: "Proficiency with weapon"). */
const PROFICIENT_FAMILIES = new Set(["Improved Critical", "Weapon Focus"]);

/**
 * What a feat reference makes: its feats by feat type (`byType`), and its template families (`templates`, a feat per
 * item of a family the generated code makes), but those its mapping skips (an epic feat, unless an override keeps it).
 */
export class FeatSeeds extends ReferenceSeeds<FeatReference> {
  /**
   * `requirements`, each check of a family by its own name (Daring Warrior's "Weapon Specialization"), which no feat
   * has, made a check of any of its feats. A count of a family by its name (a prestige class's "Sneak attack +2d6") is
   * the family's own: how many times the character has its feats, every class's sneak attack dice together.
   */
  static familyChecks(requirements: RequirementEntry[], families: Set<string>): RequirementEntry[] {
    const slugs = new Set([...families].map(stripSeparators));
    const anyOf = (entry: RequirementEntry): RequirementEntry => {
      if ("chainingOperator" in entry) return { ...entry, children: entry.children.map(anyOf) };
      const [, slug] = /^feats\.([^.]+)\.possessed$/.exec(entry.target) ?? [];
      return slug && slugs.has(slug) ? { ...entry, target: `feats.${slug}.*.possessed` } : entry;
    };
    return requirements.map(anyOf);
  }

  /** Its feats and template families, as scraped and as mapped: but those its mapping skips. */
  private kept(): FeatEntry[] {
    return this.memo("kept", () =>
      this.ref.raw.flatMap((entry) => {
        const mapped = this.ref.mapping[entry.name];
        return !mapped || mapped.skip ? [] : [{ entry, mapped }];
      }),
    );
  }

  /**
   * Its feats as the aptitude list reads them (names, aptitudes, modifiers): a template family once, as its feats share
   * their aptitudes and their modifiers only differ in the item they target.
   */
  aptitudeSources(): Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] {
    return [
      ...[...this.byType().values()].flat(),
      ...this.templates().map(({ familyName, aptitudes, modifiers }) => ({ name: familyName, aptitudes, modifiers })),
    ];
  }

  /** Its feats, by feat type, each check of a family by its own name made a check of any of its feats (\`familyChecks\`). */
  byType(): Map<string, FeatSeed[]> {
    return this.memo("byType", () => {
      const byType = new Map<string, FeatSeed[]>();
      for (const { entry, mapped } of this.kept()) {
        if (mapped.template) continue;
        const name = normalizeName(entry.name);
        const feats = byType.get(entry.featType) ?? [];
        byType.set(entry.featType, feats);
        feats.push({
          name,
          description: normalizeDescription(mapped.description ?? entry.benefit),
          ...(mapped.stackable ? { stackable: true } : {}),
          ...(mapped.selectable === false ? { selectable: false } : {}),
          aptitudes: mapped.aptitudes ?? [],
          requirements: this.book.familyChecks(mapped.requirements ?? []),
          modifiers: [
            ...(mapped.modifiers ?? []),
            ...new GrantText(name, mapped.description ?? entry.benefit ?? "").companionModifiers(),
          ],
          properties: mapped.properties ?? [],
        });
      }
      return byType;
    });
  }

  /** The names of its template families' feats. */
  templateNames(): Set<string> {
    return this.memo(
      "templateNames",
      () => new Set(this.kept().flatMap(({ entry, mapped }) => (mapped.template ? [entry.name] : []))),
    );
  }

  /** Its template families. */
  templates(): TemplateFamily[] {
    return this.memo("templates", () =>
      this.kept().flatMap(({ entry, mapped }) => {
        if (!mapped.template) return [];
        const { type, familyName } = mapped.template;
        return [
          {
            type,
            familyName,
            aptitudes: mapped.aptitudes ?? [],
            requirements: mapped.requirements ?? [],
            featNameMap: mapped.featNameMap ?? {},
            modifiers: mapped.modifiers ?? [],
            description: mapped.description ?? entry.benefit,
            options: OWN_WEAPONS[familyName] ?? FAMILY_OPTIONS[type],
            proficient: PROFICIENT_FAMILIES.has(familyName),
          },
        ];
      }),
    );
  }
}
