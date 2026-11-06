import { describe, expect, test } from "bun:test";

import type { FormField } from "@/engine/core/fields/index.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";
import { createKeyedApi, expectOk, guestApi } from "@/tests/support/api.ts";
import { getPf1SeedCtx } from "@/tests/support/pf1/seed.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_RANKS } from "@/vocabulary/pf1/fields/index.ts";

/** The other base rules, 3.5's, which Pathfinder's are described beside. */
const DND35_BASE_RULES = BASE_RULES_OPTIONS.find((rules) => rules !== PF1_BASE_RULES)!;

/** Where a form's field sends its value: its stored field, a link its role; a group, its label. */
function placeOf(field: FormField) {
  return field.input === "group" ? field.label : (field.field ?? field.role);
}

/** A new character's form's select's options, by its field's key, as a form's items lay it out. */
function selectOptions(form: { sections: { kind: string; lines?: unknown[][] }[] }, key: string) {
  const items = form.sections.flatMap(({ lines = [] }) => lines.flat()) as { key?: string; options?: unknown[] }[];
  return items.find((item) => item.key === key)?.options;
}

/** Every base rules' description, as `GET /api/rules` answers it to anyone. */
async function allRules() {
  return await expectOk(guestApi.api.rules.$get());
}

describe("Pathfinder's rules", () => {
  test("are described beside 3.5's, to anyone", async () => {
    expect(DND35_BASE_RULES).toBe("Dungeons & Dragons: 3.5");
    expect(Object.keys(await allRules()).sort()).toEqual([DND35_BASE_RULES, PF1_BASE_RULES].sort());
  });

  test("give its kinds, its words and its tiers, its spell levels from the cantrips to the 9th", async () => {
    const pathfinder = (await allRules())[PF1_BASE_RULES];
    expect(pathfinder.kinds.map(({ type }) => type)).toEqual([
      "races",
      "languages",
      "skills",
      "feats",
      "spells",
      "items",
      "aptitudes",
      "classes",
      "saves",
      "abilities",
      "mechanics",
    ]);
    expect(pathfinder.words["class-levels"]).toEqual({
      many: "Class Levels",
      one: "Class Level",
      position: { many: "Levels", one: "Level" },
    });
    expect(pathfinder.advancementWord).toEqual({ many: "Levels", one: "Level" });
    expect(pathfinder.tiers.map(({ label }) => label)).toEqual([
      "Cantrips",
      ...Array.from({ length: 9 }, (_, i) => `Level ${i + 1}`),
    ]);
  });

  test("give its own fields: a class level's skill ranks, where 3.5's gives skill points", async () => {
    const rules = await allRules();
    const places = (baseRules: (typeof BASE_RULES_OPTIONS)[number]) =>
      (rules[baseRules].fields["class-levels"] ?? []).map(placeOf);
    expect(places(PF1_BASE_RULES)).toEqual(["baseBonus", "grants", CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_RANKS]);
    expect(places(DND35_BASE_RULES)).not.toContain(CLASS_LEVEL_SKILL_RANKS);
  });

  test("lay a class's saves out with the Core Rulebook's progressions, a prestige class's among them", async () => {
    const { progression } = (await allRules())[PF1_BASE_RULES];
    const described = JSON.stringify(progression);
    for (const preset of ["Good", "Poor", "Prestige Good", "Prestige Poor"]) expect(described).toContain(`"${preset}"`);
    expect(JSON.stringify((await allRules())[DND35_BASE_RULES].progression)).not.toContain("Prestige Good");
  });

  test("give a new character's form the Core Rulebook's alignments, its Neutral 3.5's True Neutral", async () => {
    const rules = await allRules();
    const alignments = selectOptions(rules[PF1_BASE_RULES].characterForm, "CHARACTER_ALIGNMENT");
    expect(alignments).toContain("Neutral");
    expect(alignments).not.toContain("True Neutral");
    expect(selectOptions(rules[DND35_BASE_RULES].characterForm, "CHARACTER_ALIGNMENT")).toContain("True Neutral");
  });

  test("name its bonded creatures' kinds, a paladin's bonded mount, and import from no program", async () => {
    const pathfinder = (await allRules())[PF1_BASE_RULES];
    expect(pathfinder.entityKinds.map(({ label }) => label)).toEqual([
      "Player Character",
      "Familiar",
      "Animal Companion",
      "Bonded Mount",
    ]);
    expect(pathfinder.importers).toEqual([]);
  });

  test("carry the Core Rulebook's Open Game License notice", async () => {
    const { license } = (await allRules())[PF1_BASE_RULES];
    expect(license).toMatchObject({ text: "ogl" });
    expect(license?.notice).toContain("Pathfinder Roleplaying Game Core Rulebook");
  });

  test("are described by the public API too, by the base rules a ruleset names", async () => {
    const { api } = await createKeyedApi();
    const v1 = await expectOk(api.v1.rules.$get());
    expect(Object.keys(v1).sort()).toEqual([DND35_BASE_RULES, PF1_BASE_RULES].sort());
    const { rulesetId } = await getPf1SeedCtx();
    const { baseRules } = await expectOk(api.v1.rulesets[":id"].$get({ param: { id: rulesetId } }));
    expect(baseRules).toBe(PF1_BASE_RULES);
    const pathfinder = v1[baseRules];
    expect(pathfinder.kinds.map(({ type }) => type)).toContain("feats");
    expect(pathfinder.characterKinds.map(({ value }) => value)).toEqual(["pc", "familiar", "animalcompanion", "mount"]);
    expect(
      (pathfinder.fields["class-levels"] ?? []).map((field) => ("field" in field ? field.field : undefined)),
    ).toContain(CLASS_LEVEL_SKILL_RANKS);
    expect(pathfinder.importers).toEqual([]);
  });
});
