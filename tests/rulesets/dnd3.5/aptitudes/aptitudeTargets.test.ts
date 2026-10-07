import { describe, expect, test } from "bun:test";

import {
  parseAptitudeAllowed,
  parseAptitudeJoin,
  parseAptitudeList,
  parseAptitudePool,
  parseAptitudeSpellLevel,
} from "@/server/rulesets/dnd3.5/aptitudes/aptitudeTargets.ts";

describe("the aptitudes' target grammar", () => {
  test("read a list's pool, its spell levels' slots and uses, and its join, by the list's slug", () => {
    expect(parseAptitudePool("aptitudes.fighterbonusfeat.allowed")).toBe("fighterbonusfeat");
    expect(parseAptitudeSpellLevel("aptitudes.wizardspells.3.allowed")).toEqual({
      list: "wizardspells",
      level: 3,
      field: "allowed",
    });
    expect(parseAptitudeSpellLevel("aptitudes.wizardspells.0.uses")).toEqual({
      list: "wizardspells",
      level: 0,
      field: "uses",
    });
    expect(parseAptitudeJoin("aptitudes.luckdomain.joinsclasslist")).toBe("luckdomain");
    expect(parseAptitudeAllowed("aptitudes.general.allowed")).toBe("general");
    expect(parseAptitudeAllowed("aptitudes.wizardspells.9.allowed")).toBe("wizardspells");
    expect(parseAptitudeList("aptitudes.luckdomain.joinsclasslist")).toBe("luckdomain");
  });

  test("tell the shapes apart: a pool is no spell level, a slot's uses no pool or slot allowed, a join neither", () => {
    expect(parseAptitudePool("aptitudes.wizardspells.3.allowed")).toBeUndefined();
    expect(parseAptitudeSpellLevel("aptitudes.general.allowed")).toBeUndefined();
    expect(parseAptitudeAllowed("aptitudes.wizardspells.3.uses")).toBeUndefined();
    expect(parseAptitudeSpellLevel("aptitudes.luckdomain.joinsclasslist")).toBeUndefined();
    expect(parseAptitudeJoin("aptitudes.luckdomain.1.allowed")).toBeUndefined();
  });

  test("take only what the listing writes: a slug, a whole level, an anchored field", () => {
    for (const target of [
      "aptitudes.General.allowed",
      "aptitudes.wizard_spells.1.allowed",
      "aptitudes.wizard.1e1.allowed",
      "aptitudes.wizard. 3.allowed",
      "aptitudes.é.allowed",
    ]) {
      expect([target, parseAptitudePool(target) ?? parseAptitudeSpellLevel(target)]).toEqual([target, undefined]);
    }
    expect(parseAptitudeAllowed("aptitudes.x.foo.notallowed")).toBeUndefined();
    expect(parseAptitudeList("aptitudesx.general.allowed")).toBeUndefined();
  });
});
