import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { favoredEnemy } from "@/database/packages/dnd35-from-parser/generated/srd/feats/favoredEnemy.ts";
import {
  SPELL_WEAPON_FOCUS_FEATS,
  WEAPON_PROFICIENCY_FEATS,
  WIZARD_SCHOOL_FEATS,
} from "@/database/packages/dnd35-from-parser/generated/srd/feats/feats.ts";
import { WIZARD_SCHOOLS } from "@/database/packages/dnd35-from-parser/generated/srd/wizard-schools/data.ts";
import { buildClassFeatSeeds, classModifiers } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import {
  escapeTemplate,
  importLines,
  quote,
  REQUIREMENT_IMPORTS,
  requirementImports,
  stringifyFeatModifier,
  stringifyModifier,
  stringifyRequirement,
} from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";
import { generateClassSeed } from "@/database/packages/dnd35-from-parser/tools/generator/generators/class.ts";
import {
  coreSystemFeats,
  generateFeatSeeds,
} from "@/database/packages/dnd35-from-parser/tools/generator/generators/feat.ts";
import { loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { and, eq, eqNum, eqStr, feat, gte, or } from "@/database/packages/dnd35/content/requirements.ts";
import type { Modifier, RequirementCondition, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";

const check = (operator: string, valueType: string, value: string): RequirementCondition => ({
  target: "abilities.strength.score",
  operator,
  value,
  valueType,
});
const code = (req: RequirementEntry) => stringifyRequirement(req, new Set());

describe("A generated requirement check", () => {
  test("is written with the builder that makes it", () => {
    expect(code(eq(feat("Power Attack")))).toBe(`eq("feats.powerattack.possessed")`);
    expect(code(eqNum("classes.fighter.level", 4))).toBe(`eqNum("classes.fighter.level", 4)`);
    expect(code(gte("combat.bab", 6))).toBe(`gte("combat.bab", 6)`);
    expect(code(eqStr("identity.alignment", `Lawful "Good"`))).toBe(`eqStr("identity.alignment", "Lawful \\"Good\\"")`);
  });

  test("is written with its builder only when the builder makes that very check", () => {
    expect(code(check("greater_than_or_equal", "number", "1.5"))).toBe(`gte("abilities.strength.score", 1.5)`);
    for (const value of ["013", "{{ [classes.fighter.level] }}", ""]) {
      expect(code(check("greater_than_or_equal", "number", value))).toBe(
        `{ target: "abilities.strength.score", operator: "greater_than_or_equal", value: ${JSON.stringify(value)}, valueType: "number" }`,
      );
    }
  });

  test("is written as an object when no builder makes it, escaped", () => {
    expect(code(check("equal", "boolean", "false"))).toBe(
      `{ target: "abilities.strength.score", operator: "equal", value: "false", valueType: "boolean" }`,
    );
    for (const operator of ["not_equal", "greater_than", "less_than", "less_than_or_equal"]) {
      expect(code(check(operator, "number", "13"))).toBe(
        `{ target: "abilities.strength.score", operator: "${operator}", value: "13", valueType: "number" }`,
      );
    }
    expect(code(check("not_equal", "string", `a "quoted"\\ value`))).toBe(
      `{ target: "abilities.strength.score", operator: "not_equal", value: "a \\"quoted\\"\\\\ value", valueType: "string" }`,
    );
  });

  test("groups its children with or / and", () => {
    expect(code(or(eq(feat("Dodge")), gte("combat.bab", 4)))).toBe(
      `or(eq("feats.dodge.possessed"), gte("combat.bab", 4))`,
    );
  });

  test("records the builders it's written with, which the file imports", () => {
    const uses = new Set<string>();
    stringifyRequirement(and(or(eq(feat("Dodge")), gte("combat.bab", 4)), check("not_equal", "number", "13")), uses);
    expect([...uses].sort()).toEqual(["and", "eq", "gte", "or"]);
    expect(requirementImports(uses)).toEqual([
      `import { and, eq, gte, or } from "@/database/packages/dnd35/content/requirements.ts";`,
    ]);
    expect(requirementImports(new Set())).toEqual([]);
  });

  test("of a feat's modifier is imported with it", () => {
    const uses = new Set<string>();
    expect(
      stringifyFeatModifier(
        {
          target: "combat.ac.misc",
          operator: "add",
          value: "1",
          valueType: "number",
          requirements: [eq(feat("Dodge"))],
        },
        uses,
      ),
    ).toBe(
      `{ target: "combat.ac.misc", operator: "add", value: "1", valueType: "number", requirements: [eq("feats.dodge.possessed")] }`,
    );
    expect([...uses]).toEqual(["eq"]);
  });

  test("of another modifier (a domain's, a race's, an item's) can't be", () => {
    const modifier = { target: "combat.ac.misc", operator: "add", value: "1", valueType: "number" };
    expect(stringifyModifier(modifier)).toBe(
      `{ target: "combat.ac.misc", operator: "add", value: "1", valueType: "number" }`,
    );
    // A hand-edited reference, which types don't check
    const edited: Modifier = JSON.parse(JSON.stringify({ ...modifier, requirements: [eq(feat("Dodge"))] }));
    expect(() => stringifyModifier(edited)).toThrow("only a feat's modifier has requirements");
  });

  test("names a builder its file can import", () => {
    expect(() => importLines(new Set(["eq", "xor"]), REQUIREMENT_IMPORTS)).toThrow("xor");
  });

  test("with a number where its value is text is written as the number's text", () => {
    const hand = (value: unknown) =>
      JSON.parse(
        JSON.stringify({ target: "combat.bab", operator: "greater_than_or_equal", value, valueType: "number" }),
      );
    expect(code(hand(4))).toBe(`gte("combat.bab", 4)`);
    expect(stringifyModifier(hand(2))).toBe(
      `{ target: "combat.bab", operator: "greater_than_or_equal", value: "2", valueType: "number" }`,
    );
  });

  test("of a feat's modifier is imported by its feats file", () => {
    const ref = structuredClone(loadReference(join(REFERENCE_DIR, "complete-divine", "feats.json"), "feat"));
    const entry = ref.raw.find(
      ({ name, featType }) => featType !== "epic" && !ref.mapping[name]?.skip && !ref.mapping[name]?.template,
    );
    if (!entry) throw new Error("no regular feat");
    ref.mapping[entry.name].modifiers = [
      {
        target: "combat.ac.misc",
        operator: "add",
        value: "1",
        valueType: "number",
        requirements: [eqNum("abilities.strength.score", 13)],
      },
    ];
    const generated = generateFeatSeeds(ref);
    expect(generated).toContain(`requirements: [eqNum("abilities.strength.score", 13)]`);
    expect(generated).toMatch(
      /^import \{[^}]*\beqNum\b[^}]*\} from "@\/database\/packages\/dnd35\/content\/requirements\.ts";$/m,
    );
  });
});

