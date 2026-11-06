import { describe, expect, test } from "bun:test";

import { ClassRequirements } from "@/codegen/pf1/tools/detect/classes/ClassRequirements.ts";
import { eq, eqStr, gte, or } from "@/content/core/builders/customization/requirements.ts";

const FEATS = new Set(["Dodge", "Weapon Focus"]);

describe("A class's requirements", () => {
  test("read its base attack bonus, skill ranks, feats, spellcasting and alignment", () => {
    const read = new ClassRequirements(
      [
        { label: "Alignment", text: "Any evil." },
        { label: "Base Attack Bonus", text: "+6." },
        { label: "Skills", text: "Acrobatics 2 ranks, Perform (dance) 2 ranks." },
        { label: "Feats", text: "Dodge, Weapon Focus (longbow or shortbow)." },
        { label: "Spells", text: "Able to cast 2nd-level divine spells and 2nd-level arcane spells." },
      ],
      FEATS,
    );
    expect(read.all()).toEqual([
      or(
        eqStr("identity.beliefs.alignment", "Lawful Evil"),
        eqStr("identity.beliefs.alignment", "Neutral Evil"),
        eqStr("identity.beliefs.alignment", "Chaotic Evil"),
      ),
      gte("combat.bab", 6),
      gte("skills.acrobatics.rank", 2),
      gte("skills.perform.rank", 2),
      eq("feats.dodge.possessed"),
      or(eq("feats.weaponfocuslongbow.possessed"), eq("feats.weaponfocusshortbow.possessed")),
      gte("spellcasting.divine", 2),
      gte("spellcasting.arcane", 2),
    ]);
    expect(read.unread()).toEqual([]);
  });

  test("read a neutral alignment as Pathfinder names it, and sneak attack's dice", () => {
    const read = new ClassRequirements(
      [
        { label: "Alignment", text: "Any nonlawful." },
        { label: "Special", text: "Sneak attack +2d6." },
      ],
      FEATS,
    );
    expect(read.all()[0]).toMatchObject({
      children: expect.arrayContaining([eqStr("identity.beliefs.alignment", "Neutral")]),
    });
    expect(read.all()[1]).toEqual(gte("feats.sneakattack.count", 2));
  });

  test("leave unread what no reading takes, and a line read only in part", () => {
    const read = new ClassRequirements(
      [
        { label: "Skills", text: "Knowledge (any two) 7 ranks in each." },
        { label: "Spells", text: "Ability to cast mage hand and at least one arcane spell of 2nd level or higher." },
        { label: "Race", text: "Any nondragon." },
      ],
      FEATS,
    );
    expect(read.all()).toEqual([gte("spellcasting.arcane", 2)]);
    expect(read.unread()).toEqual([
      "Skills: Knowledge (any two) 7 ranks in each",
      "Spells: Ability to cast mage hand and at least one arcane spell of 2nd level or higher. (read in part)",
      "Race: Any nondragon.",
    ]);
  });
});
