import { existsSync } from "node:fs";

import { BonusFeatTiers } from "@/codegen/pf1/tools/detect/classes/BonusFeatTiers.ts";
import { type ClassBook, ClassDetector } from "@/codegen/pf1/tools/detect/classes/ClassDetector.ts";
import type { ClassFeature } from "@/codegen/pf1/tools/detect/classes/ClassFeatures.ts";
import References from "@/codegen/pf1/tools/references/References.ts";
import { APTITUDE_PICKS, LATER_GRANTS, TIERED_POOLS } from "@/codegen/pf1/tools/terms/classes.ts";
import type { ClassReference } from "@/codegen/pf1/tools/types/classes.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { ClassSeed } from "@/content/pf1/builders/classes/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { CLASS_FEATURE_FAMILIES } from "@/vocabulary/pf1/feats.ts";
import {
  CLASS_CASTER_TYPE,
  CLASS_HD,
  FEAT_FAMILY,
  FEAT_SELECTABLE,
  FEAT_STACKABLE,
} from "@/vocabulary/pf1/fields/index.ts";

/** A class's features, as its seed lists them and as the feats they are. */
interface Features {
  classFeatures: [number, string][];
  feats: FeatSeed[];
  freeFeats: [number, string, string][];
}

/** What a page's text says of the site, not of the rules: its notes, and its links ("can be found here"). */
const SITE_TEXT = [/\s*Note from Nethys:.*$/, /\s*[^.]*\b(?:can be found|is available|is provided) here\./g];

/** A feature's rules as a feat's description: its page's notes on the site left out. */
function describe(feature: ClassFeature): string {
  const text = SITE_TEXT.reduce((rules, site) => rules.replace(site, ""), feature.text).trim();
  return text || feature.name;
}

/** The family of class features a feature is in, as the vocabulary names it ("Lay on Hands"): none for most. */
function familyOf(name: string): string | undefined {
  return CLASS_FEATURE_FAMILIES.find((family) => family.toLowerCase() === name.toLowerCase());
}

/** A book's feats' names and its spell lists' cantrips, from its references: what a class's detection reads. */
function readBook(book: string): ClassBook {
  const featsPath = References.path(book, "feat");
  const spellsPath = References.path(book, "spell");
  const feats = existsSync(featsPath) ? References.load(featsPath, "feat").raw.map(({ name }) => name) : [];
  const spells = existsSync(spellsPath) ? References.load(spellsPath, "spell").raw : [];
  return {
    feats: new Set(feats),
    cantrips: (className) => {
      const level = new RegExp(`\\b${className.toLowerCase()} 0\\b`);
      return spells.filter(({ fields }) => level.test(fields.Level ?? "")).length;
    },
  };
}

/**
 * A class reference's seeds: its class's seed, the feats its features are (`classFeats`), and its bonus feat lists that
 * name their feats (`bonusFeatLists`: a monk's, a ranger's combat style's, a pool a tier), whose aptitude the generator
 * adds to each feat it names. Its page is read by its detector (`ClassDetector`).
 */
export class ClassSeeds {
  constructor(readonly ref: ClassReference) {
    this.detector = new ClassDetector(ref, readBook(ref._meta.book));
    this.aptitude = `${this.detector.name} Class Feature`;
    this.features = this.readFeatures();
  }

  /** The pool its features are feats of: "Fighter Class Feature". */
  private readonly aptitude: string;
  /** Its page, read. */
  private readonly detector: ClassDetector;
  /** Its features, as its seed lists them and as feats. */
  private readonly features: Features;

  /** The feat advancing its spellcasting, which a prestige class's caster levels pick: none for a class without spells. */
  private advanceFeats(): FeatSeed[] {
    const { detector } = this;
    const casterType = detector.casterType();
    if (!detector.spells() || !casterType) return [];
    return [
      {
        name: `Advance ${detector.name} Spellcasting`,
        description: `Your effective ${detector.name} caster level increases by 1, granting additional spell slots and spells per day as if you had gained a level in ${detector.name}.`,
        aptitudes: [`Bonus ${casterType} Caster Level`, "Bonus Caster Level"],
        requirements: [gte(`classes.${detector.slug}.level`, 1)],
        modifiers: [bonus(`classes.${detector.slug}.bonuscasterlevel`, 1)],
        fields: { [FEAT_STACKABLE]: true },
      },
    ];
  }

  /** A feature's feat, named after its class: its rules, what it gives, whether it stacks and its family. */
  private featureFeat(name: string, feature: ClassFeature, modifiers: FeatSeed["modifiers"], levels: number): FeatSeed {
    const family = familyOf(feature.name);
    return {
      name,
      description: describe(feature),
      aptitudes: [this.aptitude],
      ...(modifiers?.length ? { modifiers } : {}),
      fields: {
        [FEAT_SELECTABLE]: false,
        ...(levels > 1 ? { [FEAT_STACKABLE]: true } : {}),
        ...(family ? { [FEAT_FAMILY]: [family] } : {}),
      },
    };
  }

  /** The feat `feat` granted at each of `levels`, in its class's features' pool, as its seed's free feats list it. */
  private grants(levels: number[], feat: string): [number, string, string][] {
    return levels.map((level) => [level, feat, this.aptitude]);
  }

