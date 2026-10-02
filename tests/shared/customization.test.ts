import { describe, expect, test } from "bun:test";

import { CUSTOMIZABLE_ENTITY_TYPES, CUSTOMIZATION_OWNER_TYPES } from "@/shared/customization/entities.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { deriveSegmentLabels, formatSegment, pickTargetLabels } from "@/shared/customization/target.ts";

describe("A path segment's label", () => {
  test("splits camel case and capitalizes", () => {
    expect(formatSegment("privateNotes")).toBe("Private Notes");
    expect(formatSegment("strength")).toBe("Strength");
  });

  test("is its override, else the segment formatted, for every segment of the paths", () => {
    expect(
      deriveSegmentLabels([{ path: "saves.fortitude.misc" }, { path: "saves.will.total" }], { misc: "Miscellaneous" }),
    ).toEqual({ saves: "Saves", fortitude: "Fortitude", misc: "Miscellaneous", will: "Will", total: "Total" });
  });
});

describe("A target's labels", () => {
  const labels = {
    abilities: "Abilities",
    charisma: "Charisma",
    modifier: "Modifier",
    classes: "Classes",
    ranger: "Ranger",
  };

  test("are those of its path's segments that have one", () => {
    expect(pickTargetLabels(["abilities.charisma.unknown"], labels)).toEqual({
      abilities: "Abilities",
      charisma: "Charisma",
    });
  });

  test("are those of a template's path, bare or bracketed, and of every path of an expression", () => {
    const charisma = { abilities: "Abilities", charisma: "Charisma", modifier: "Modifier" };
    expect(pickTargetLabels(["{{ abilities.charisma.modifier }}"], labels)).toEqual(charisma);
    expect(pickTargetLabels(["{{ [abilities.charisma.modifier] }}"], labels)).toEqual(charisma);
    expect(
      pickTargetLabels(["{{ floor([classes.ranger.level] / 2) + [abilities.charisma.modifier] }}"], labels),
    ).toEqual({ ...charisma, classes: "Classes", ranger: "Ranger" });
  });
});

describe("Customizations", () => {
  test("label a property type from its constant's name", () => {
    expect(formatPropertyType("SPELL_SCHOOL")).toBe("Spell School");
    expect(formatPropertyType("FEAT_FAMILY")).toBe("Feat Family");
  });

  test("belong to a customizable entity, or a modifier for its requirements", () => {
    expect(CUSTOMIZATION_OWNER_TYPES).toEqual([...CUSTOMIZABLE_ENTITY_TYPES, "modifiers"]);
  });
});
