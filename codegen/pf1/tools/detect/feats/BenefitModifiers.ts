import { OPTION } from "@/codegen/pf1/tools/terms/featOptions.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

import FeatTargetPaths from "./FeatTargetPaths.ts";

/** Dodge's bonus to AC: "You gain a +1 dodge bonus to your AC." */
const DODGE = /^You gain a \+(\d+) dodge bonus to your AC\./;

/** Improved Initiative's: "You get a +4 bonus on initiative checks." */
const INITIATIVE = /^You get a \+(\d+) bonus on initiative checks\.$/;

/** Intimidating Prowess's: "Add your Strength modifier to Intimidate skill checks…" */
const INTIMIDATING_STRENGTH = /^Add your Strength modifier to Intimidate skill checks\b/;

/** A save's bonus: "You get a +2 bonus on all Fortitude saving throws." */
const SAVE = /^You get a \+(\d+) bonus on all (\w+) saving throws\.$/;

/** A school family's DC bonus: "Add +1 to the Difficulty Class for all saving throws against spells from the school of magic you select." */
const SCHOOL_DC =
  /^Add \+(\d+) to the Difficulty Class for all saving throws against spells from the school of magic you select\./;

/** The weapon a family's feat is taken for, as its benefit names it: "the selected weapon". */
const SELECTED_WEAPON = String.raw`using the selected weapon\.`;

/** Skill Focus's bonus on the option's checks, and the bonus it makes past some ranks: "+3 … 10 or more ranks … +6." */
const SKILL_FOCUS =
  /^You get a \+(\d+) bonus on all checks involving the chosen skill\. If you have (\d+) or more ranks in that skill, this bonus increases to \+(\d+)\.$/;

/**
 * Alertness's and its kind's: a bonus on two skills' checks ("Perception and Sense Motive skill checks", "Heal checks
 * and Survival checks"), and the bonus it makes past some ranks in one of them.
 */
const SKILL_PAIR =
  /^You get a \+(\d+) bonus on (?:all )?([A-Z][A-Za-z ]+?)(?: checks)? and ([A-Z][A-Za-z ]+?) (?:skill )?checks\. If you have (\d+) or more ranks in one of these skills, the bonus increases to \+(\d+) for that skill\.$/;

/**
 * A number a benefit gives: a bonus or a penalty ("+2", "–1"), an increase ("your base speed increases by 5 feet",
 * "Your ki pool increases by 2"), or more uses ("two additional times per day", "6 additional rounds per day").
 */
