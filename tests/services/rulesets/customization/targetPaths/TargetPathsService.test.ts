import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";
import { createTestRuleset, readTargetPaths } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

function isAptitudeGrant(p: { path?: string }) {
  return /^aptitudes\..*\.(uses|allowed)$/.test(p.path ?? "");
}

function pathsOf(result: Awaited<ReturnType<typeof complete>>) {
  return result.items.map((item) => item.path);
}

async function complete(
  partialPath: string,
  kind: TargetPathKind,
  {
    search,
    limit = 50,
    page = 1,
    flat = false,
  }: { flat?: boolean; limit?: number; page?: number; search?: string } = {},
) {
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
}

/** Every leaf path of a kind an entity type takes (`entityType`, every path without one), as the completions list them. */
async function pathsTaken(kind: TargetPathKind, entityType?: string) {
  const { rulesetId } = await getSeedCtx();
  const { items } = await TargetPathsService.getCompletions(
    rulesetId,
    "",
    0,
    kind,
    entityType,
    undefined,
    10_000,
    1,
    true,
  );
  return items;
}

/** The seeded D&D 3.5 ruleset's target paths and segment labels. */
async function seedPaths(kind: TargetPathKind) {
  const { rulesetId } = await getSeedCtx();
  return await readTargetPaths(rulesetId, kind);
}

