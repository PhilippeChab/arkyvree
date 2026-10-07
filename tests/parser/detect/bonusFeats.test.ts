import { describe, expect, test } from "bun:test";

import { getBonusFeatClassLevels } from "@/database/packages/dnd35-from-parser/tools/detect/bonusFeats.ts";
import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";

describe("A bonus feat list's class levels", () => {
  test("name the class by its name's path segment, whatever its file is named", () => {
    const wuJen = References.loadClasses("complete-arcane").find(({ file }) => file === "wuJen.json");
    if (!wuJen) throw new Error("Wu Jen isn't a class of Complete Arcane's");
    const ref = structuredClone(wuJen.ref);
    ref.mapping.bonusFeatLists = [{ aptitude: "Wu Jen Bonus Feat", feats: ["Dodge"], levels: [5, 10] }];
    expect(getBonusFeatClassLevels([{ file: wuJen.file, ref }]).get("Dodge")).toEqual([
      { classSlug: "wujen", minLevel: 5 },
    ]);
  });
});
