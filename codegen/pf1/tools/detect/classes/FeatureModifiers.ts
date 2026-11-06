import { BOND_FEATURES, type BondFeature, FEAT_TYPE_POOLS } from "@/codegen/pf1/tools/terms/classes.ts";
import { bonus, setFlag, setStr } from "@/content/core/builders/customization/modifiers.ts";
import { eqStr, gte } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { CLERIC_DOMAIN, DOMAIN_SPELLS } from "@/content/pf1/builders/aptitudes/names.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { grantLanguage, languagePick } from "@/content/pf1/builders/languages/knowledge.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { BONDED_KIND_BY_SLUG } from "@/vocabulary/pf1/bondedKinds.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

import type { ClassFeature } from "./ClassFeatures.ts";
import { ClassProficiencies } from "./ClassProficiencies.ts";
import type { ClassTable } from "./ClassTable.ts";

/** A class level's modifier: what it gives from its level on. */
export type LevelModifier = ModifierSeed & { level: number };

/** The skills by their name, lowercased. */
const SKILLS_BY_NAME = new Map<string, string>(SKILL_NAMES.map((name) => [name.toLowerCase(), name]));

/** Wearing no armor, carrying no shield and a light load: what a monk's AC bonus asks. */
const UNARMORED: RequirementEntry[] = [
  eqStr("combat.armor.category", "none"),
  { target: "combat.shield.held", operator: "equal", value: "false", valueType: "boolean" },
  eqStr("combat.encumbrance.load", "light"),
];

/** Wearing no heavy armor and carrying no heavy load: what a barbarian's fast movement asks. */
const UNBURDENED: RequirementEntry[] = [
  { target: "combat.armor.category", operator: "not_equal", value: "heavy", valueType: "string" },
  { target: "combat.encumbrance.load", operator: "not_equal", value: "heavy", valueType: "string" },
  { target: "combat.encumbrance.load", operator: "not_equal", value: "overloaded", valueType: "string" },
];

/** Wearing no armor and carrying a light load: what a monk's fast movement asks. */
const UNENCUMBERED: RequirementEntry[] = [
  eqStr("combat.armor.category", "none"),
  eqStr("combat.encumbrance.load", "light"),
];

/** An ability's bonus (if any) as a formula: `{{ max(0, [abilities.wisdom.modifier]) }}`. */
function abilityBonus(ability: string): string {
  return `{{ max(0, [abilities.${ability}.modifier]) }}`;
}

/** A number of its table's columns at each level ("+1", "+10 ft."): the first number it writes, 0 for none. */
function numberOf(cell: string): number {
  return parseInt(/[+-]?\d+/.exec(cell)?.[0] ?? "0", 10);
}

/**
 * The bonus a feature's text gives on skills' checks, always ("A druid gains a +2 bonus on Knowledge (nature) and
 * Survival checks."): one on checks against something, or made to do something, isn't.
 */
function skillBonuses(text: string): ModifierSeed[] {
  const match = /gains? a \+(\d+) bonus on ([A-Z][\w ()]+?) checks\.$/.exec(text);
  if (!match) return [];
  const skills = match[2].split(/,? and |, /).map((name) => SKILLS_BY_NAME.get(name.toLowerCase()));
  if (!skills.every((skill) => skill !== undefined)) return [];
  return skills.map((skill) => bonus(`skills.${stripSeparators(skill)}.misc`, parseInt(match[1], 10)));
}

/**
 * The modifiers of a class's features: the proficiencies one grants, a pool of a type of feats one adds a pick to
 * (`FEAT_TYPE_POOLS`), what its text gives always (uncanny dodge, a bonus on skills, saves or speed, a language), a
 * cleric's two domains' picks and her domain slot a spell level; and the class's levels' (`levelModifiers`), its table's numbers: a monk's AC
 * bonus, fast movement and unarmed damage columns, a dragon disciple's natural armor and ability boosts.
 */
export class FeatureModifiers {
  constructor(
    readonly className: string,
    readonly table: ClassTable,
  ) {}

