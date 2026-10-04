import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@/server/errors/index.ts";
import { getTargetPathsWithLabels } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { createTestRuleset, createTestUser, getSeedCtx, NIL_UUID } from "@/tests/helpers.ts";

type Kind = "modifier" | "requirement";
type EntityType = Parameters<typeof getTargetPathsWithLabels>[2];

/** The seeded D&D 3.5 ruleset's target paths and segment labels. */
async function seedPaths(kind: Kind, entityType?: EntityType) {
  const { rulesetId } = await getSeedCtx();
  return await getTargetPathsWithLabels(rulesetId, kind, entityType);
}

const isAptitudeGrant = (p: { category: string; path: string }) =>
  p.category === "aptitudes" && /\.(uses|allowed)$/.test(p.path);

// Completing and validating a path through the API are covered in the customization target router test.
describe("TargetPathsService", () => {
  test("lists paths in every category, with a readable label for each segment", async () => {
    const { paths, segmentLabels } = await seedPaths("modifier");
    expect([...new Set(paths.map((p) => p.category))]).toEqual(
      expect.arrayContaining(["abilities", "skills", "saves", "combat", "identity", "aptitudes"]),
    );
    expect(paths[0]).toEqual(
      expect.objectContaining({
        path: expect.any(String),
        description: expect.any(String),
        valueType: expect.any(String),
        operators: expect.any(Array),
      }),
    );

    const unlabelled = paths
      .flatMap((p) => p.path.split("."))
      .filter((segment) => segment !== "*" && !/^\d+$/.test(segment) && !(segment in segmentLabels));
    expect([...new Set(unlabelled)]).toEqual([]);
    expect(segmentLabels).toMatchObject({
      abilities: "Abilities",
      saves: "Saving Throws",
      powers: "Spells",
      classes: "Classes",
      ac: "Armor Class",
      hp: "Hit Points",
      bab: "Base Attack Bonus",
      xp: "Experience Points",
      checkpenalty: "Check Penalty",
      spellfailure: "Spell Failure",
      maxdex: "Maximum Dexterity",
      strength: "Strength",
      "*": "All",
      // A class's spells read as the class.
      wizard: "Wizard",
    });
    // A numeric property value (an armor's -1 check penalty) doesn't take over a spell level's label.
    expect(Object.entries(segmentLabels).filter(([key, label]) => /^\d+$/.test(key) && /^-\d/.test(label))).toEqual([]);
  });

  test("writes descriptions for people: capitalized, without property type codes", async () => {
    const { paths } = await seedPaths("modifier");
    expect(paths.filter((p) => p.category === "combat" && p.description[0] !== p.description[0].toUpperCase())).toEqual(
      [],
    );
    const propertyPaths = paths.filter((p) => p.path.includes(".properties."));
    expect(propertyPaths.length).toBeGreaterThan(0);
    expect(propertyPaths.filter((p) => /[A-Z]{2,}_[A-Z]/.test(p.description))).toEqual([]);
  });

  test("describes a wildcard as all of a kind when modifying, and any when requiring", async () => {
    const modifierWildcards = (await seedPaths("modifier")).paths.filter((p) => p.path.includes(".*"));
    expect(modifierWildcards.length).toBeGreaterThan(0);
    expect(modifierWildcards.filter((p) => /\bany\b/i.test(p.description))).toEqual([]);

    const featWildcards = (await seedPaths("requirement")).paths.filter(
      (p) => p.category === "feats" && p.path.includes(".*"),
    );
    expect(featWildcards.length).toBeGreaterThan(0);
    expect(featWildcards.filter((p) => !p.description.startsWith("Any "))).toEqual([]);
  });

  test("leaves totals to requirements", async () => {
    expect((await seedPaths("modifier")).paths.filter((p) => p.path.endsWith(".total"))).toEqual([]);
    const totals = (await seedPaths("requirement")).paths.filter((p) => p.path.endsWith(".total")).map((p) => p.path);
    for (const prefix of ["combat.ac", "combat.hp", "skills.", "saves.", "abilities."]) {
      expect(totals.some((path) => path.startsWith(prefix))).toBe(true);
    }
  });

  test("leaves the parts the sheet computes to requirements: a modifier can't change them", async () => {
    // From an ability, the size, the gear and the load, computed when read
    const computed = [
      "combat.tohit.strength",
      "combat.tohit.size",
      "combat.damage.strength",
      "combat.ac.dexterity",
      "combat.ac.size",
      "combat.ac.touch",
      "combat.ac.flatfooted",
      "combat.hp.constitution",
      "combat.initiative.dexterity",
      "combat.grapple.bab",
      "combat.grapple.strength",
      "combat.grapple.size",
      "combat.encumbrance.heavyload",
      "items.weapons.longsword.tohit.strength",
      "items.weapons.longsword.damage.strength",
      "skills.climb.ability",
      "skills.climb.weight",
      "saves.fortitude.ability",
    ];
    const pathsOf = async (kind: Kind) => new Set((await seedPaths(kind)).paths.map((p) => p.path));
    const [modifiable, requirable] = [await pathsOf("modifier"), await pathsOf("requirement")];
    expect(computed.filter((path) => modifiable.has(path))).toEqual([]);
    expect(computed.filter((path) => !requirable.has(path))).toEqual([]);
    // Their inputs stay modifiable: the flat bonuses, the armor's AC, the carried weight
    const inputs = [
      "combat.ac.misc",
      "combat.ac.armor",
      "combat.encumbrance.carriedweight",
      "items.weapons.longsword.tohit.misc",
      "skills.climb.misc",
    ];
    expect(inputs.filter((path) => !modifiable.has(path))).toEqual([]);
  });

  test("lists each path once, to modifiers and to requirements", async () => {
    for (const kind of ["modifier", "requirement"] as const) {
      const paths = (await seedPaths(kind)).paths.map((p) => p.path);
      expect(paths.filter((path, i) => paths.indexOf(path) !== i)).toEqual([]);
    }
  });

  test("lists a feat named like its family as that feat, beside its family's wildcard", async () => {
    // Martial Weapon Proficiency, every martial weapon, and the family of the feats for one. The feat isn't taken twice:
    // `count` there is the feat's, so the family's count isn't listed either
    const paths = (await seedPaths("requirement")).paths.filter((p) =>
      p.path.startsWith("feats.martialweaponproficiency."),
    );
    expect(paths.map((p) => [p.path, p.description])).toEqual([
      ["feats.martialweaponproficiency.possessed", "Whether the character has this feat"],
      [
        "feats.martialweaponproficiency.*.possessed",
        "Any Martial Weapon Proficiency feats — Whether this feat is possessed",
      ],
      ["feats.martialweaponproficiency.*.count", "Any Martial Weapon Proficiency feats — Times this feat was taken"],
    ]);
  });

  test("offers aptitude uses and picks only to the entities that grant them", async () => {
    for (const entityType of ["klass_levels", "feats", "races", undefined] as const) {
      expect((await seedPaths("modifier", entityType)).paths.some(isAptitudeGrant)).toBe(true);
    }
    for (const entityType of ["items", "powers"] as const) {
      const { paths } = await seedPaths("modifier", entityType);
      expect(paths.filter(isAptitudeGrant)).toEqual([]);
      expect(paths.some((p) => p.category === "combat")).toBe(true);
    }
  });

  test("lists spell slots per level, and spells known by class, never by domain or specialty", async () => {
    const { paths } = await seedPaths("requirement");
    expect(paths.some((p) => p.path.startsWith("aptitudes.wizardspells.0."))).toBe(true);

    const known = paths.filter((p) => p.category === "powers" && p.path.endsWith(".known")).map((p) => p.path);
    expect(known.some((path) => path.includes(".wizard."))).toBe(true);
    expect(known.filter((path) => /spells\.known|domain|specialist/.test(path))).toEqual([]);
  });

  test("lists a fork's inherited paths", async () => {
    const { rulesetId } = await getSeedCtx();
    const { user } = await createTestUser();
    const fork = await createTestRuleset(user.id, { rulesetId, ancestorRulesetIds: [rulesetId] });
    const { paths, segmentLabels } = await getTargetPathsWithLabels(fork.id, "modifier");
    expect(paths.some((p) => p.path.startsWith("aptitudes.wizardspells.0."))).toBe(true);
    expect(segmentLabels.strength).toBe("Strength");
  });

  test("throws NotFoundError for a missing ruleset", async () => {
    await expect(getTargetPathsWithLabels(NIL_UUID, "modifier")).rejects.toThrow(NotFoundError);
  });

  describe("completing a path", () => {
    const complete = async (
      partialPath: string,
      kind: Kind,
      {
        search,
        limit = 50,
        page = 1,
        flat = false,
      }: { search?: string; limit?: number; page?: number; flat?: boolean } = {},
    ) => {
      const { rulesetId } = await getSeedCtx();
      return await TargetPathsService.getCompletions(
        rulesetId,
        partialPath,
        partialPath.length,
        kind,
        undefined,
        search,
        limit,
        page,
        flat,
      );
    };
    const pathsOf = (result: Awaited<ReturnType<typeof complete>>) => result.items.map((item) => item.path);

    // The path browser's search box: any leaf, whatever the drilled prefix.
    test("finds leaves anywhere by their path or a segment's label, in order, a page at a time", async () => {
      // "Knowledge (Arcana)" is only the label of the knowledgearcana segment.
      const byLabel = pathsOf(await complete("", "modifier", { search: "knowledge (arcana)", flat: true }));
      expect(byLabel).toContain("skills.knowledgearcana.misc");
      expect(byLabel).toEqual([...byLabel].sort());

      const [first, second] = [
        await complete("", "modifier", { search: "strength", flat: true, limit: 3 }),
        await complete("", "modifier", { search: "strength", flat: true, limit: 3, page: 2 }),
      ];
      expect([first.nextPage, second.nextPage]).toEqual([2, 3]);
      expect([...pathsOf(first), ...pathsOf(second)].every((path) => path?.includes("strength"))).toBe(true);
      expect(pathsOf(second).filter((path) => pathsOf(first).includes(path))).toEqual([]);
    });

    test("describe a wildcard as all of a kind when modifying, and any when requiring", async () => {
      const wildcard = async (kind: Kind) =>
        (await complete("abilities.", kind)).items.find((item) => item.label === "*")?.detail;
      expect([await wildcard("modifier"), await wildcard("requirement")]).toEqual(["All abilities", "Any ability"]);
    });

    test("offer a leaf's siblings when the path goes a dot past it", async () => {
      expect((await complete("abilities.strength.misc.", "modifier")).items.map((item) => item.insertText)).toEqual([
        "misc",
      ]);
    });

    test("complete nothing after a leading dot, which names no path", async () => {
      expect([(await complete(".", "modifier")).items, (await complete(".a", "modifier")).items]).toEqual([[], []]);
    });

    test("complete a segment partly typed: its groups first, described, then its leaves", async () => {
      const items = (await complete("feats.weap", "modifier")).items;
      expect(items.slice(0, 2)).toMatchObject([
        { label: "weaponfocus", kind: "group", detail: "All Weapon Focus feats" },
        { label: "weaponspecialization", kind: "group", detail: "All Weapon Specialization feats" },
      ]);
      expect(items.slice(2).every((item) => item.kind === "property" && item.label.startsWith("weapon"))).toBe(true);
    });

    test("complete a leaf partly typed with its path, and what it holds", async () => {
      expect((await complete("abilities.strength.mi", "modifier")).items).toMatchObject([
        {
          label: "misc",
          kind: "property",
          path: "abilities.strength.misc",
          valueType: expect.any(String),
          operators: expect.any(Array),
        },
      ]);
    });

    test("describe an item's stat by its kind, whatever the item", async () => {
      expect((await complete("items.weapons.club.tohit.st", "requirement")).items).toMatchObject([
        { label: "strength", detail: "Str/Dex bonus to attack" },
      ]);
    });

    test("describe each weapon by its name", async () => {
      expect((await complete("items.weapons.", "modifier", { limit: 1 })).items).toMatchObject([
        { label: "bastardsword", detail: "Bastard Sword weapon stats" },
      ]);
    });
  });

  describe("validating a path", () => {
    const validate = async (path: string, kind: Kind = "modifier") =>
      TargetPathsService.validatePath((await getSeedCtx()).rulesetId, path, kind);

    test("accepts a full path", async () => {
      expect(await validate("abilities.strength.misc")).toMatchObject({ isValid: true, errors: [], suggestions: [] });
      expect(await validate("abilities.strength.total", "requirement")).toMatchObject({ isValid: true });
    });

    test("accepts a family's counts when requiring, not when modifying", async () => {
      for (const path of ["feats.metamagic.count", "feats.sneakattack.*.count"]) {
        expect((await validate(path, "requirement")).isValid).toBe(true);
        expect((await validate(path)).isValid).toBe(false);
      }
    });

    test("refuses an unknown category, suggesting close ones", async () => {
      expect((await validate("")).errors[0]).toMatchObject({ code: "INVALID_CATEGORY", severity: "error" });
      const result = await validate("abil.something");
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatchObject({
        code: "INVALID_CATEGORY",
        message: expect.stringContaining("Unknown category 'abil'"),
      });
      expect(result.suggestions).toEqual(["abilities"]);
    });

    test("warns about a path that stops short, suggesting how it goes on", async () => {
      const result = await validate("abilities.strength");
      expect(result).toMatchObject({ isValid: false, errors: [{ code: "INCOMPLETE_PATH", severity: "warning" }] });
      expect(result.suggestions).toContain("abilities.strength.misc");
    });

    test("refuses a path that leaves the tree, and a total when modifying", async () => {
      expect((await validate("abilities.nonexistent.path")).isValid).toBe(false);
      expect((await validate("abilities.strength.total")).isValid).toBe(false);
    });
  });
});
