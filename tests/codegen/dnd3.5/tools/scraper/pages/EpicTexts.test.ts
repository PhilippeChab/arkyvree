import { describe, expect, test } from "bun:test";

import { EpicClassesText } from "@/codegen/dnd3.5/tools/scraper/pages/EpicClassesText.ts";
import { EpicFeatsText } from "@/codegen/dnd3.5/tools/scraper/pages/EpicFeatsText.ts";

describe("The SRD's epic pages", () => {
  test("give each epic feat, its type, its paragraphs, a psionic one and the monster feats after them left out", () => {
    const text = [
      "FEATS",
      "ARMOR SKIN [EPIC]",
      "Benefit: The character gains a +1 natural armor bonus to Armor Class.",
      "Special: A character can gain this feat multiple times. Its effects stack.",
      "ENHANCE SPELL [METAMAGIC][EPIC]",
      "Prerequisites: Maximize Spell, Spellcraft 30 ranks.",
      "Benefit: The character may cast spells as enhanced spells.",
      "Surface\tDC",
      "SPELL KNOWLEDGE [EPIC, PSIONIC]",
      "Benefit: You add two additional powers.",
      "These feats are not epic feats, so they may be selected by character any time.",
      "IMPROVED MULTIATTACK [GENERAL]",
    ].join("\n");
    expect(new EpicFeatsText(text).read()).toEqual([
      {
        name: "Armor Skin",
        featType: "epic",
        prerequisiteText: "",
        benefit: "The character gains a +1 natural armor bonus to Armor Class.",
        special: "A character can gain this feat multiple times. Its effects stack.",
      },
      {
        name: "Enhance Spell",
        featType: "metamagic",
        prerequisiteText: "Maximize Spell, Spellcraft 30 ranks.",
        benefit: "The character may cast spells as enhanced spells. Surface\tDC",
      },
    ]);
  });

  test("give each class's features, its bonus feat list and its table's Special column by level", () => {
    const text = [
      "EPIC MONK",
      "Hit Die: d8",
      "AC Bonus: The monk's bonus to Armor Class increases by +1 every five levels higher than 20th.",
      "Bonus Feats: The epic monk gains a bonus feat every five levels higher than 20th.",
      "Epic Monk Bonus Feat List: Armor Skin, Blinding Speed.",
      "Table: The Epic Monk",
      "Monk Level\tAC Bonus\tUnarmored Speed Bonus\tSpecial",
      "21st\t+4\t+70 ft.",
      "25th\t+5\t+80 ft.\tBonus feat",
      "EPIC PSIONIC CLASS PROGRESSIONS",
      "EPIC PSION",
    ].join("\n");
    expect(new EpicClassesText(text).read()).toEqual([
      {
        name: "Monk",
        bonusFeatList: "Armor Skin, Blinding Speed.",
        features: [
          {
            name: "AC Bonus",
            description: "The monk's bonus to Armor Class increases by +1 every five levels higher than 20th.",
          },
          { name: "Bonus Feats", description: "The epic monk gains a bonus feat every five levels higher than 20th." },
        ],
        table: [
          { level: 21, special: [] },
          { level: 25, special: ["Bonus feat"] },
        ],
      },
    ]);
  });
});