  /** What its features give that no modifier does: a proficiency to pick. */
  private readonly unplaced: string[] = [];

  /** A bond's creature: a pick of one in its kind's bond pool, and its creature's master level. */
  private bondModifiers(bond: BondFeature): ModifierSeed[] {
    const level = `[classes.${stripSeparators(this.className)}.level]`;
    const masterLevel = bond.levelsBelow > 0 ? `max(0, ${level} - ${bond.levelsBelow})` : level;
    return [
      bonus(`aptitudes.${stripSeparators(`${BONDED_KIND_BY_SLUG[bond.kind].className} Bond`)}.allowed`, 1),
      bonus(`bonded.${bond.kind}.level`, `{{ ${masterLevel} }}`),
    ];
  }

  /** A cleric's domain slot at each spell level from the 1st, each from the class level it opens at. */
  private domainSlots(): ModifierSeed[] {
    const rows = this.table.spellsPerDay()?.rows ?? [];
    const slug = stripSeparators(DOMAIN_SPELLS);
    const classSlug = stripSeparators(this.className);
    return Array.from({ length: (rows.at(-1)?.length ?? 1) - 1 }, (_, i) => {
      const level = rows.findIndex((row) => row.length > i + 1) + 1;
      const modifier = bonus(`aptitudes.${slug}.${i + 1}.uses`, 1);
      return level > 1 ? { ...modifier, requirements: [gte(`classes.${classSlug}.level`, level)] } : modifier;
    });
  }

  /** What a feature's text gives always, by its name: its effect when its text says what it is, none for another. */
  private effects({ name, text }: ClassFeature): ModifierSeed[] {
    switch (name) {
      case "AC Bonus":
        return ["combat.ac.misc", "combat.cmd.misc"].map((target) => ({
          ...bonus(target, abilityBonus("wisdom")),
          requirements: UNARMORED,
        }));
      case "Bonus Languages": {
        const secret = /knows (\w+), a secret language/.exec(text)?.[1];
        if (secret) return [grantLanguage(secret)];
        return /can learn any new language/.test(text) ? [languagePick()] : [];
      }
      case "Divine Grace":
        return SAVE_NAMES.map((save) => bonus(`saves.${save.toLowerCase()}.misc`, abilityBonus("charisma")));
      case "Domains": {
        // "chooses two domains": its picks in the Cleric Domain pool, beside a domain slot at each spell level
        const chosen = /chooses two domains/.test(text);
        const picks = chosen ? [bonus(`aptitudes.${stripSeparators(CLERIC_DOMAIN)}.allowed`, 2)] : [];
        return [...picks, ...(this.table.spellsPerDay()?.domainSlots ? this.domainSlots() : [])];
      }
      case "Favored Enemy":
        return [bonus("aptitudes.favoredenemy.allowed", 1)];
      case "Fast Movement": {
        const feet = /faster than the norm for her race by \+(\d+) feet/.exec(text)?.[1];
        return feet ? [{ ...bonus("combat.speed.base", parseInt(feet, 10)), requirements: UNBURDENED }] : [];
      }
      case "Uncanny Dodge":
        return [setFlag("combat.ac.uncannydodge")];
      case "Weapon and Armor Proficiency": {
        const proficiencies = new ClassProficiencies(text);
        this.unplaced.push(...proficiencies.unread());
        return proficiencies.modifiers();
      }
      default:
        return skillBonuses(text);
    }
  }

  /** The bonus a table's entry names: natural armor ("(+1)"), an ability's ("(Str +2)"); none for another. */
  private entryBonuses(entry: string, level: number): LevelModifier[] {
    const armor = /^natural armor increase \(\+(\d+)\)$/i.exec(entry)?.[1];
    if (armor) return [{ level, ...bonus("combat.ac.natural", parseInt(armor, 10)) }];
    const boost = /^ability boost \((\w{3}) \+(\d+)\)$/i.exec(entry);
    const ability = boost && ABILITY_NAMES.find((name) => name.startsWith(boost[1]));
    return ability ? [{ level, ...bonus(`abilities.${ability.toLowerCase()}.misc`, parseInt(boost[2], 10)) }] : [];
  }