describe("Generated strings", () => {
  test("are escaped for a string literal", () => {
    expect(quote(`a "b" \\ c\nd`)).toBe(`"a \\"b\\" \\\\ c\\nd"`);
    for (const text of ["line\r\nbreak", "tab\there", "nul\u0000"]) expect(JSON.parse(quote(text))).toBe(text);
    expect(stringifyModifier({ target: `x."y"`, operator: "add", value: "1", valueType: "number" })).toBe(
      `{ target: "x.\\"y\\"", operator: "add", value: "1", valueType: "number" }`,
    );
  });

  test("keep a template description's text, the item named where it's mentioned", () => {
    const ref = structuredClone(loadReference(join(REFERENCE_DIR, "srd", "feats.json"), "feat"));
    ref.mapping["Weapon Focus"].description = "With the selected weapon: `a` ${b} \\u0000.";
    expect(generateFeatSeeds(ref)).toContain("description: `With ${w}: \\`a\\` \\${b} \\\\u0000.`,");
  });

  test("are escaped for a template literal: its backticks and interpolations too", () => {
    const text = 'a `b` ${c} "d"';
    expect(escapeTemplate(text)).toBe('a \\`b\\` \\${c} \\"d\\"');
    expect(new Function(`return \`${escapeTemplate(text)}\`;`)()).toBe(text);
  });
});

