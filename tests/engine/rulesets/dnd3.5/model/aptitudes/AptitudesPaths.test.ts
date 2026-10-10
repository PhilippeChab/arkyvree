import { describe, expect, test } from "bun:test";

import AptitudesPaths from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesPaths.ts";

describe("the aptitudes' target grammar", () => {
  test("read a list's pool, its spell levels' slots and uses, and its join, by the list's slug", () => {
    expect(AptitudesPaths.parsePool("aptitudes.fighterbonusfeat.allowed")).toBe("fighterbonusfeat");
    expect(AptitudesPaths.parseSpellLevel("aptitudes.wizardspells.3.allowed")).toEqual({
      list: "wizardspells",
      level: 3,
      field: "allowed",
    });
    expect(AptitudesPaths.parseSpellLevel("aptitudes.wizardspells.0.uses")).toEqual({
      list: "wizardspells",
      level: 0,
      field: "uses",
    });
    expect(AptitudesPaths.parseJoin("aptitudes.luckdomain.joinsclasslist")).toBe("luckdomain");
    expect(AptitudesPaths.parseAllowed("aptitudes.general.allowed")).toBe("general");
    expect(AptitudesPaths.parseAllowed("aptitudes.wizardspells.9.allowed")).toBe("wizardspells");
    expect(AptitudesPaths.parseList("aptitudes.luckdomain.joinsclasslist")).toBe("luckdomain");
  });

  test("tell the shapes apart: a pool is no spell level, a slot's uses no pool or slot allowed, a join neither", () => {
    expect(AptitudesPaths.parsePool("aptitudes.wizardspells.3.allowed")).toBeUndefined();
    expect(AptitudesPaths.parseSpellLevel("aptitudes.general.allowed")).toBeUndefined();
    expect(AptitudesPaths.parseAllowed("aptitudes.wizardspells.3.uses")).toBeUndefined();
    expect(AptitudesPaths.parseSpellLevel("aptitudes.luckdomain.joinsclasslist")).toBeUndefined();
    expect(AptitudesPaths.parseJoin("aptitudes.luckdomain.1.allowed")).toBeUndefined();
  });

  test("take only what the listing writes: a slug, a whole level, an anchored field", () => {
    for (const target of [
      "aptitudes.General.allowed",
      "aptitudes.wizard_spells.1.allowed",
      "aptitudes.wizard.1e1.allowed",
      "aptitudes.wizard. 3.allowed",
      "aptitudes.é.allowed",
    ]) {
      expect([target, AptitudesPaths.parsePool(target) ?? AptitudesPaths.parseSpellLevel(target)]).toEqual([
        target,
        undefined,
      ]);
    }

    expect(AptitudesPaths.parseAllowed("aptitudes.x.foo.notallowed")).toBeUndefined();
    expect(AptitudesPaths.parseList("aptitudesx.general.allowed")).toBeUndefined();
  });
});
