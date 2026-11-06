import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { FAMILY_OPTIONS, OPTION_MENTIONS } from "@/codegen/pf1/tools/terms/featOptions.ts";
import type { FeatEntry } from "@/codegen/pf1/tools/types/feats.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { FeatFields } from "@/content/pf1/builders/feats/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { FEAT_FAMILIES, GENERAL_FEATS_APTITUDE } from "@/vocabulary/pf1/feats.ts";
import { FEAT_FAMILY, FEAT_STACKABLE, FEAT_WEAPON_FINESSE } from "@/vocabulary/pf1/fields/index.ts";

import { BenefitModifiers } from "./BenefitModifiers.ts";
import { FeatPrerequisites } from "./FeatPrerequisites.ts";

/** A feat as its page is read: what its seed holds, the family it leads, and what's left to review in it. */
export interface DetectedFeat {
  aptitudes: string[];
  /** Its Benefit; a family's names the option taken `OPTION` where its text names it. */
  description: string;
  /** The family of feats taken for an option it leads (Weapon Focus), whose feats its generated code makes per option. */
  family?: string;
  /** The feats its prerequisites name, by their slugs: a family's, which its generated code names the option's of. */
  featNames: Record<string, string>;
  fields: FeatFields;
  modifiers: ModifierSeed[];
  name: string;
  /** What's left to review: its prerequisites and benefits no reading takes. */
  notes: string[];
  /** Its prerequisites ask proficiency with the weapon it's taken for. */
  proficient: boolean;
  requirements: RequirementEntry[];
}

/** The aptitude of the fighter's bonus feats: every combat feat. */
const FIGHTER_BONUS_FEAT = "Fighter Bonus Feat";

/**
 * The feats a character can take more than once that their Special doesn't say so of: Extra Channel, whose uses add up
 * as every Extra feat's do.
 */
const REPEATABLE_FEATS = new Set(["Extra Channel"]);

/** The aptitude of the wizard's bonus feats: every item creation and metamagic feat, and Spell Mastery. */
const WIZARD_BONUS_FEAT = "Wizard Bonus Feat";

/** The feat the wizard's bonus feats list besides their types' (`WIZARD_TYPES`). */
const WIZARD_FEAT = "Spell Mastery";

/** The types of feat whose feats are the wizard's bonus feats. */
const WIZARD_TYPES = ["Item Creation", "Metamagic"];

/** The text of a feat's section labelled `label`, its whitespace normalized. */
function sectionOf(entry: FeatEntry, label: string): string | undefined {
  const text = entry.sections.find((section) => section.label === label)?.text;
  return text === undefined ? undefined : normalizeWs(text);
}

/**
 * A feat of the Core Rulebook, read from its page: its aptitudes (General, as every feat a level-up can pick, and the
 * fighter's and the wizard's bonus feats' by its types), its description (its Benefit), its requirements (its
 * Prerequisites, `FeatPrerequisites`), its modifiers (its Benefit's plain bonuses, `BenefitModifiers`), its fields (its
 * types' families, whether it's taken more than once, whether it finesses its weapons), and the family it leads, if
 * any, whose feats are made per option.
 */
export class FeatDetector {
  constructor(entry: FeatEntry, bookFeats: ReadonlySet<string>) {
    this.entry = entry;
    this.bookFeats = bookFeats;
    this.family = FAMILY_OPTIONS[entry.name] ? entry.name : undefined;
  }

  /** The book's feats, by their titles. */
  private readonly bookFeats: ReadonlySet<string>;
  /** The feat's page. */
  private readonly entry: FeatEntry;
  /** The family of feats taken for an option it leads, if any. */
  readonly family: string | undefined;

  /** General, and the fighter's and wizard's bonus feats' by its types. */
  private aptitudes(): string[] {
    const { name, types } = this.entry;
    return [
      GENERAL_FEATS_APTITUDE,
      ...(types.includes("Combat") ? [FIGHTER_BONUS_FEAT] : []),
      ...(types.some((type) => WIZARD_TYPES.includes(type)) || name === WIZARD_FEAT ? [WIZARD_BONUS_FEAT] : []),
    ];
  }

  /** Its Benefit, a family's naming the option taken (`OPTION_MENTIONS`) where its kind's text names it. */
  private description(): string {
    const benefit = sectionOf(this.entry, "Benefit") ?? "";
    const mention = this.family && OPTION_MENTIONS[FAMILY_OPTIONS[this.family].kind];
    return mention ? benefit.replace(mention.pattern, mention.written) : benefit;
  }

  /**
   * Its fields: its types' families (`FEAT_FAMILIES`); taken more than once ("You can gain this feat multiple times"),
   * but a family's feat, which is one per option; finessing its weapons ("you may use your Dexterity modifier instead
   * of your Strength modifier on attack rolls").
   */
  private fields(): FeatFields {
    const special = sectionOf(this.entry, "Special") ?? "";
    const families = this.entry.types.filter((type) => isOneOf(type, FEAT_FAMILIES));
    const repeatable = /\bmultiple times\b/.test(special) || REPEATABLE_FEATS.has(this.entry.name);
    const finesse = /\buse your Dexterity modifier instead of your Strength modifier on attack rolls\b/.test(
      sectionOf(this.entry, "Benefit") ?? "",
    );
    return {
      ...(repeatable && !this.family ? { [FEAT_STACKABLE]: true } : {}),
      ...(families.length > 0 ? { [FEAT_FAMILY]: families } : {}),
      ...(finesse ? { [FEAT_WEAPON_FINESSE]: true } : {}),
    };
  }

  /** The feat, read. */
  detect(): DetectedFeat {
    const { name } = this.entry;
    const prerequisites = new FeatPrerequisites(sectionOf(this.entry, "Prerequisites"), {
      bookFeats: this.bookFeats,
      family: this.family,
    });
    const benefit = new BenefitModifiers(sectionOf(this.entry, "Benefit") ?? "");
    return {
      name,
      description: this.description(),
      aptitudes: this.aptitudes(),
      requirements: prerequisites.requirements,
      modifiers: benefit.modifiers,
      fields: this.fields(),
      ...(this.family ? { family: this.family } : {}),
      featNames: prerequisites.featNames,
      proficient: prerequisites.proficient,
      notes: [
        ...prerequisites.unresolved.map((part) => `${name}: prerequisite "${part}" not read`),
        ...prerequisites.partlyRead.map((note) => `${name}: prerequisite ${note}`),
        ...prerequisites.errors.map((error) => `${name}: prerequisite ${error}`),
        ...benefit.unresolved.map((sentence) => `${name}: benefit "${sentence}" not read`),
      ],
    };
  }
}