  /** A feature of its own read into `read`: its feat at its levels, and the feats it grants. */
  private readFeature(feature: ClassFeature, read: Features) {
    const name = `${feature.name} (${this.detector.name})`;
    read.feats.push(this.featureFeat(name, feature, this.detector.modifiers.of(feature), feature.levels.length));
    read.classFeatures.push(...feature.levels.map((level): [number, string] => [level, name]));
    const granted = [...feature.text.matchAll(/gains? (?:the )?([A-Z][\w' -]+?) as a bonus feat\b/g)].map((m) => m[1]);
    for (const feat of granted.filter((grant) => this.detector.book.feats.has(grant)))
      read.freeFeats.push(...this.grants([feature.levels[0]], feat));
    const later = LATER_GRANTS.find(
      (grant) => grant.className === this.detector.name && grant.feature === feature.name,
    );
    if (later) read.freeFeats.push(...this.grants(feature.levels.slice(1), later.feat));
  }

  /**
   * Its features read: a feature named as a feat its book holds, and no ability of its own ("Scribe Scroll"), is that
   * feat granted; a pool that names its feats by tiers (`TIERED_POOLS`) is a feat a tier; any other is a feat of its
   * own, with the feats its text grants ("gains Stunning Fist as a bonus feat") and those its later levels do
   * (`LATER_GRANTS`).
   */
  private readFeatures(): Features {
    const read: Features = { classFeatures: [], feats: [], freeFeats: [] };
    const { feats } = this.detector.book;
    for (const feature of this.detector.features.all()) {
      const tiers = this.tiersOf(feature);
      if (tiers) this.readTiers(tiers, read);
      else if (!feature.ability && feats.has(feature.name))
        read.freeFeats.push(...this.grants(feature.levels, feature.name));
      else this.readFeature(feature, read);
    }
    read.classFeatures.sort(([a, x], [b, y]) => a - b || x.localeCompare(y));
    return read;
  }

  /** A pool's tiers read into `read`: a feat a tier, each adding a pick in its tier's pool, at the levels it picks at. */
  private readTiers(tiers: BonusFeatTiers, read: Features) {
    for (const tier of tiers.tiers) {
      const levels = tiers.feature.levels.filter((level) => tiers.tierAt(level) === tier);
      const name = tiers.featureOf(tier, this.detector.name);
      const modifiers = [bonus(`aptitudes.${stripSeparators(tiers.aptitudeOf(tier))}.allowed`, 1)];
      read.feats.push(this.featureFeat(name, tiers.feature, modifiers, levels.length));
      read.classFeatures.push(...levels.map((level): [number, string] => [level, name]));
    }
  }

  /** A feature's pool's tiers, when it's a pool that names its feats by tiers (`TIERED_POOLS`). */
  private tiersOf(feature: ClassFeature): BonusFeatTiers | undefined {
    const pool = TIERED_POOLS.find((p) => p.className === this.detector.name && p.feature === feature.name);
    return pool && new BonusFeatTiers(feature, pool.aptitude, pool.feats);
  }

  /** Its bonus feat lists that name their feats: each tier's pool, and its feats. */
  bonusFeatLists(): { aptitude: string; feats: string[] }[] {
    return this.detector.features
      .all()
      .map((feature) => this.tiersOf(feature))
      .filter((tiers) => tiers !== undefined)
      .flatMap((tiers) => tiers.tiers.map((tier) => ({ aptitude: tiers.aptitudeOf(tier), feats: tier.feats })));
  }

  /**
   * The feats its class features are, those a bond's choice is picked between, and the one advancing its spellcasting,
   * by name.
   */
  classFeats(): FeatSeed[] {
    const bondChoices = this.detector.modifiers.bondChoices(this.detector.features.all());
    return [...this.features.feats, ...bondChoices, ...this.advanceFeats()].toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Its class's seed: its name and description, hit die, caster type and levels, skill points, progressions, class
   * skills, requirements, caster level advancement, features, the feats it grants, spells and its levels' modifiers.
   */
  seed(): ClassSeed {
    const { detector, ref } = this;
    const { classFeatures, freeFeats } = this.features;
    const casterType = detector.casterType();
    const bonusSpellAbility = detector.bonusSpellAbility();
    const spells = detector.spells();
    const casterLevelAdvancement = detector.casterLevelAdvancement();
    const modifiers = detector.modifiers.levelModifiers(detector.features.all());
    const aptitudePicks = APTITUDE_PICKS.filter(({ className }) => className === detector.name).map(
      ({ aptitude, levels }) => ({ levels, target: `aptitudes.${stripSeparators(aptitude)}.allowed` }),
    );
    const requirements = detector.requirements.all();
    return {
      name: detector.name,
      description:
        ref.overrides?.description ??
        `A ${ref.raw.prestige ? "prestige " : ""}class of d${detector.hitDie()} hit dice.`,
      fields: { [CLASS_HD]: detector.hitDie(), ...(spells && casterType ? { [CLASS_CASTER_TYPE]: casterType } : {}) },
      levels: detector.table.levels(),
      skillPoints: detector.skillPoints(),
      bab: detector.table.bab(),
      saves: detector.table.saves(),
      classSkills: detector.skills.names(),
      ...(requirements.length > 0 ? { requirements } : {}),
      ...(casterLevelAdvancement ? { casterLevelAdvancement } : {}),
      classFeatureAptitude: this.aptitude,
      ...(classFeatures.length > 0 ? { classFeatures } : {}),
      ...(freeFeats.length > 0 ? { freeFeats } : {}),
      ...(spells && bonusSpellAbility ? { links: { bonusSpellAbility } } : {}),
      ...(spells ? { spells } : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(aptitudePicks.length > 0 ? { aptitudePicks } : {}),
    };
  }

  /** What its page gives that no reading takes: its table's entries, skills, requirements and proficiencies. */
  unread(): string[] {
    return this.detector.unread();
  }
}
