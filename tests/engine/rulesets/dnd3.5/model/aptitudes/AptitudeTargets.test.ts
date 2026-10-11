import { describe, expect, test } from "bun:test";

import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";

describe("the aptitudes' target grammar", () => {
  test("read a list's pool, its spell levels' slots and uses, and its join, by the list's slug", () => {
    expect(AptitudeTargets.parsePool("aptitudes.fighterbonusfeat.allowed")).toBe("fighterbonusfeat");
    expect(AptitudeTargets.parseSpellLevel("aptitudes.wizardspells.3.allowed")).toEqual({
      list: "wizardspells",
      level: 3,
      field: "allowed",
    });
    expect(AptitudeTargets.parseSpellLevel("aptitudes.wizardspells.0.uses")).toEqual({
      list: "wizardspells",
      level: 0,
      field: "uses",
    });
    expect(AptitudeTargets.parseJoin("aptitudes.luckdomain.joinsclasslist")).toBe("luckdomain");
    expect(AptitudeTargets.parseAllowed("aptitudes.general.allowed")).toBe("general");
    expect(AptitudeTargets.parseAllowed("aptitudes.wizardspells.9.allowed")).toBe("wizardspells");
    expect(AptitudeTargets.parseList("aptitudes.luckdomain.joinsclasslist")).toBe("luckdomain");
  });

  test("tell the shapes apart: a pool is no spell level, a slot's uses no pool or slot allowed, a join neither", () => {
    expect(AptitudeTargets.parsePool("aptitudes.wizardspells.3.allowed")).toBeUndefined();
    expect(AptitudeTargets.parseSpellLevel("aptitudes.general.allowed")).toBeUndefined();
    expect(AptitudeTargets.parseAllowed("aptitudes.wizardspells.3.uses")).toBeUndefined();
    expect(AptitudeTargets.parseSpellLevel("aptitudes.luckdomain.joinsclasslist")).toBeUndefined();
    expect(AptitudeTargets.parseJoin("aptitudes.luckdomain.1.allowed")).toBeUndefined();
  });

  test("take only what the listing writes: a slug, a whole level, an anchored field", () => {
    for (const target of [
      "aptitudes.General.allowed",
      "aptitudes.wizard_spells.1.allowed",
      "aptitudes.wizard.1e1.allowed",
      "aptitudes.wizard. 3.allowed",
      "aptitudes.é.allowed",
    ]) {
      expect([target, AptitudeTargets.parsePool(target) ?? AptitudeTargets.parseSpellLevel(target)]).toEqual([
        target,
        undefined,
      ]);
    }

    expect(AptitudeTargets.parseAllowed("aptitudes.x.foo.notallowed")).toBeUndefined();
    expect(AptitudeTargets.parseList("aptitudesx.general.allowed")).toBeUndefined();
  });
});
