import { describe, expect, test } from "bun:test";

import { FeatPrerequisites } from "@/codegen/pf1/tools/detect/feats/FeatPrerequisites.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/pf1/builders/feats/possession.ts";

/** The book's feats a test's prerequisites name. */
const BOOK_FEATS = new Set([
  "Armor Proficiency, Light",
  "Armor Proficiency, Medium",
  "Catch Off-Guard",
  "Critical Focus",
  "Greater Weapon Focus",
  "Power Attack",
  "Spell Focus",
  "Throw Anything",
  "Weapon Focus",
]);

/** A feat's prerequisites read, in a book of `BOOK_FEATS`, of the family `family` leads, if any. */
function read(text: string, family?: string) {
  return new FeatPrerequisites(text, { bookFeats: BOOK_FEATS, family });
}

describe("A feat's prerequisites", () => {
  test("read abilities, base attack bonus, feats, levels and caster levels", () => {
    expect(read("Str 13, Power Attack, base attack bonus +1.").requirements).toEqual([
      gte("abilities.strength.total", 13),
      eq(feat("Power Attack")),
      gte("combat.bab", 1),
    ]);
    expect(read("Critical Focus, any two critical feats, 14th-level fighter.").requirements).toEqual([
      eq(feat("Critical Focus")),
      gte("feats.critical.count", 2),
      gte("classes.fighter.level", 14),
    ]);
    expect(read("Caster level 3rd.").requirements).toEqual([gte("spellcasting.casterlevel", 3)]);
    expect(read("Character level 7th.").requirements).toEqual([gte("identity.meta.level", 7)]);
    expect(read("fighter level 4th").requirements).toEqual([gte("classes.fighter.level", 4)]);
  });

  test("read skill ranks, of one skill or any of several", () => {
    expect(read("Ride 1 rank, Power Attack.").requirements).toEqual([
      gte("skills.ride.rank", 1),
      eq(feat("Power Attack")),
    ]);
    expect(read("5 ranks in any Craft or Profession skill.").requirements).toEqual([
      or(gte("skills.craft.rank", 5), gte("skills.profession.rank", 5)),
    ]);
  });

  test("read a class feature as any class's of its family, and spellcasting of a kind", () => {
    expect(read("Lay on hands class feature, mercy class feature.").requirements).toEqual([
      eq("feats.layonhands.*.possessed"),
      eq("feats.mercy.*.possessed"),
    ]);
    expect(read("Ability to channel energy.").requirements).toEqual([eq("feats.channelenergy.*.possessed")]);
    expect(read("Ability to cast arcane spells.").requirements).toEqual([gte("spellcasting.arcane", 1)]);
  });

  test("leave the kind of energy channeled to review, reading any channel energy", () => {
    const prerequisites = read("Channel negative energy class feature.");
    expect(prerequisites.requirements).toEqual([eq("feats.channelenergy.*.possessed")]);
    expect(prerequisites.partlyRead).toEqual([
      `"Channel negative energy class feature" read as any channel energy: its kind isn't checked`,
    ]);
  });

  test("read feats by the content's names, alternatives, and a family's option", () => {
    expect(read("Light Armor Proficiency, Medium Armor Proficiency.").requirements).toEqual([
      eq(feat("Armor Proficiency, Light")),
      eq(feat("Armor Proficiency, Medium")),
    ]);
    expect(read("Catch Off-Guard or Throw Anything, base attack bonus +8.").requirements).toEqual([
      or(eq(feat("Catch Off-Guard")), eq(feat("Throw Anything"))),
      gte("combat.bab", 8),
    ]);
    expect(read("Spell Focus (conjuration).").requirements).toEqual([eq(feat("Spell Focus: Conjuration"))]);
  });

  test("read a family named alone as any of its feats, but in a family's own prerequisites as the option's", () => {
    const penetratingStrike = read("Weapon Focus, base attack bonus +1, 12th-level fighter, proficiency with weapon.");
    expect(penetratingStrike.requirements).toEqual([
      eq("feats.weaponfocus.*.possessed"),
      gte("combat.bab", 1),
      gte("classes.fighter.level", 12),
    ]);
    expect(penetratingStrike.proficient).toBe(false);
    const specialization = read(
      "Proficiency with selected weapon, Weapon Focus with selected weapon, fighter level 4th.",
      "Weapon Specialization",
    );
    expect(specialization.requirements).toEqual([eq(feat("Weapon Focus")), gte("classes.fighter.level", 4)]);
    expect(specialization.featNames).toEqual({ weaponfocus: "Weapon Focus" });
    expect(specialization.proficient).toBe(true);
  });

  test("leave what no requirement says to review, never guessing it", () => {
    const familiar = read(
      "Ability to acquire a new familiar, compatible alignment, sufficiently high level (see below).",
    );
    expect(familiar.requirements).toEqual([]);
    expect(familiar.unresolved).toEqual([
      "Ability to acquire a new familiar",
      "compatible alignment",
      "sufficiently high level (see below)",
    ]);
    const reload = read(
      "Weapon Proficiency (crossbow type chosen) or Exotic Weapon Proficiency (firearm).",
      "Rapid Reload",
    );
    expect(reload.requirements).toEqual([]);
    expect(reload.proficient).toBe(true);
    expect(reload.unresolved).toEqual(["Exotic Weapon Proficiency (firearm)"]);
  });
});