const STATED_NUMBER = /(?:^|[\s(])[+–-]\d|\bincreases by \d|\b(?:\d+|one|two|three|four|five|six) additional\b/i;

/** Improved Critical's: "When using the weapon you selected, your threat range is doubled." */
const THREAT_RANGE_DOUBLED = /^When using the weapon you selected, your threat range is doubled\.$/;

/** Toughness's hit points, and one more per hit die past some: "You gain +3 hit points. For every Hit Die you possess beyond 3, …" */
const TOUGHNESS =
  /^You gain \+(\d+) hit points\. For every Hit Die you possess beyond (\d+), you gain an additional \+1 hit point\./;

/** An off-hand attack more: "you get a second attack with it", "You get a third attack with your off-hand weapon". */
const TWO_WEAPON_ATTACK = /\byou get a (?:second|third) attack with (?:it|your off-hand weapon)/i;

/** Two-Weapon Fighting's penalties reduced: "The penalty for your primary hand lessens by 2 and the one for your off hand lessens by 6." */
const TWO_WEAPON_PENALTIES = /primary hand lessens by (\d+) and the one for your off hand lessens by (\d+)/;

/** A weapon family's attack and damage bonuses: "You gain a +1 bonus on all attack rolls you make using the selected weapon." */
const WEAPON_ATTACK = new RegExp(
  String.raw`^You gain a \+(\d+) bonus on (?:all )?attack rolls you make ${SELECTED_WEAPON}`,
);
const WEAPON_DAMAGE = new RegExp(
  String.raw`^You gain a \+(\d+) bonus on (?:all )?damage rolls you make ${SELECTED_WEAPON}`,
);

/** A path's option made one of its kind's, to check the path: a skill's, or else a weapon's (a school's takes any). */
function sampleOption(target: string): string {
  return target.replace(OPTION, target.startsWith("skills.") ? "perception" : "longsword");
}

/**
 * The modifiers a feat's Benefit gives, where the text is a plain bonus that always applies: on saves, initiative,
 * dodge AC, two skills' checks (more past 10 ranks), hit points (Toughness's per hit die), two-weapon fighting's
 * penalties and off-hand attacks, Intimidating Prowess's Strength, and a family's on the option taken (a weapon's
 * attack, damage and threat range, a skill's checks, a school's save DCs), which their paths name `OPTION`. A benefit
 * that states a bonus no reading takes (one that applies only sometimes, on a combat maneuver, on a check no path
 * holds) is left to review (`unresolved`). A path read that the engine doesn't know is a reading's mistake: it throws.
 */
export class BenefitModifiers {
  constructor(private readonly benefit: string) {
    this.modifiers.push(
      ...this.saves(),
      ...this.initiative(),
      ...this.dodge(),
      ...this.skillPair(),
      ...this.skillFocus(),
      ...this.toughness(),
      ...this.twoWeapon(),
      ...this.strengthOnIntimidate(),
      ...this.weaponOption(),
      ...this.schoolOption(),
    );
    this.checkPaths();
    const stated = benefit.split(/(?<=\.)\s+/).find((sentence) => STATED_NUMBER.test(sentence));
    if (this.modifiers.length === 0 && stated) this.unresolved.push(stated);
  }

  /** The modifiers the benefit gives. */
  readonly modifiers: ModifierSeed[] = [];
  /** The benefit's sentence that states a number, when no reading took one. */
  readonly unresolved: string[] = [];

  /** Throws on a modifier's path, or its requirement's, that the engine doesn't know. */
  private checkPaths() {
    const invalid = this.modifiers.flatMap(({ target, requirements = [] }) => [
      ...(FeatTargetPaths.isModifierPath(sampleOption(target)) ? [] : [target]),
      ...requirements.flatMap((requirement) =>
        FeatTargetPaths.invalidRequirementPaths(
          "target" in requirement ? { ...requirement, target: sampleOption(requirement.target) } : requirement,
        ),
      ),
    ]);
    if (invalid.length > 0) throw new Error(`A feat's benefit was read into unknown paths: ${invalid.join(", ")}`);
  }

  /** Dodge's bonus to AC. */
  private dodge(): ModifierSeed[] {
    const [, value] = DODGE.exec(this.benefit) ?? [];
    return value ? [bonus("combat.ac.dodge", Number(value))] : [];
  }

  /** Improved Initiative's bonus on initiative checks. */
  private initiative(): ModifierSeed[] {
    const [, value] = INITIATIVE.exec(this.benefit) ?? [];
    return value ? [bonus("combat.initiative.misc", Number(value))] : [];
  }

  /** A save's bonus, on one of the book's saves. */
  private saves(): ModifierSeed[] {
    const [, value, save] = SAVE.exec(this.benefit) ?? [];
    return value && SAVE_NAMES.includes(save) ? [bonus(`saves.${save.toLowerCase()}.misc`, Number(value))] : [];
  }

  /** A school family's DC bonus on the option's spells. */
  private schoolOption(): ModifierSeed[] {
    const [, value] = SCHOOL_DC.exec(this.benefit) ?? [];
    return value ? [bonus(`spells.groups.${OPTION}.*.dc.misc`, Number(value))] : [];
  }

  /** A skill's bonus (`skill`, its path's start), and what it adds from `ranks` ranks to make `high`. */
  private skillBonus(skill: string, value: number, ranks: number, high: number): ModifierSeed[] {
    return [
      bonus(`${skill}.misc`, value),
      { ...bonus(`${skill}.misc`, high - value), requirements: [gte(`${skill}.rank`, ranks)] },
    ];
  }

  /** Skill Focus's bonus on the option's checks: +3, +6 from 10 ranks. */
  private skillFocus(): ModifierSeed[] {
    const [, value, ranks, high] = SKILL_FOCUS.exec(this.benefit) ?? [];
    return value ? this.skillBonus(`skills.${OPTION}`, Number(value), Number(ranks), Number(high)) : [];
  }

  /** Two skills' bonus, each more past its ranks (Alertness's), when both are the book's skills. */
  private skillPair(): ModifierSeed[] {
    const [, value, first, second, ranks, high] = SKILL_PAIR.exec(this.benefit) ?? [];
    if (!value || ![first, second].every((skill) => isOneOf(skill, SKILL_NAMES))) return [];
    return [first, second].flatMap((skill) =>
      this.skillBonus(`skills.${stripSeparators(skill)}`, Number(value), Number(ranks), Number(high)),
    );
  }

  /** Intimidating Prowess's Strength modifier on Intimidate checks. */
  private strengthOnIntimidate(): ModifierSeed[] {
    return INTIMIDATING_STRENGTH.test(this.benefit)
      ? [bonus("skills.intimidate.misc", "{{ [abilities.strength.modifier] }}")]
      : [];
  }

  /** Toughness's hit points, and one more per hit die (a character's level) past its threshold. */
  private toughness(): ModifierSeed[] {
    const [, value, beyond] = TOUGHNESS.exec(this.benefit) ?? [];
    if (!value) return [];
    return [
      bonus("combat.hp.misc", Number(value)),
      {
        ...bonus("combat.hp.misc", `{{ [identity.meta.level] - ${beyond} }}`),
        requirements: [gte("identity.meta.level", Number(beyond) + 1)],
      },
    ];
  }

  /** Two-weapon fighting's penalties reduced, or an off-hand attack more. */
  private twoWeapon(): ModifierSeed[] {
    const [, primary, offHand] = TWO_WEAPON_PENALTIES.exec(this.benefit) ?? [];
    if (primary) {
      return [
        bonus("combat.twoweapon.mainhandpenalty", Number(primary)),
        bonus("combat.twoweapon.offhandpenalty", Number(offHand)),
      ];
    }
    return TWO_WEAPON_ATTACK.test(this.benefit) ? [bonus("combat.twoweapon.offhandattacks", 1)] : [];
  }

  /** A weapon family's bonus with the weapon taken for: on its attack rolls, its damage rolls, or its threat range doubled. */
  private weaponOption(): ModifierSeed[] {
    const weapon = `items.weapons.${OPTION}`;
    const [, attack] = WEAPON_ATTACK.exec(this.benefit) ?? [];
    if (attack) return [bonus(`${weapon}.tohit.misc`, Number(attack))];
    const [, damage] = WEAPON_DAMAGE.exec(this.benefit) ?? [];
    if (damage) return [bonus(`${weapon}.damage.misc`, Number(damage))];
    return THREAT_RANGE_DOUBLED.test(this.benefit)
      ? [{ target: `${weapon}.damage.critical.range`, operator: "multiply", value: "2", valueType: "number" }]
      : [];
  }
}
