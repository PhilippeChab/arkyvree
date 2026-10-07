import { expect, test } from "bun:test";

import * as RULESET_NAMES from "@/content/dnd3.5/names.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

import { seededRows } from "./seededRows.ts";

/** The families the rulesets' feats are in (their FEAT_FAMILY). */
function familiesOf(rulesets: Awaited<ReturnType<typeof seededRulesets>>) {
  return new Set(rulesets.flatMap((rows) => rows.properties.filter((p) => p.type === FEAT_FAMILY).map((p) => p.value)));
}

/** Every seeded ruleset's rows. */
async function seededRulesets() {
  const rulesets = [];
  for (const name of Object.values(RULESET_NAMES)) rulesets.push(await seededRows(name));
  return rulesets;
}

test("The seeded families of feats are the built-in ones the customization offers", async () => {
  expect([...familiesOf(await seededRulesets())].sort()).toEqual([...FEAT_FAMILIES].sort());
});

test("The seeded generated feats are a family's feats for each of its options, its name naming the option", async () => {
  const feats = (await seededRulesets()).flatMap((rows) => rows.feats);
  const familiesOf = (generated: boolean) => [
    ...new Set(feats.filter((feat) => feat.generated === generated).map((feat) => feat.name.split(": ")[0])),
  ];
  expect(feats.filter((feat) => feat.generated && !/^[^:]+: ./.test(feat.name))).toEqual([]);
  expect(familiesOf(true).sort()).toEqual([
    "Arcane Defense",
    "Deity's Weapon Focus",
    "Deity's Weapon Specialization",
    "Disemboweling Strike",
    "Exotic Weapon Proficiency",
    "Favored Enemy",
    "Favored Enemy Specialization",
    "Greater Resiliency",
    "Greater Spell Focus",
    "Greater Weapon Focus",
    "Greater Weapon Specialization",
    "Head Shot",
    "Improved Critical",
    "Martial Weapon Proficiency",
    "Power Critical",
    "Rapid Reload",
    "Simple Weapon Proficiency",
    "Skill Focus",
    "Spell Focus",
    "War Domain Weapon",
    "Weapon Focus",
    "Weapon Specialization",
  ]);
  // A class feature's options are written one by one: they aren't generated
  expect(familiesOf(false)).toEqual(expect.arrayContaining(["Secret", "Terrain Mastery"]));
});

test("Every seeded check of a feat names a feat or a family of the seeded rules", async () => {
  const rulesets = await seededRulesets();
  const feats = new Set(rulesets.flatMap((rows) => rows.feats.map((feat) => stripSeparators(feat.name))));
  const families = new Set([...familiesOf(rulesets)].map(stripSeparators));
  // A feat by its name (`feats.dodge.possessed`, a stackable one's `.count`), a family by its wildcard
  // (`feats.metamagic.*.possessed`) or its count (`feats.luck.count`)
  const namesNothing = (path: string) => {
    const [category, name, next] = path.split(".");
    if (category !== "feats") return false;
    if (next === "*") return !families.has(name);
    return !feats.has(name) && !(next === "count" && families.has(name));
  };

  // The checks' targets, and the paths their formulas read ("{{ 3 - [feats.itemcreation.count] }}")
  const paths = rulesets.flatMap((rows) =>
    [...rows.requirements, ...rows.modifiers].flatMap(({ target, value }) => [
      ...(target ? [target] : []),
      ...[...(value ?? "").matchAll(/\[([^\]]+)\]/g)].map(([, path]) => path.trim()),
    ]),
  );
  expect([...new Set(paths.filter(namesNothing))]).toEqual([]);
});
