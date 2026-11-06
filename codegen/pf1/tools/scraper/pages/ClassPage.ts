/** A class's page of aonprd.com, base or prestige: its details, requirements, skills, tables and features. */

import type { ClassEntry } from "@/codegen/pf1/tools/types/classes.ts";

import { AonPage } from "./AonPage.ts";

/**
 * A class's page: its description and labelled details before its first section (its rules among them kept: not its
 * description nor its role, which aren't open game content), then its sections, each an h2:
 * "Requirements" (a prestige class's), "Class Skills" (its skills' sentence, its skill points and a prestige class's
 * hit die), "Class Features" (its table, then its features, each labelled), "Spells Known" (a spontaneous caster's
 * table) and an "Ex-" one (an ex-cleric's). The other books' sections after them (its alternate capstones, its favored
 * class options) aren't read.
 */
export class ClassPage extends AonPage {
  /** `listedName`: the class as its book lists it (its title, for a page read alone); `prestige`: whether the book lists it as a prestige class. */
  constructor(
    html: string,
    private readonly listedName?: string,
    private readonly prestige = false,
  ) {
    super(html);
  }

  /**
   * Whether a labelled detail under the class's title is a rule, which its reference keeps: its role isn't, nor a
   * prestige class's alignment, which tells who takes it (its alignment's rule is among its requirements).
   */
  private isRule(label: string): boolean {
    return label !== "Role" && !(this.prestige && label === "Alignment");
  }

  /** The entry's name: as its book lists it, else its title. */
  private name(): string {
    return this.listedName ?? this.title();
  }

  /** The class's page as read: none for a page without an entry. */
  read(): ClassEntry | undefined {
    if (!this.title()) return undefined;
    const details = AonPage.labeled(this.titlePart()).entries.filter(({ label }) => this.isRule(label));
    const skills = AonPage.labeled(this.section("Class Skills") ?? "");
    const features = this.section("Class Features") ?? "";
    const exClass = this.parts().find((part) => part.level === 2 && part.heading.startsWith("Ex-"));
    return {
      name: this.name(),
      prestige: this.prestige,
      sources: this.sources(),
      details: [...details, ...skills.entries],
      requirements: AonPage.labeled(this.section("Requirements") ?? "").entries,
      classSkills: skills.intro,
      tables: [...AonPage.tables(features), ...AonPage.tables(this.section("Spells Known") ?? "")],
      features: AonPage.labeled(features).entries,
      ...(exClass ? { exClass: AonPage.textOf(exClass.html) } : {}),
    };
  }
}
