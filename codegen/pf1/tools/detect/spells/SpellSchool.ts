import { LATER_SPELL_DESCRIPTORS } from "@/codegen/pf1/tools/terms/spells.ts";
import { capitalize } from "@/shared/text.ts";
import { SPELL_DESCRIPTORS, SPELL_SCHOOLS, SPELL_SUBSCHOOLS } from "@/vocabulary/pf1/spells.ts";

/**
 * A school line's parts: its school, its subschools in parentheses and its descriptors in brackets ("conjuration
 * (creation) [acid]").
 */
const SCHOOL_LINE = /^([a-z]+)\s*(?:\(([^)]*)\))?\s*(?:\[([^\]]*)\])?$/i;

/**
 * What joins the values a school line combines: "fire or cold", "creation or calling", "figment, glamer". A spell has
 * each of them; a choice the book writes with "or" stays in its description.
 */
const VALUE_JOINS = /\s*(?:,|\bor\b|\band\b)\s*/i;

/** The declared value of `values` that `value` is, whatever its case: none when it's none of them. */
function declared(values: readonly string[], value: string): string | undefined {
  return values.find((option) => option.toLowerCase() === value.toLowerCase());
}

/** The values a part of a school line combines ("fire or cold": fire, cold), none of an empty one. */
function splitValues(part: string | undefined): string[] {
  return (part ?? "")
    .split(VALUE_JOINS)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * A spell's school line read ("conjuration (creation) [acid]", "illusion (shadow) [shadow]"): its school, subschools and
 * descriptors, each one of the vocabulary's (a descriptor that's a subschool, Shadow, among its subschools), each once.
 * What it leaves out is what the Core Rulebook has none of (a later book's descriptor, `LATER_SPELL_DESCRIPTORS`) or
 * what its text gives ("[see text]"); what it can't read is listed (`unread`).
 */
export class SpellSchool {
  constructor(private readonly line: string) {}

  /** The line's parts: its school, its subschools and its descriptors, as written. */
  private parts(): { descriptors: string[]; school: string; subschools: string[] } {
    const [, school = "", subschools, descriptors] = this.line.trim().match(SCHOOL_LINE) ?? [];
    return { descriptors: splitValues(descriptors), school, subschools: splitValues(subschools) };
  }

  /** Its descriptors, each the vocabulary's. */
  descriptors(): string[] {
    const values = this.parts().descriptors.flatMap((value) => declared(SPELL_DESCRIPTORS, value) ?? []);
    return [...new Set(values)];
  }

  /** The descriptors it leaves out: a later book's, or a pointer to its text ("see text for lesser planar ally"). */
  leftOut(): string[] {
    return this.parts().descriptors.filter(
      (value) => LATER_SPELL_DESCRIPTORS.includes(value.toLowerCase()) || /^see (?:text|below)\b/i.test(value),
    );
  }

  /** Its school, the vocabulary's: none when its line names none of them. */
  school(): string | undefined {
    return declared(SPELL_SCHOOLS, this.parts().school);
  }

  /** Its subschools, each the vocabulary's: those in parentheses, then a descriptor that's one (Shadow). */
  subschools(): string[] {
    const { descriptors, subschools } = this.parts();
    const values = [...subschools, ...descriptors].flatMap((value) => declared(SPELL_SUBSCHOOLS, value) ?? []);
    return [...new Set(values)];
  }

  /** What the line gives that no reading takes: a school, a subschool or a descriptor it doesn't know. */
  unread(): string[] {
    const { descriptors, subschools } = this.parts();
    const leftOut = this.leftOut();
    return [
      ...(this.school() ? [] : [`school "${this.line}"`]),
      ...subschools.filter((value) => !declared(SPELL_SUBSCHOOLS, value)).map((value) => `subschool "${value}"`),
      ...descriptors
        .filter(
          (value) =>
            !declared(SPELL_DESCRIPTORS, value) && !declared(SPELL_SUBSCHOOLS, value) && !leftOut.includes(value),
        )
        .map((value) => `descriptor "${capitalize(value)}"`),
    ];
  }
}
