import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import Library from "@/codegen/dnd3.5/tools/seeds/Library.ts";

/** What a book copies of the core feats: each core feat by its name, a family's by its name and options. */
function copiedFeatsOf(book: string) {
  return Library.book(book)
    .cowFeats()
    .map((copy) => ({
      feat: "feat" in copy ? copy.feat : `${copy.family.familyName}: ${copy.family.options}`,
      aptitudes: copy.aptitudes,
    }));
}

describe("The core feats a book copies", () => {
  test("are those its bonus feat lists name, a family's for each option, by their letters", () => {
    const copies = copiedFeatsOf("complete-adventurer");
    expect(copies).toContainEqual({ feat: "Acrobatic", aptitudes: ["Exemplar Bonus Feat", "Scout Bonus Feat"] });
    expect(copies).toContainEqual({
      feat: "Skill Focus: SKILLS_WITH_CHECKS",
      aptitudes: ["Exemplar Bonus Feat", "Scout Bonus Feat"],
    });
    expect(copies).toContainEqual({ feat: "Rapid Reload: CROSSBOW_WEAPONS", aptitudes: ["Scout Bonus Feat"] });
    // The book's own new feats, its "Improved Swimming?" and "Hear the Unseen?", which its feats file lists
    const names = copies.map(({ feat }) => feat.toLowerCase());
    expect(names.filter((name) => /swimming|unseen|brachiation|open minded/.test(name))).toEqual([]);
  });

  test("leave out a list's entry that names no feat, which a class's issues report", () => {
    // No class of Complete Divine or Complete Arcane lists a core feat: the geomancer's ley lines and the wu jen's spell
    // secrets are pools of their own
    expect(copiedFeatsOf("complete-divine")).toEqual([]);
    expect(copiedFeatsOf("complete-arcane")).toEqual([]);
    const geomancer = References.loadClasses("complete-divine").find(({ ref }) => ref.raw.name === "Geomancer");
    if (!geomancer) throw new Error("Complete Divine has no geomancer");
    const fragment = "a new terrain in which to receive the benefit (at +1)";
    const listing = {
      ...geomancer.ref.mapping,
      bonusFeatLists: [{ aptitude: "Ley Lines", feats: ["Alertness", fragment] }],
    };
    expect(Library.book("complete-divine").unknownListedFeats({ ...geomancer.ref, mapping: listing })).toEqual([
      fragment,
    ]);
  });
});