  /** A table's column's numbers, a modifier at each level they grow at, by how much: a monk's AC bonus, his speed. */
  private growth(column: string, targets: string[], requirements: RequirementEntry[]): LevelModifier[] {
    const cells = this.table.column(column) ?? [];
    return cells.flatMap((cell, i) => {
      const grown = numberOf(cell) - (i > 0 ? numberOf(cells[i - 1]) : 0);
      return grown > 0 ? targets.map((target) => ({ level: i + 1, ...bonus(target, grown), requirements })) : [];
    });
  }

  /** Whether a class word's term (`FEAT_TYPE_POOLS`, `BOND_FEATURES`) is this class's `feature`'s. */
  private isOwn(term: { className: string; feature: string }, feature: ClassFeature): boolean {
    return term.className === this.className && term.feature === feature.name;
  }

  /**
   * The feats a bond's choice (`BondFeature.choice`) is picked between, in the pool its feature names: its creature,
   * which bonds it ("Arcane Bond: Familiar"), and the other, the table's ("Arcane Bond: Bonded Object"); none for a
   * class without such a feature.
   */
  bondChoices(features: ClassFeature[]): FeatSeed[] {
    const requirements = [gte(`classes.${stripSeparators(this.className)}.level`, 1)];
    return BOND_FEATURES.filter((bond) => features.some((feature) => this.isOwn(bond, feature))).flatMap((bond) => {
      if (!bond.choice) return [];
      const { creature, other, otherText } = bond.choice;
      const creatureText = `Your ${bond.feature.toLowerCase()} is with a ${creature.toLowerCase()}, which you pick among those your class can bond with.`;
      return [
        { name: `${bond.feature}: ${creature}`, description: creatureText, modifiers: this.bondModifiers(bond) },
        { name: `${bond.feature}: ${other}`, description: otherText },
      ].map((feat) => ({ ...feat, aptitudes: [bond.feature], requirements }));
    });
  }

  /**
   * The class's levels' modifiers, its table's numbers: its AC bonus, fast movement and unarmed damage columns (a
   * monk's), each at the levels it changes at, and its features' entries' bonuses ("Natural armor increase (+1)",
   * "Ability boost (Str +2)"), each at its level.
   */
  levelModifiers(features: ClassFeature[]): LevelModifier[] {
    const damage = this.table.column("Unarmed Damage") ?? [];
    return [
      ...this.growth("AC Bonus", ["combat.ac.misc", "combat.cmd.misc"], UNARMORED),
      ...this.growth("Fast Movement", ["combat.speed.base"], UNENCUMBERED),
      ...damage.flatMap((dice, i) =>
        dice !== damage[i - 1] ? [{ level: i + 1, ...setStr("items.weapons.unarmedstrike.damage.base", dice) }] : [],
      ),
      ...features.flatMap(({ entries }) => entries.flatMap(({ entry, level }) => this.entryBonuses(entry, level))),
    ];
  }

  /**
   * A feature's modifiers: a pick in the pool of a type of feats it adds to; a bond's pick and its creature's master
   * level (the class's, its levels below taken off), or a pick between its creature and what it offers instead; else
   * what its text gives always.
   */
  of(feature: ClassFeature): ModifierSeed[] {
    const pool = FEAT_TYPE_POOLS.find((term) => this.isOwn(term, feature));
    if (pool) return [bonus(`aptitudes.${stripSeparators(pool.aptitude)}.allowed`, 1)];
    const bond = BOND_FEATURES.find((term) => this.isOwn(term, feature));
    if (!bond) return this.effects(feature);
    if (bond.choice) return [bonus(`aptitudes.${stripSeparators(bond.feature)}.allowed`, 1)];
    return this.bondModifiers(bond);
  }

  /** What its features give that no modifier does: "proficiency with one simple weapon". */
  unread(): string[] {
    return this.unplaced;
  }
}
