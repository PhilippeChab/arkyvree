import type { ClassReference } from "@/codegen/pf1/tools/types/classes.ts";
import { classSpells } from "@/content/pf1/builders/aptitudes/names.ts";
import type { ClassSeed } from "@/content/pf1/builders/classes/types.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";
import type { CasterType } from "@/vocabulary/pf1/classes.ts";

import { type ClassFeature, ClassFeatures } from "./ClassFeatures.ts";
import { ClassRequirements } from "./ClassRequirements.ts";
import { ClassSkills } from "./ClassSkills.ts";
import { ClassTable } from "./ClassTable.ts";
import { FeatureModifiers } from "./FeatureModifiers.ts";

/** What a class's detection reads of its book besides its page: the feats it holds, and its spell lists' cantrips. */
export interface ClassBook {
  /** The cantrips a class's spell list holds, by the class's name. */
  cantrips(className: string): number;
  /** The book's feats, by name. */
  feats: ReadonlySet<string>;
}

/** The 1st-level spells a spellbook starts with, past its cantrips: three. */
const SPELLBOOK_FIRST_SPELLS = 3;

/** The spells a spellbook gains at each class level past the first: two of the highest level its owner casts. */
const SPELLBOOK_SPELLS_A_LEVEL = 2;

/** A detail of a class's page, by its label's pattern: its text, none when it has none. */
function detailOf(ref: ClassReference, label: RegExp): string | undefined {
  return ref.raw.details.find((detail) => label.test(detail.label))?.text;
}

/**
 * A wizard's spellbook's spells by class level, then spell level (`known`): all his list's cantrips and three 1st-level
 * spells, then two a level of the highest level he casts, as his Spellbooks feature gives them; its Intelligence's
 * extra 1st-level spells are the table's.
 */
function spellbookOf(perDay: number[][], cantrips: number): number[][] {
  const known: number[][] = [];
  for (const [i, row] of perDay.entries()) {
    if (i === 0) {
      known.push([cantrips, SPELLBOOK_FIRST_SPELLS]);
      continue;
    }
    const next = Array.from({ length: row.length }, (_, level) => known[i - 1][level] ?? 0);
    next[row.length - 1] += SPELLBOOK_SPELLS_A_LEVEL;
    known.push(next);
  }
  return known;
}

/**
 * A class reference read: its name (its override's, where its book's carries a trademark), its table (`ClassTable`),
 * its features (`ClassFeatures`) and their modifiers (`FeatureModifiers`), its class skills, its requirements (a
 * prestige class's, a base class's alignment), its hit die and skill points, and its spellcasting.
 */
export class ClassDetector {
  constructor(
    readonly ref: ClassReference,
    readonly book: ClassBook,
  ) {
    const { overrides, raw } = ref;
    this.name = overrides?.name ?? raw.name;
    this.slug = stripSeparators(this.name);
    this.table = new ClassTable(raw);
    this.features = new ClassFeatures(raw, this.table.specials());
    this.skills = new ClassSkills(raw.classSkills);
    const alignment = detailOf(ref, /^Alignment$/);
    const lines = raw.prestige ? raw.requirements : alignment ? [{ label: "Alignment", text: alignment }] : [];
    this.requirements = new ClassRequirements(lines, book.feats);
    this.modifiers = new FeatureModifiers(this.name, this.table);
  }

  /** Its features. */
  readonly features: ClassFeatures;
  /** Its features' modifiers, and its levels'. */
  readonly modifiers: FeatureModifiers;
  /** Its name, as the content names it. */
  readonly name: string;
  /** Its requirements. */
  readonly requirements: ClassRequirements;
  /** Its class skills. */
  readonly skills: ClassSkills;
  /** Its slug, as its paths name it (`classes.wizard.level`). */
  readonly slug: string;
  /** Its table. */
  readonly table: ClassTable;

  /** Its Spells feature: none for a class that casts no spells of its own. */
  private spellsFeature(): ClassFeature | undefined {
    return this.table.spellsPerDay() ? this.features.all().find(({ name }) => name === "Spells") : undefined;
  }

  /** The ability its bonus spells come from, as its Spells feature names it ("a Charisma score equal to at least 10 + …"). */
  bonusSpellAbility(): string | undefined {
    const text = this.spellsFeature()?.text ?? "";
    return /(\w+) score (?:equal to )?(?:of )?at least 10 \+/.exec(text)?.[1];
  }

  /**
   * The caster levels it adds to another class (`ClassTable.casterAdvancement`), of the kind its Spells per Day feature
   * names when its table names none ("a level in an arcane spellcasting class": an arcane archer's).
   */
  casterLevelAdvancement(): ClassSeed["casterLevelAdvancement"] {
    const advancement = this.table.casterAdvancement();
    if (advancement?.type !== "any") return advancement;
    const text = this.ref.raw.features.find(({ label }) => label.startsWith("Spells per Day"))?.text ?? "";
    const kinds = new Set([...text.matchAll(/\b(arcane|divine) spellcasting class\b/g)].map((match) => match[1]));
    const [kind] = kinds;
    return kinds.size === 1 && (kind === "arcane" || kind === "divine") ? { ...advancement, type: kind } : advancement;
  }

  /** The kind of spells it casts, as its Spells feature says ("casts arcane spells"). */
  casterType(): CasterType | undefined {
    const kind = /\b(arcane|divine) spells\b/.exec(this.spellsFeature()?.text ?? "")?.[1];
    return kind ? (capitalize(kind) as CasterType) : undefined;
  }

  /** Its hit die ("d10." → 10). */
  hitDie(): number {
    const die = /d(\d+)/.exec(detailOf(this.ref, /^Hit Die$/) ?? "")?.[1];
    if (!die) throw new Error(`${this.name} has no hit die`);
    return parseInt(die, 10);
  }

  /** Its skill points at each level ("4 + Int modifier." → 4). */
  skillPoints(): number {
    const points = /(\d+)/.exec(detailOf(this.ref, /^Skill (?:Points|Ranks)/) ?? "")?.[1];
    if (!points) throw new Error(`${this.name} has no skill points a level`);
    return parseInt(points, 10);
  }

  /**
   * Its spells: its spells per day, from the cantrips when its table gives them, and its spells known (a spontaneous
   * caster's, whose cantrips per day are those it knows, cast at will); a prepared divine caster knows every spell of
   * its list (`knowAll`), and a prepared arcane one his spellbook's (`spellbookOf`). A table from the 1st spell level
   * with no cantrips (a paladin's) has `noCantrips`.
   */
  spells(): ClassSeed["spells"] {
    const perDay = this.table.spellsPerDay();
    if (!perDay) return undefined;
    const known = this.table.spellsKnown();
    const rows = perDay.cantrips || !known ? perDay.rows : perDay.rows.map((row, i) => [known[i][0], ...row]);
    const casterType = this.casterType();
    return {
      slug: stripSeparators(classSpells(this.name)),
      perDay: rows,
      ...(known
        ? { known }
        : casterType === "Arcane"
          ? { known: spellbookOf(rows, this.book.cantrips(this.name)) }
          : { knowAll: true }),
      ...(!perDay.cantrips && !known ? { noCantrips: true } : {}),
    };
  }

  /** What its page gives that no reading takes: its table's entries, its skills, its requirements, its proficiencies. */
  unread(): string[] {
    return [
      ...this.features.unread().map((entry) => `table entry naming no feature: ${entry}`),
      ...this.skills.unread().map((skill) => `class skill: ${skill}`),
      ...this.requirements.unread().map((line) => `requirement: ${line}`),
      ...this.modifiers.unread(),
    ];
  }
}