describe("The generated feats", () => {
  test("hold the system feats the aptitude list reads", () => {
    expect([...WIZARD_SCHOOL_FEATS, ...WEAPON_PROFICIENCY_FEATS, ...SPELL_WEAPON_FOCUS_FEATS, ...favoredEnemy]).toEqual(
      coreSystemFeats(WIZARD_SCHOOLS),
    );
  });

  test("refuse a template family's modifier with requirements, whose targets can't follow the item", () => {
    const ref = structuredClone(loadReference(join(REFERENCE_DIR, "srd", "feats.json"), "feat"));
    ref.mapping["Weapon Focus"].modifiers = [
      {
        target: "combat.tohit.misc",
        operator: "add",
        value: "1",
        valueType: "number",
        requirements: [gte("combat.tohit.base", 3)],
      },
    ];
    expect(() => generateFeatSeeds(ref)).toThrow("a template feat's modifier can't have requirements");
  });

  test("require a family's feat for the same item, and any other feat or requirement as it is", () => {
    const ref = structuredClone(loadReference(join(REFERENCE_DIR, "srd", "feats.json"), "feat"));
    const greater = ref.mapping["Greater Spell Focus"];
    greater.requirements = [...(greater.requirements ?? []), eq(feat("Combat Casting")), gte("spellcasting.arcane", 1)];
    greater.featNameMap = { ...greater.featNameMap, combatcasting: "Combat Casting" };
    const generated = generateFeatSeeds(ref);
    const template = generated.slice(generated.indexOf("export const greaterSpellFocus"));
    expect(template).toContain("eq(feat(`Spell Focus: ${s}`)),");
    expect(template).toContain(`eq(feat("Combat Casting")),`);
    expect(template).toContain(`gte("spellcasting.arcane", 1),`);
  });

  test("refuse a family checked inside a group, which can't name the item", () => {
    for (const [template, group] of [
      ["Greater Spell Focus", or(eq(feat("Spell Focus")), gte("spellcasting.arcane", 1))],
      ["Weapon Specialization", or(eq(feat("Weapon Focus")), gte("combat.bab", 6))],
    ] as const) {
      const ref = structuredClone(loadReference(join(REFERENCE_DIR, "srd", "feats.json"), "feat"));
      ref.mapping[template].requirements = [group];
      expect(() => generateFeatSeeds(ref)).toThrow(
        `${template}: a family it requires inside a group can't be written for each item`,
      );
    }
  });

  test("let an extension's family require the core rules' for the same item", () => {
    const ref = loadReference(join(REFERENCE_DIR, "complete-warrior", "feats.json"), "feat");
    const generated = generateFeatSeeds(ref);
    const template = generated.slice(generated.indexOf("export const powerCritical"));
    expect(template.slice(0, template.indexOf("}));"))).toContain("eq(feat(`Weapon Focus: ${w}`)),");
  });

  test("require any feat of a family a feat or a class names by the family's own name", () => {
    const feats = generateFeatSeeds(loadReference(join(REFERENCE_DIR, "complete-scoundrel", "feats.json"), "feat"));
    const daringWarrior = feats.slice(feats.indexOf(`name: "Daring Warrior"`));
    expect(daringWarrior.slice(0, daringWarrior.indexOf("},"))).toContain(
      `eq("feats.weaponspecialization.*.possessed"),`,
    );
    const warChanter = generateClassSeed(
      loadReference(join(REFERENCE_DIR, "complete-warrior", "classes", "warChanter.json"), "class"),
    );
    expect(warChanter).toContain(`eq("feats.weaponfocus.*.possessed"),`);
    expect(warChanter).toContain(`eq("feats.combatexpertise.possessed"),`);
  });

  test("require any class's feat of a class feature a feat or a class names, or a number of them all together", () => {
    const feats = generateFeatSeeds(loadReference(join(REFERENCE_DIR, "complete-scoundrel", "feats.json"), "feat"));
    const asceticStalker = feats.slice(feats.indexOf(`name: "Ascetic Stalker"`));
    expect(asceticStalker.slice(0, asceticStalker.indexOf("},"))).toContain(`eq("feats.kipower.*.possessed"),`);
    const arcaneTrickster = generateClassSeed(
      loadReference(join(REFERENCE_DIR, "dmg", "classes", "arcaneTrickster.json"), "class"),
    );
    expect(arcaneTrickster).toContain(`gte("feats.sneakattack.count", 2),`);
  });

  test("make luck and draconic feats a family, which a feat checks one of, or a number of", () => {
    const entry = (feats: string, name: string) => {
      const from = feats.slice(feats.indexOf(`name: "${name}"`));
      return from.slice(0, from.indexOf("\n  },"));
    };
    const scoundrel = generateFeatSeeds(loadReference(join(REFERENCE_DIR, "complete-scoundrel", "feats.json"), "feat"));
    expect(entry(scoundrel, "Tempting Fate")).toContain(`eq("feats.luck.*.possessed"),`);
    expect(entry(scoundrel, "Better Lucky than Good")).toContain(`gte("feats.luck.count", 2),`);
    expect(entry(scoundrel, "Better Lucky than Good")).toContain(`{ type: "FEAT_FAMILY", value: "Luck" },`);
    const arcane = generateFeatSeeds(loadReference(join(REFERENCE_DIR, "complete-arcane", "feats.json"), "feat"));
    expect(entry(arcane, "Draconic Legacy")).toContain(`gte("feats.draconic.count", 4),`);
    expect(entry(arcane, "Draconic Breath")).toContain(`{ type: "FEAT_FAMILY", value: "Draconic" },`);
  });
});

