import { describe, expect, test } from "bun:test";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/srd/domains/data.ts";
import { CREATURE_TYPES } from "@/database/packages/dnd35/content/creatureTypes.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { describeRequirement, seededRows } from "@/tests/seeds/seededRows.ts";

const proficiency = (kind: string, weapon: string) => ["1 or", `1.1 feats.${kind}weaponproficiency.possessed equal true`, `1.2 feats.${kind}weaponproficiency${weapon}.possessed equal true`];
const casterLevel = (level: number) => ["1 or", `1.1 spellcasting.arcane greater_than_or_equal ${level}`, `1.2 spellcasting.divine greater_than_or_equal ${level}`];
const bab1 = "2 combat.bab greater_than_or_equal 1";

describe("The seeded core rules", () => {
  test.each([
    ["feats", "Weapon Focus: Longsword", [...proficiency("martial", "longsword"), bab1]],
    ["feats", "Weapon Focus: Dagger", [...proficiency("simple", "dagger"), bab1]],
    ["feats", "Weapon Specialization: Longsword", ["1 feats.weaponfocuslongsword.possessed equal true", "2 classes.fighter.level greater_than_or_equal 4"]],
    ["feats", "Greater Weapon Specialization: Greatsword", [
      "1 feats.greaterweaponfocusgreatsword.possessed equal true", "2 feats.weaponfocusgreatsword.possessed equal true",
      "3 feats.weaponspecializationgreatsword.possessed equal true", "4 classes.fighter.level greater_than_or_equal 12",
    ]],
    ["feats", "Greater Spell Focus: Evocation", ["1 feats.spellfocusevocation.possessed equal true"]],
    ["feats", "Brew Potion", casterLevel(3)],
    ["feats", "Forge Ring", casterLevel(12)],
    ["feats", "Advance Wizard Spellcasting", ["1 classes.wizard.level greater_than_or_equal 1"]],
    ["feats", "Advance Bard Spellcasting", ["1 classes.bard.level greater_than_or_equal 1"]],
    ["feats", "Necromancy Specialist", ["1 classes.wizard.level greater_than_or_equal 1"]],
    ["items", "Handaxe", proficiency("martial", "handaxe")],
    ["items", "Longsword", proficiency("martial", "longsword")],
  ] as const)("%s: %s has its requirements", async (type, name, expected) => {
    const rows = await seededRows();
    const entity = type === "feats" ? rows.feat(name) : rows.items.find((item) => item.name === name)!;
    expect(rows.requirementsOf(entity.id).map(describeRequirement).sort()).toEqual([...expected]);
  });

  describe("cleric domains", () => {
    test("each have a feat in Cleric Domain without requirements, and a spell list of their spells", async () => {
      const rows = await seededRows();
      const clericDomain = rows.aptitude("Cleric Domain");
      expect(rows.feats.filter((feat) => feat.name.endsWith(" Domain")).length).toBe(ALL_DOMAINS.length);
      for (const domain of ALL_DOMAINS) {
        const feat = rows.feat(`${domain.name} Domain`);
        expect(feat.featsAptitudesInRules.map((link) => link.aptitudeId)).toEqual([clericDomain.id]);
        expect(rows.requirementsOf(feat.id)).toEqual([]);

        const spellList = rows.aptitude(`${domain.name} Domain Spells`);
        const spells = rows.powers.flatMap((power) => power.powersAptitudesInRules.filter((link) => link.aptitudeId === spellList.id).map((link) => `${link.level} ${power.name.toLowerCase()}`));
        expect({ domain: domain.name, spells: spells.sort() }).toEqual({ domain: domain.name, spells: domain.spells.map((s) => `${s.level} ${s.name.toLowerCase()}`).sort() });
      }
    });

    test("each open a domain spell a spell level, as the cleric reaches it, and carry their other powers", async () => {
      const rows = await seededRows();
      // The cleric level each spell level opens at: the first at the first.
      const opensAt = [1, 3, 5, 7, 9, 11, 13, 15, 17];
      for (const domain of ALL_DOMAINS) {
        const feat = rows.feat(`${domain.name} Domain`);
        const spells = `aptitudes.${stripSeparators(domain.name)}domainspells.`;
        const modifiers = rows.modifiersOf(feat.id);
        const slots = modifiers.filter((m) => m.target.startsWith(spells)).map((m) => {
          const clericLevel = rows.requirementsOf(m.id).map((r) => `${r.target} ${r.operator} ${r.value}`);
          return `${m.target.slice(spells.length)} ${m.operator} ${m.value} ${clericLevel.join()}`.trim();
        });
        expect({ domain: domain.name, slots: slots.sort() }).toEqual({
          domain: domain.name,
          slots: opensAt.flatMap((clericLevel, i) => {
            const requirement = i === 0 ? "" : ` classes.cleric.level greater_than_or_equal ${clericLevel}`;
            return [`${i + 1}.allowed set -1${requirement}`, `${i + 1}.uses add 1${requirement}`];
          }).sort(),
        });
        const others = modifiers.filter((m) => !m.target.startsWith(spells)).map(({ target, operator, value, valueType }) => ({ target, operator, value, valueType }));
        expect({ domain: domain.name, others }).toEqual({ domain: domain.name, others: domain.modifiers ?? [] });
      }
    });

    test.each([
      ["Animal", ["knowledgenature"]],
      ["Knowledge", ["knowledgearcana", "knowledgearchitectureandengineering", "knowledgedungeoneering", "knowledgegeography", "knowledgehistory", "knowledgelocal", "knowledgenature", "knowledgenobilityandroyalty", "knowledgepsionics", "knowledgereligion", "knowledgetheplanes"]],
      ["Travel", ["survival"]],
      ["Trickery", ["bluff", "disguise", "hide"]],
    ])("%s makes its skills cleric class skills", async (domain, skills) => {
      const rows = await seededRows();
      const classSkills = rows.modifiersOf(rows.feat(`${domain} Domain`).id).filter((m) => m.target.endsWith(".innate"));
      expect(classSkills.map((m) => `${m.target} ${m.operator} ${m.value}`).sort()).toEqual(skills.map((skill) => `skills.${skill}.innate set true`));
    });

    test("a cleric picks two at the first level", async () => {
      const rows = await seededRows();
      const picks = rows.modifiersOf(rows.klassLevel("Cleric", 1).id).filter((m) => m.target === "aptitudes.clericdomain.allowed");
      expect(picks).toMatchObject([{ operator: "add", value: "2" }]);
    });
  });

  describe("favored enemies", () => {
    const variants = CREATURE_TYPES.map((type) => `Favored Enemy: ${type}`);
    const umbrellaSlots = (rows: Awaited<ReturnType<typeof seededRows>>) =>
      rows.modifiersOf(rows.feat("Favored Enemy (Ranger)").id).filter((m) => m.target === "aptitudes.favoredenemy.allowed");

    test("are a feat a creature type, not stackable, in the shared aptitude and the Favored Enemy family", async () => {
      const rows = await seededRows();
      const aptitude = rows.aptitude("Favored Enemy");
      for (const name of variants) {
        const feat = rows.feat(name);
        const family = rows.properties.filter((p) => p.entityId === feat.id && p.type === "FEAT_FAMILY").map((p) => p.value);
        expect({ name, stackable: feat.stackable, aptitudes: feat.featsAptitudesInRules.map((link) => link.aptitudeId), family }).toEqual({ name, stackable: false, aptitudes: [aptitude.id], family: ["Favored Enemy"] });
      }
    });

    test("get a slot from the ranger's umbrella feat", async () => {
      expect(umbrellaSlots(await seededRows())).toMatchObject([{ operator: "add", value: "1" }]);
    });
  });
});
