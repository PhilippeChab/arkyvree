import { describe, expect, test } from "bun:test";

import type { FormField } from "@/engine/core/fields/index.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";
import { createKeyedApi, expectOk, guestApi } from "@/tests/support/api.ts";
import { getDnd52SeedCtx } from "@/tests/support/dnd5.2/seed.ts";
import { DND52_BASE_RULES } from "@/vocabulary/dnd5.2/baseRules.ts";
import { CLASS_CASTER_TYPE, CLASS_HD, SPECIES_SIZE, SPECIES_SPEED } from "@/vocabulary/dnd5.2/fields/index.ts";

/** A new character's form's items, as its sections lay them out. */
function formItems(form: { sections: { kind: string; lines?: unknown[][] }[] }) {
  return form.sections.flatMap(({ lines = [] }) => lines.flat()) as {
    key?: string;
    options?: unknown[];
    role?: string;
  }[];
}

/** Where a form's field sends its value: its stored field, a link its role; a group, its label. */
function placeOf(field: FormField) {
  return field.input === "group" ? field.label : (field.field ?? field.role);
}

/** Every base rules' description, as `GET /api/rules` answers it to anyone. */
async function allRules() {
  return await expectOk(guestApi.api.rules.$get());
}

describe("D&D 5th Edition's rules", () => {
  test("are described beside every other base rules', to anyone", async () => {
    expect(Object.keys(await allRules()).sort()).toEqual([...BASE_RULES_OPTIONS].sort());
    expect(BASE_RULES_OPTIONS).toContain(DND52_BASE_RULES);
  });

  test("give its kinds, species and backgrounds in place of races, its words and its spell levels", async () => {
    const rules = (await allRules())[DND52_BASE_RULES];
    expect(rules.kinds.map(({ type }) => type)).toEqual([
      "species",
      "backgrounds",
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
    expect(rules.words.species).toEqual({ many: "Species", one: "Species" });
    expect(rules.words.backgrounds).toEqual({ many: "Backgrounds", one: "Background" });
    expect(rules.advancementWord).toEqual({ many: "Levels", one: "Level" });
    expect(rules.tiers.map(({ label }) => label)).toEqual([
      "Cantrips",
      ...Array.from({ length: 9 }, (_, i) => `Level ${i + 1}`),
    ]);
    expect(rules.customizable.toSorted()).toEqual(
      ["backgrounds", "class-levels", "classes", "feats", "items", "species", "spells"].toSorted(),
    );
  });

  test("give its own fields: a class's hit die, caster type and proficiencies, a class level its grants alone", async () => {
    const { fields } = (await allRules())[DND52_BASE_RULES];
    const places = (type: string) => (fields[type as keyof typeof fields] ?? []).map(placeOf);
    expect(places("classes")).toEqual([
      CLASS_HD,
      CLASS_CASTER_TYPE,
      "spellcastingAbility",
      "startingProficiencies",
      "multiclassProficiencies",
    ]);
    // No base attack, no saves, no skill points: a level grants features, its pools' rooms its modifiers
    expect(places("class-levels")).toEqual(["grants"]);
    expect(places("species")).toEqual([SPECIES_SIZE, SPECIES_SPEED]);
    expect(places("backgrounds")).toEqual(["abilityScore"]);
  });

  test("give a new character's form its species and its background to pick, and the SRD's alignments", async () => {
    const { characterForm, entityKinds, importers } = (await allRules())[DND52_BASE_RULES];
    const items = formItems(characterForm);
    expect(items.flatMap(({ role }) => (role ? [role] : []))).toEqual(["species", "background"]);
    expect(items.find(({ key }) => key === "CHARACTER_ALIGNMENT")?.options).toContain("Neutral");
    expect(entityKinds.map(({ label }) => label)).toEqual(["Player Character"]);
    expect(importers).toEqual([]);
  });

  test("carry the SRD 5.2.1's Creative Commons attribution, not the Open Game License", async () => {
    const { license } = (await allRules())[DND52_BASE_RULES];
    expect(license).toEqual({
      notice:
        "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
      text: "cc-by-4.0",
    });
  });

  test("are described by the public API too, by the base rules a ruleset names", async () => {
    const { api } = await createKeyedApi();
    const v1 = await expectOk(api.v1.rules.$get());
    expect(Object.keys(v1).sort()).toEqual([...BASE_RULES_OPTIONS].sort());
    const { rulesetId } = await getDnd52SeedCtx();
    const { baseRules } = await expectOk(api.v1.rulesets[":id"].$get({ param: { id: rulesetId } }));
    expect(baseRules).toBe(DND52_BASE_RULES);
    const rules = v1[baseRules];
    expect(rules.kinds.map(({ type }) => type)).toEqual(expect.arrayContaining(["species", "backgrounds", "feats"]));
    expect(rules.kinds.map(({ type }) => type)).not.toContain("races");
    expect(rules.characterKinds.map(({ value }) => value)).toEqual(["pc"]);
    expect((rules.fields.classes ?? []).map((field) => ("field" in field ? field.field : undefined))).toContain(
      CLASS_CASTER_TYPE,
    );
    expect(rules.importers).toEqual([]);
  });
});