async function validate(path: string, kind: TargetPathKind = "modifier", entityType?: string) {
  return TargetPathsService.validatePath((await getSeedCtx()).rulesetId, path, kind, entityType);
}

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

  test("lists for a template what it reads, one value each: totals and modifiers too, no wildcard, family or list", async () => {
    const requirement = (await seedPaths("requirement")).paths;
    const template = (await seedPaths("template")).paths.map((p) => p.path);
    const readable = new Set(template);
    for (const path of [
      "abilities.charisma.modifier",
      "combat.ac.total",
      "saves.fortitude.total",
      "feats.toughness.count",
      "spellcasting.arcane",
    ])
      expect([path, readable.has(path)]).toEqual([path, true]);
    // Each is a requirement's path, reaching one value from the sheet: an item's own weapon has no source in a template
    const requirementPaths = new Set(requirement.map((p) => p.path));
    expect(template.filter((path) => !requirementPaths.has(path))).toEqual([]);
    expect(
      template.filter(
        (path) =>
          path.includes("*") ||
          path.startsWith("weapon.") ||
          path === "skills.knowledge.rank" ||
          /^powers\.[a-z0-9]+\.properties\./.test(path),
      ),
    ).toEqual([]);
    expect(requirement.filter((p) => p.readsMany && readable.has(p.path))).toEqual([]);
    expect((await complete("abilities.charisma.", "template")).items.map((item) => item.path)).toContain(
      "abilities.charisma.modifier",
    );
  });

  test("refuses a template value the sheet couldn't evaluate, saying why, and takes one it can", async () => {
    const { rulesetId } = await getSeedCtx();
    const check = (value: string, target = "combat.ac.misc") =>
      withRulesetScope(db, rulesetId, async (scope) => {
        const catalogs = await RulesetViews.getTargetPathCatalogs(scope.ruleset, "modifier");
        return Engine.for(scope).targetPaths().planModifier(catalogs, "characters", { operator: "add", target, value })
          .valueType;
      });
    expect(await check("{{ floor([classes.ranger.level] / 2) }}")).toBe("number");
    expect(await check("{{ [abilities.charisma.modifier] }}")).toBe("number");
    expect(check("{{ [classes.rangr.level] }}")).rejects.toThrow(
      "classes.rangr.level isn't a path a template can read",
    );
    expect(check("{{ round([classes.ranger.level]) }}")).rejects.toThrow('Unknown function "round"');
    expect(check("{{ [abilities.*.modifier] }}")).rejects.toThrow("isn't a path a template can read");
    expect(check("{{ [identity.physiology.name] + 1 }}")).rejects.toThrow("arithmetic takes numbers");
  });

  test("leaves totals to requirements", async () => {
    expect((await seedPaths("modifier")).paths.filter((p) => p.path.endsWith(".total"))).toEqual([]);
    const totals = (await seedPaths("requirement")).paths.filter((p) => p.path.endsWith(".total")).map((p) => p.path);
    for (const prefix of ["combat.ac", "combat.hp", "skills.", "saves.", "abilities."])
      expect(totals.some((path) => path.startsWith(prefix))).toBe(true);
  });

  test("leaves the parts the sheet computes to requirements: a modifier can't change them", async () => {
    // From an ability, the size, the gear and the load, computed when read
    const computed = [
      "weapon.tohit.strength",
      "weapon.tohit.size",
      "weapon.tohit.gearpenalty",
      "weapon.damage.strength",
      "weapon.wielded",
      "combat.armor.category",
      "combat.shield.held",
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
      "items.weapons.longsword.tohit.gearpenalty",
      "items.weapons.longsword.wielded",
      "skills.climb.ability",
      "skills.climb.weight",
      "saves.fortitude.ability",
    ];
    const pathsOf = async (kind: TargetPathKind) => new Set((await seedPaths(kind)).paths.map((p) => p.path));
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

  test("lets a modifier on a pool's slots only grant more, or make a spell level's all known, with a literal", async () => {
    const pathOf = async (kind: TargetPathKind, path: string) =>
      (await seedPaths(kind)).paths.find((p) => p.path === path);
    const allKnown = [{ value: "-1", label: "All known" }];
    expect(await pathOf("modifier", "aptitudes.general.allowed")).toMatchObject({
      operators: ["add"],
      literalOnly: true,
    });
    expect(await pathOf("modifier", "aptitudes.wizardspells.1.allowed")).toMatchObject({
      operators: ["add", "set"],
      setValues: allKnown,
      literalOnly: true,
    });
    expect(await pathOf("modifier", "aptitudes.wizardspells.1.uses")).toMatchObject({
      operators: ["add"],
      literalOnly: true,
    });
    // A pool's own uses per day count on the sheet alone, and requirements only read the slots
    const ownUses = await pathOf("modifier", "aptitudes.general.uses");
    expect(ownUses?.operators).toContain("multiply");
    expect(ownUses?.literalOnly).toBeUndefined();
    expect((await pathOf("requirement", "aptitudes.general.allowed"))?.operators).toContain("greater_than");
  });

  test("lets a feat or a class level join a spell list to its class's, and gives a feat's list no known path", async () => {
    const pathOf = async (kind: TargetPathKind, path: string) =>
      (await seedPaths(kind)).paths.find((p) => p.path === path);
    expect(await pathOf("modifier", "aptitudes.firedomainspells.joinsclasslist")).toMatchObject({
      valueType: "boolean",
      operators: ["set"],
      allowedEntityTypes: ["feats", "klass_levels"],
    });
    expect((await pathOf("requirement", "aptitudes.firedomainspells.joinsclasslist"))?.operators).toEqual([
      "equal",
      "not_equal",
    ]);
    // A feat pool isn't a spell list
    expect(await pathOf("modifier", "aptitudes.general.joinsclasslist")).toBeUndefined();
    // Burning Hands, a wizard spell and a fire domain one, is known on the wizard's list only
    expect(await pathOf("requirement", "powers.burninghands.wizard.known")).toBeDefined();
    expect(await pathOf("requirement", "powers.burninghands.firedomain.known")).toBeUndefined();
  });

  test("lists what the engine reads without an entity of its own: the unarmed strike, the skill points, a skill family", async () => {
    const offered = async (kind: TargetPathKind) => new Map((await seedPaths(kind)).paths.map((p) => [p.path, p]));
    const [modifiers, requirements] = [await offered("modifier"), await offered("requirement")];
    for (const path of [
      "items.weapons.unarmedstrike.damage.base",
      "items.weapons.unarmedstrike.tohit.misc",
      "skills.budget.perlevel",
      "skills.knowledge.misc",
    ])
      expect(modifiers.has(path)).toBe(true);
    expect(modifiers.has("skills.budget.available")).toBe(false);
    expect(requirements.get("skills.budget.available")?.description).toBe("Skill points left to spend");
    expect(requirements.get("skills.knowledge.rank")?.description).toBe("Any Knowledge skill — Total ranks invested");
    expect(modifiers.get("skills.knowledge.misc")?.description).toBe(
      "All Knowledge skills — From feats, items, and spells",
    );
  });

  test("offers aptitude uses and picks only to the entities that grant them", async () => {
    for (const entityType of ["klass_levels", "feats", "races", undefined])
      expect((await pathsTaken("modifier", entityType)).some(isAptitudeGrant)).toBe(true);

    for (const entityType of ["items", "powers"]) {
      const paths = await pathsTaken("modifier", entityType);
      expect(paths.filter(isAptitudeGrant)).toEqual([]);
      expect(paths.some((p) => p.path?.startsWith("combat."))).toBe(true);
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
    const { paths, segmentLabels } = await readTargetPaths(fork.id, "modifier");
    expect(paths.some((p) => p.path.startsWith("aptitudes.wizardspells.0."))).toBe(true);
    expect(segmentLabels.strength).toBe("Strength");
  });

  test("throws NotFoundError for a missing ruleset", async () => {
    expect(TargetPathsService.validatePath(NIL_UUID, "combat.ac.misc")).rejects.toThrow(NotFoundError);
  });

  describe("completing a path", () => {
    test("lists every leaf for an empty search, leaving the cached catalog in its order", async () => {
      const { rulesetId } = await getSeedCtx();
      const order = async () => (await readTargetPaths(rulesetId, "modifier")).paths.map((path) => path.path);
      const before = await order();
      // The catalog keeps its categories' order, which isn't the paths' alphabetical one
      expect(before).not.toEqual([...before].sort((a, b) => a.localeCompare(b)));

      const all = pathsOf(await complete("", "modifier", { flat: true, limit: 10_000 }));
      expect(all).toEqual([...before].sort((a, b) => a.localeCompare(b)));
      expect(await order()).toEqual(before);
    });

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
      const wildcard = async (kind: TargetPathKind) =>
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
    test("accepts a full path, with its definition", async () => {
      expect(await validate("abilities.strength.misc")).toMatchObject({
        isValid: true,
        errors: [],
        suggestions: [],
        target: { path: "abilities.strength.misc", valueType: "number" },
      });
      expect(await validate("abilities.strength.total", "requirement")).toMatchObject({ isValid: true });
    });

    test("accepts a path among those its entity type takes", async () => {
      const grant = (await seedPaths("modifier")).paths.find(isAptitudeGrant);
      expect(grant).toBeDefined();
      const path = grant?.path ?? "";
      expect((await validate(path, "modifier", "feats")).target).toEqual(grant);
      const refused = await validate(path, "modifier", "items");
      expect(refused).toMatchObject({ isValid: false, errors: [{ code: "INVALID_PATH" }] });
      expect(refused.target).toBeUndefined();
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
