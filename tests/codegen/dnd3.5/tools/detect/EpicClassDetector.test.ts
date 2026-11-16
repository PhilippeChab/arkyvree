import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { CORE_BOOK } from "@/vocabulary/dnd3.5/books.ts";

describe("EpicClassDetector", () => {
  const epic = References.find(CORE_BOOK, "epicClass")!;

  test("reads each class's table into its core features' patterns past 20th, and its bonus feats'", () => {
    expect(epic.detected["Barbarian"].features).toEqual([
      { feature: "Trap Sense (Barbarian)", first: 21, every: 3 },
      { feature: "Damage Reduction (Barbarian)", first: 22, every: 3 },
      { feature: "Rage (Barbarian)", first: 24, every: 4 },
    ]);
    // Smite evil shows once in its table: its paragraph's "every five levels" is its pattern
    expect(epic.detected["Paladin"].features).toContainEqual({ feature: "Smite Evil (Paladin)", first: 25, every: 5 });
    expect(epic.detected["Fighter"]).toMatchObject({ features: [], bonusFeats: { first: 22, every: 2 } });
    expect(Object.values(epic.detected).flatMap((detected) => detected.unresolved ?? [])).toEqual([]);
  });

  test("makes each class's bonus feats a pool of its own, its list's sentences after its feats left out", () => {
    const { bonusFeatList, bonusFeats } = epic.mapping["Fighter"];
    expect(bonusFeats).toMatchObject({ feature: "Epic Bonus Feat (Fighter)", first: 22, every: 2 });
    expect(bonusFeatList.aptitude).toBe("Epic Fighter Bonus Feat");
    expect(bonusFeatList.feats.at(-1)).toBe("Uncanny Accuracy");
    expect(epic.mapping["Fighter"].joins).toEqual(["Fighter Bonus Feat"]);
  });
});