describe("A generated class", () => {
  const classRef = (book: string, slug: string) =>
    loadReference(join(REFERENCE_DIR, book, "classes", `${slug}.json`), "class");

  test("requires one of a family's feats, or a number of them", () => {
    expect(generateClassSeed(classRef("complete-scoundrel", "fortunesFriend"))).toContain(
      `eq("feats.luck.*.possessed"),`,
    );
    expect(generateClassSeed(classRef("complete-adventurer", "exemplar"))).toContain(
      `eq("feats.skillfocus.*.possessed"),`,
    );
    expect(generateClassSeed(classRef("complete-adventurer", "maester"))).toContain(
      `gte("feats.itemcreation.count", 2),`,
    );
    // "Spell Focus (two schools of magic)"
    expect(generateClassSeed(classRef("dmg", "archmage"))).toContain(`gte("feats.spellfocus.count", 2),`);
  });

  test("reads its table's columns into level modifiers: a number's rise, a text where it changes", () => {
    const monk = structuredClone(classRef("srd", "monk"));
    const modifiers = (column: string) =>
      classModifiers(monk)
        .filter(({ target }) => target === monk.overrides?.columns?.[column]?.target)
        .map(({ level, value, operator }) => `${level} ${operator} ${value}`);
    // "+0 ft." … "+60 ft."; "+0" … "+4"; "1d6" … "2d10"
    expect(modifiers("Unarmored Speed Bonus")).toEqual([
      "3 add 10",
      "6 add 10",
      "9 add 10",
      "12 add 10",
      "15 add 10",
      "18 add 10",
    ]);
    expect(modifiers("AC Bonus")).toEqual(["5 add 1", "10 add 1", "15 add 1", "20 add 1"]);
    expect(modifiers("Unarmed Damage")).toEqual([
      "1 set 1d6",
      "4 set 1d8",
      "8 set 1d10",
      "12 set 2d6",
      "16 set 2d8",
      "20 set 2d10",
    ]);
    // Gated as its mapping says
    expect(classModifiers(monk).find(({ target }) => target === "combat.speed.base")?.requirements).toEqual(
      monk.overrides?.columns?.["Unarmored Speed Bonus"]?.requirements,
    );
    // A blank cell keeps the value above it, and a typographic minus is a minus
    monk.raw.progression[5].columns!["AC Bonus"] = "";
    monk.raw.progression[6].columns!["AC Bonus"] = "\u22121";
    expect(modifiers("AC Bonus").slice(0, 4)).toEqual(["5 add 1", "7 add -2", "8 add 2", "10 add 1"]);
    // A column its table doesn't have
    monk.overrides!.columns = { "Ki Points": { target: "combat.ac.misc", operator: "add" } };
    expect(() => classModifiers(monk)).toThrow('Monk: its table has no "Ki Points" column');
  });

  test("grants the existing feat a feature is, named in another case or by a family's option, not a copy of it", () => {
    for (const [book, slug, granted, feature] of [
      [
        "complete-adventurer",
        "dreadPirate",
        `[1, "Two-Weapon Fighting", "Dread Pirate Class Feature"]`,
        "Two-weapon Fighting (Dread Pirate)",
      ],
      [
        "complete-scoundrel",
        "malconvoker",
        `[3, "Skill Focus: Bluff", "Malconvoker Class Feature"]`,
        "Skill Focus (Bluff) (Malconvoker)",
      ],
      [
        "complete-warrior",
        "orderOfTheBowInitiate",
        `[6, "Sharp-Shooting", "Order of the Bow Initiate Class Feature"]`,
        "Sharp-shooting (Order of the Bow Initiate)",
      ],
    ] as const) {
      const ref = classRef(book, slug);
      expect(generateClassSeed(ref)).toContain(granted);
      expect(buildClassFeatSeeds(ref).map((f) => f.name)).not.toContain(feature);
    }
  });
});
