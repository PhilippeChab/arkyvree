import { readAbilityIncrease } from "@/codegen/dnd5.2/tools/detect/abilityIncreases.ts";
import { readAbility } from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import { readSpellLists } from "@/codegen/dnd5.2/tools/detect/spellLists.ts";
import { normalizeText } from "@/codegen/dnd5.2/tools/detect/text.ts";
import {
  ANY_FEAT_POOLS,
  CATEGORIES_BY_TYPE,
  FEAT_MODIFIERS,
  type FeatCategory,
} from "@/codegen/dnd5.2/tools/terms/feats.ts";
import type { FeatEntry, FeatReference } from "@/codegen/dnd5.2/tools/types/feats.ts";
import { bonus, setStr } from "@/content/core/builders/customization/modifiers.ts";
import { eq, eqFalse, gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { classFightingStyle, classSpells, spellcastingAbilityPool } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom, spellRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";
import { FIGHTING_STYLE_OPTION_CLASSES } from "@/vocabulary/dnd5.2/classes.ts";
import { FEAT_CATEGORY_POOLS, FEAT_FAMILIES, FEATURE_FAMILIES } from "@/vocabulary/dnd5.2/feats.ts";
import { FEAT_FAMILY, FEAT_GENERATED, FEAT_STACKABLE } from "@/vocabulary/dnd5.2/fields/index.ts";

import { Memos } from "./Memos.ts";

/** A feat's family, as the vocabulary names them. */
type FeatFamily = (typeof FEAT_FAMILIES)[number];

/** The feat that's the Ability Score Improvement, whose variants are its ways to spread its increase. */
const ASI = "Ability Score Improvement";

/** The SRD's word for a feat taken more than once ("Repeatable. You can take this feat more than once"). */
const REPEATABLE = /\bRepeatable\./;

/** The path of an ability's increases (`abilities.<ability>.misc`). */
function abilityMisc(ability: string): string {
  return `abilities.${stripSeparators(ability)}.misc`;
}

/**
 * The Ability Score Improvement's 21 variants: +2 to one ability (6), or +1 to two (15), each named for its increases
 * ("Ability Score Improvement (Strength +1, Dexterity +1)").
 */
function asiVariants(base: FeatSeed): FeatSeed[] {
  const pairs = ABILITY_NAMES.flatMap((first, index) =>
    ABILITY_NAMES.slice(index + 1).map((second) => [first, second]),
  );
  const spreads = [
    ...ABILITY_NAMES.map((ability) => [[ability, 2] as const]),
    ...pairs.map(([a, b]) => [[a, 1] as const, [b, 1] as const]),
  ];
  return spreads.map((spread) => ({
    ...base,
    name: `${base.name} (${spread.map(([ability, amount]) => `${ability} +${amount}`).join(", ")})`,
    modifiers: spread.map(([ability, amount]) => bonus(abilityMisc(ability), amount)),
  }));
}

/** The family of a feat taken with a choice, a feat per option, by its name: none for a feat of no family. */
function familyOf(name: string): FeatFamily | undefined {
  return FEAT_FAMILIES.find((family) => family === name);
}

/**
 * The abilities a feat's spells may be cast with, as its text offers them ("Intelligence, Wisdom, or Charisma is your
 * spellcasting ability for this feat's spells"): none for a feat that offers no choice.
 */
function readCastingAbilities(description: string): string[] {
  const match = /([A-Z][a-z]+), ([A-Z][a-z]+), or ([A-Z][a-z]+) is your spellcasting ability/.exec(description);
  return (match?.slice(1) ?? []).map((name) => {
    if (!isOneOf(name, ABILITY_NAMES)) throw new Error(`"${name}" names no ability`);
    return name;
  });
}

/**
 * A book's standalone feats (`seeds`, by category), each read off its entry as its override corrects it: its text,
 * the pools it's picked in (its category's, `FEAT_CATEGORY_POOLS`, and those that take any feat a character qualifies
 * for, `ANY_FEAT_POOLS`),
 * its prerequisites as requirements (a level, an ability score, a feature: one of the feats a class's feature of that
 * name is, `featureFeats`), its modifiers (`FEAT_MODIFIERS`), and whether it repeats. A feat taken with a choice is a
 * family of a feat per option: the Ability Score Improvement's 21 ways to spread its increase, an ability score
 * increase's abilities ("Grappler (Strength)"), a spell list ("Magic Initiate (Cleric)").
 */
export class FeatSeeds {
  constructor(
    readonly ref: FeatReference,
    private readonly featureFeats: (feature: string) => string[],
  ) {}

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /** A feat's own seed, before its options: its text, pools, requirements, modifiers and fields. */
  private base(entry: FeatEntry): FeatSeed {
    const category = CATEGORIES_BY_TYPE[entry.type];
    if (!category) throw new Error(`${entry.name}: no feat category is "${entry.type}"`);
    // A Fighting Style feat is a paladin's and a ranger's pick too, in their own pools
    const pools = [
      FEAT_CATEGORY_POOLS[category],
      ...(category === "Fighting Style" ? FIGHTING_STYLE_OPTION_CLASSES.map(classFightingStyle) : []),
    ];
    const requirements = this.requirements(entry);
    const modifiers = FEAT_MODIFIERS[entry.name] ?? [];
    const repeatable = entry.repeatable ? `\nRepeatable. ${entry.repeatable}` : "";
    return {
      name: entry.name,
      description: normalizeText(`${entry.description}${repeatable}`),
      aptitudes: [...new Set([...pools, ...ANY_FEAT_POOLS])],
      ...(requirements.length > 0 ? { requirements } : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(entry.repeatable && !readSpellLists(entry.description).length ? { fields: { [FEAT_STACKABLE]: true } } : {}),
    };
  }

  /** Each feat's entry, as its override corrects it (Two-Weapon Fighting's name). */
  private entries(): FeatEntry[] {
    return this.ref.raw.map((entry) => ({ ...entry, ...this.ref.overrides?.[entry.name] }));
  }

  /**
   * A feat's prerequisites as requirements: its level, its ability scores (one of them), and the feature it needs, any
   * feat of the feature's family (`FEATURE_FAMILIES`: any class's Fighting Style, a fork's class's too).
   */
  private requirements({ name, prerequisite_options, prerequisites = {} }: FeatEntry): RequirementEntry[] {
    const { feature_named, minimum_level } = prerequisites;
    const scores = (prerequisite_options?.from.options ?? []).flatMap((option) =>
      isRecord(option) && isRecord(option.ability_score) && typeof option.ability_score.name === "string"
        ? [
            gte(
              `abilities.${stripSeparators(readAbility(option.ability_score.name))}.total`,
              Number(option.minimum_score),
            ),
          ]
        : [],
    );
    if (typeof feature_named === "string" && this.featureFeats(feature_named).length === 0)
      throw new Error(`${name}: no class has the feature "${feature_named}" it requires`);
    if (typeof feature_named === "string" && !isOneOf(feature_named, FEATURE_FAMILIES))
      throw new Error(`${name}: the feature "${feature_named}" it requires is no family of FEATURE_FAMILIES`);
    return [
      ...(typeof minimum_level === "number" ? [gte("identity.meta.level", minimum_level)] : []),
      ...(scores.length > 0 ? [or(...scores)] : []),
      ...(typeof feature_named === "string" ? [eq(`feats.${stripSeparators(feature_named)}.*.possessed`)] : []),
    ];
  }

  /**
   * A feat's seeds: its options' when it's taken with a choice, each of its family and made per option (the Ability
   * Score Improvement's spreads, an ability score increase's abilities, a spell list's rooms), else itself.
   */
  private variants(entry: FeatEntry): FeatSeed[] {
    const base = this.base(entry);
    const family = familyOf(entry.name);
    const fields = { ...base.fields, [FEAT_GENERATED]: true, ...(family ? { [FEAT_FAMILY]: [family] } : {}) };
    const own: ModifierSeed[] = base.modifiers ?? [];
    if (entry.name === ASI) return asiVariants(base).map((variant) => ({ ...variant, fields }));
    const increase = readAbilityIncrease(entry.description);
    if (increase) {
      // A feat that isn't Repeatable is taken once, whichever ability it raises: each version requires the character
      // not to have the others, as 3.5's Ninja AC Bonus requires no Monk's
      const once = !REPEATABLE.test(entry.description);
      const names = increase.abilities.map((ability) => `${entry.name} (${ability})`);
      return increase.abilities.map((ability, index) => {
        const others = once ? names.filter((_, other) => other !== index) : [];
        const requirements = [
          ...(base.requirements ?? []),
          ...others.map((other) => eqFalse(`feats.${stripSeparators(other)}.possessed`)),
        ];
        return {
          ...base,
          name: names[index],
          ...(requirements.length > 0 ? { requirements } : {}),
          modifiers: [bonus(abilityMisc(ability), increase.amount), ...own],
          fields,
        };
      });
    }
    const lists = readSpellLists(entry.description);
    if (lists.length === 0) return [base];
    // A spell list's version, and the pick of the ability its spells are cast with when it offers one (Magic
    // Initiate's Intelligence, Wisdom or Charisma): a feat each, which sets the list's (`aptitudes.<list>.ability`)
    const abilities = readCastingAbilities(entry.description);
    return lists.flatMap((list) => {
      const name = `${entry.name} (${list})`;
      const pool = spellcastingAbilityPool(name);
      return [
        {
          ...base,
          name,
          modifiers: [
            spellRoom(classSpells(list), 0, 2),
            spellRoom(classSpells(list), 1, 1),
            ...(abilities.length > 0 ? [poolRoom(pool, 1)] : []),
            ...own,
          ],
          fields,
        },
        ...abilities.map((ability) => ({
          name: `${name}: ${ability}`,
          description: `${ability} is your spellcasting ability for the spells of ${name}.`,
          aptitudes: [pool],
          modifiers: [setStr(`aptitudes.${stripSeparators(classSpells(list))}.ability`, ability)],
          fields: { [FEAT_GENERATED]: true },
        })),
      ];
    });
  }

  /** The book's feats, by category, each feat's options made: in its reference's order. */
  seeds(): Map<FeatCategory, FeatSeed[]> {
    return this.memos.of("seeds", () => {
      const byCategory = new Map<FeatCategory, FeatSeed[]>();
      for (const entry of this.entries()) {
        const category = CATEGORIES_BY_TYPE[entry.type];
        byCategory.set(category, [...(byCategory.get(category) ?? []), ...this.variants(entry)]);
      }
      return byCategory;
    });
  }
}
