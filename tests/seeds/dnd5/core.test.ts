import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { ALL_CLASSES } from "@/content/dnd5/generated/srd/classes/index.ts";
import { ALL_SPECIES } from "@/content/dnd5/generated/srd/species.ts";
import { ALL_SPELLS } from "@/content/dnd5/generated/srd/spells/index.ts";
import { CORE, TEMPLATE_ITEMS } from "@/content/dnd5/packages/core.ts";
import { DND5_RULESET_NAME } from "@/content/dnd5/rulesetNames.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { findOtherCoreRulesets } from "@/tests/support/dnd5/seed.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5/abilities.ts";
import { DND5_BASE_RULES } from "@/vocabulary/dnd5/baseRules.ts";
import { CLASS_MULTICLASS_SLOTS, ITEM_IS_TEMPLATE } from "@/vocabulary/dnd5/fields/index.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd5/skills.ts";
import { MULTICLASS_SPELL_SLOTS, PACT_MAGIC_SLOTS, SPELL_LEVELS } from "@/vocabulary/dnd5/spells.ts";

import { seededRows } from "./seededRows.ts";

/** A modifier as its target, operator and value read. */
function describeModifier({ operator, target, value }: { operator: string; target: string; value: string }) {
  return `${target} ${operator} ${value}`;
}

/** A list of rows' names, sorted. */
function sortedNames(rows: { name: string }[]) {
  return rows.map(({ name }) => name).sort();
}

describe("The seeded D&D 5th Edition core rules", () => {
  test("are a base ruleset, Core SRD 5, of its base rules: a published, playable system ruleset", async () => {
    const [ruleset] = await db.select().from(rulesetsInRules).where(eq(rulesetsInRules.name, DND5_RULESET_NAME));
    expect(ruleset).toMatchObject({
      baseRules: DND5_BASE_RULES,
      kind: "ruleset",
      rulesetId: null,
      status: "Published",
      system: true,
      userId: null,
    });
    // Its package seeds no extension: its base rules' only system ruleset
    const system = (await Rulesets.findMany(db, { system: true })).filter(
      ({ baseRules }) => baseRules === DND5_BASE_RULES,
    );
    expect(system.map(({ name }) => name)).toEqual([DND5_RULESET_NAME]);
  });

  describe("hold the core package's content, kind by kind", () => {
    test("its 9 species, a player character's each", async () => {
      const rows = await seededRows();
      expect(rows.species).toHaveLength(9);
      expect(sortedNames(rows.species)).toEqual(sortedNames(ALL_SPECIES));
      expect(rows.species.filter(({ partition }) => partition !== "pc")).toEqual([]);
    });

    test("its 4 backgrounds", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.backgrounds)).toEqual(["Acolyte", "Criminal", "Sage", "Soldier"]);
    });

    test("its 12 classes, each with its 20 levels", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.classes)).toEqual(sortedNames(ALL_CLASSES));
      expect(rows.classes).toHaveLength(12);
      const levelCounts = rows.classes.map(({ id }) => rows.classLevels.filter(({ ownerId }) => ownerId === id).length);
      expect(new Set(levelCounts)).toEqual(new Set([20]));
    });

    test("its feats: the book's, the hand-written ones, and each skill's Skill Proficiency and Expertise", async () => {
      const rows = await seededRows();
      const skillFeats = SKILL_NAMES.flatMap((skill) => [`Skill Proficiency: ${skill}`, `Expertise: ${skill}`]);
      expect(sortedNames(rows.feats)).toEqual([...CORE.feats.map(({ name }) => name), ...skillFeats].sort());
    });

    test("its 339 spells", async () => {
      const rows = await seededRows();
      expect(rows.spells).toHaveLength(339);
      expect(sortedNames(rows.spells)).toEqual(sortedNames(ALL_SPELLS));
    });

    test("its items, the weapons, armor and Shield among them its templates", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.items)).toEqual(sortedNames([...TEMPLATE_ITEMS, ...CORE.items]));
      expect(sortedNames(rows.items.filter(({ fields }) => fields[ITEM_IS_TEMPLATE]))).toEqual(
        sortedNames(TEMPLATE_ITEMS),
      );
    });

    test("its 6 abilities, a saving throw of each, its languages and its 18 skills", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.abilities)).toEqual([...ABILITY_NAMES].sort());
      expect(sortedNames(rows.saves)).toEqual([...ABILITY_NAMES].sort());
      expect(rows.nameOf(rows.saves.find(({ name }) => name === "Wisdom")!.links.keyAbility!)).toBe("Wisdom");
      expect(sortedNames(rows.languages)).toEqual(sortedNames(CORE.languages));
      expect(sortedNames(rows.skills)).toEqual([...SKILL_NAMES].sort());
      expect(rows.nameOf(rows.skills.find(({ name }) => name === "Stealth")!.links.keyAbility!)).toBe("Dexterity");
    });

    test("its feat pools and spell lists, the book's", async () => {
      expect(sortedNames((await seededRows()).aptitudes)).toEqual([...CORE.aptitudes].sort());
    });
  });

  describe("hold the SRD's classes", () => {
    test("name a class's spellcasting ability and its proficiencies, a first class's and a multiclass's", async () => {
      const rows = await seededRows();
      const linked = (klass: string) =>
        Object.fromEntries(
          Object.entries(rows.klass(klass).links).map(([role, id]) => [role, rows.nameOf(id as string)]),
        );
      expect(linked("Fighter")).toEqual({
        multiclassProficiencies: "Fighter Multiclass Proficiencies",
        startingProficiencies: "Fighter Starting Proficiencies",
      });
      expect(linked("Wizard")).toEqual({
        multiclassProficiencies: "Wizard Multiclass Proficiencies",
        spellcastingAbility: "Intelligence",
        startingProficiencies: "Wizard Starting Proficiencies",
      });
    });

    test("grant a class's features at their levels, through its features' pool", async () => {
      const rows = await seededRows();
      const granted = (level: number) => rows.linkedNames(rows.classLevel("Fighter", level).id, "grants").sort();
      expect(granted(1)).toEqual([
        "Fighting Style (Fighter) via Fighter Features",
        "Second Wind (Fighter) via Fighter Features",
        "Weapon Mastery (Fighter) via Fighter Features",
      ]);
      expect(granted(5)).toEqual([
        "Extra Attack (Fighter) via Fighter Features",
        "Tactical Shift (Fighter) via Fighter Features",
      ]);
      // A feature a class gains again is granted at each of its levels: the fighter's Ability Score Improvements
      const improvements = rows.classLevels.filter(({ id }) =>
        rows.linkedNames(id, "grants").includes("Ability Score Improvement (Fighter) via Fighter Features"),
      );
      expect(improvements.map(({ position }) => position).sort((a, b) => a - b)).toEqual([4, 6, 8, 12, 14, 16]);
      expect(rows.linksOf(rows.classLevel("Fighter", 1).id, "grants").every(({ free }) => free)).toBe(true);
    });

    test("give a class's levels room in its pools: the fighter's style, masteries, subclass and feats", async () => {
      const rows = await seededRows();
      const modifiers = (level: number) =>
        rows.modifiersOf(rows.classLevel("Fighter", level).id).map(describeModifier).sort();
      expect(modifiers(1)).toEqual(["aptitudes.fightingstyle.allowed add 1", "aptitudes.weaponmastery.allowed add 3"]);
      expect(modifiers(2)).toEqual([]);
      expect(modifiers(3)).toEqual(["aptitudes.fightersubclass.allowed add 1"]);
      expect(modifiers(4)).toEqual([
        "aptitudes.abilityscoreimprovement.allowed add 1",
        "aptitudes.weaponmastery.allowed add 1",
      ]);
      expect(modifiers(19)).toEqual(["aptitudes.epicboon.allowed add 1"]);
    });

    test("give a wizard's levels its cantrips and its spellbook, a level's new spells at its highest level", async () => {
      const rows = await seededRows();
      const modifiers = (level: number) =>
        rows
          .modifiersOf(rows.classLevel("Wizard", level).id)
          .map(describeModifier)
          .filter((modifier) => !modifier.includes(".uses "))
          .sort();
      // Its spellbook's six level 1 spells, then two at each level, of the highest level it casts
      expect(modifiers(1)).toEqual([
        "aptitudes.wizardspells.0.allowed add 3",
        "aptitudes.wizardspells.1.allowed add 6",
      ]);
      expect(modifiers(2)).toEqual(["aptitudes.wizardspells.1.allowed add 2"]);
      expect(modifiers(3)).toEqual([
        "aptitudes.wizardspells.2.allowed add 2",
        "aptitudes.wizardsubclass.allowed add 1",
      ]);
      expect(modifiers(5)).toEqual(["aptitudes.wizardspells.3.allowed add 2"]);
    });

    test("give a cleric every spell of its list known from the first level its slots reach, its cantrips its picks", async () => {
      const rows = await seededRows();
      const modifiers = (level: number) =>
        rows
          .modifiersOf(rows.classLevel("Cleric", level).id)
          .map(describeModifier)
          .filter((modifier) => modifier.includes(".allowed "))
          .sort();
      expect(modifiers(1)).toEqual([
        "aptitudes.clericspells.0.allowed add 3",
        "aptitudes.clericspells.1.allowed set -1",
        "aptitudes.divineorder.allowed add 1",
      ]);
      expect(modifiers(2)).toEqual([]);
      expect(modifiers(3)).toEqual([
        "aptitudes.clericspells.2.allowed set -1",
        "aptitudes.clericsubclass.allowed add 1",
      ]);
    });

    test("give each casting class's levels its spell slots on its list, the SRD's at every level", async () => {
      const rows = await seededRows();
      // A class's own table is the Multiclass Spellcaster table's at the levels it counts: all a full caster's, half a
      // half caster's, rounded up
      const shares: Record<string, number> = {
        Bard: 1,
        Cleric: 1,
        Druid: 1,
        Sorcerer: 1,
        Wizard: 1,
        Paladin: 0.5,
        Ranger: 0.5,
      };
      for (const [klass, share] of Object.entries(shares)) {
        const slots = new Map<number, number>();
        for (let level = 1; level <= 20; level++) {
          for (const { target, value } of rows.modifiersOf(rows.classLevel(klass, level).id)) {
            const spellLevel = /^aptitudes\.[a-z]+spells\.(\d)\.uses$/.exec(target)?.[1];
            if (spellLevel) slots.set(Number(spellLevel), (slots.get(Number(spellLevel)) ?? 0) + Number(value));
          }
          const row = MULTICLASS_SPELL_SLOTS[Math.ceil(level * share) - 1];
          const expected = SPELL_LEVELS.slice(1).map((spellLevel) => row[spellLevel - 1]);
          expect([klass, level, SPELL_LEVELS.slice(1).map((spellLevel) => slots.get(spellLevel) ?? 0)]).toEqual([
            klass,
            level,
            expected,
          ]);
        }
      }
    });

    test("give a warlock's levels its Pact Magic, the SRD's at every level, and no slot on its list", async () => {
      const rows = await seededRows();
      const pact = { level: 0, slots: 0 };
      for (let warlockLevel = 1; warlockLevel <= 20; warlockLevel++) {
        const modifiers = rows.modifiersOf(rows.classLevel("Warlock", warlockLevel).id);
        for (const { target, value } of modifiers) {
          if (target === "spellcasting.pact.slots") pact.slots += Number(value);
          if (target === "spellcasting.pact.level") pact.level += Number(value);
        }
        expect(modifiers.filter(({ target }) => target.endsWith(".uses"))).toEqual([]);
        expect([warlockLevel, pact]).toEqual([warlockLevel, PACT_MAGIC_SLOTS[warlockLevel - 1]]);
      }
    });

    test("say how each class's levels count toward a multiclass's slots: all, half, or none", async () => {
      const rows = await seededRows();
      const counted = Object.fromEntries(
        rows.classes.map((klass) => [klass.name, klass.fields[CLASS_MULTICLASS_SLOTS]]),
      );
      expect(counted).toEqual({
        Barbarian: "Its levels don't count",
        Bard: "All its levels",
        Cleric: "All its levels",
        Druid: "All its levels",
        Fighter: "Its levels don't count",
        Monk: "Its levels don't count",
        Paladin: "Half its levels",
        Ranger: "Half its levels",
        Rogue: "Its levels don't count",
        Sorcerer: "All its levels",
        Warlock: "Its levels don't count",
        Wizard: "All its levels",
      });
    });

    test("give a wizard 44 spells in its spellbook at its 20th level: six, and two at each of 19 levels", async () => {
      const rows = await seededRows();
      const rooms = rows.classLevels
        .filter(({ ownerId }) => ownerId === rows.klass("Wizard").id)
        .flatMap(({ id }) => rows.modifiersOf(id))
        .filter(({ target }) => /^aptitudes\.wizardspells\.[1-9]\.allowed$/.test(target));
      expect(rooms.reduce((total, { value }) => total + Number(value), 0)).toBe(6 + 2 * 19);
    });

    test("give a warlock's Mystic Arcanum a pool per spell level, drawing from its list, its known spells the Pact's", async () => {
      const rows = await seededRows();
      const warlock = rows.classLevels.filter(({ ownerId }) => ownerId === rows.klass("Warlock").id);
      const targets = warlock.flatMap(({ id }) => rows.modifiersOf(id).map(({ target }) => target));
      // The warlock's list's rooms, the spells it knows, stop at the 5th level, its Pact Magic's
      expect(targets.filter((target) => /^aptitudes\.warlockspells\.[6-9]\./.test(target))).toEqual([]);
      expect(rows.modifiersOf(rows.classLevel("Warlock", 11).id).map(describeModifier)).toContain(
        "aptitudes.mysticarcanumlevel6.6.allowed add 1",
      );
      expect(rows.modifiersOf(rows.classLevel("Warlock", 17).id).map(describeModifier)).toContain(
        "aptitudes.mysticarcanumlevel9.9.allowed add 1",
      );
      // An arcanum's pool lists no spell of its own: it draws the warlock's list's of its level
      const arcanum = rows.aptitude("Mystic Arcanum (Level 6)");
      const listed = rows.spells.filter(({ id }) =>
        rows.linksOf(id, "listedIn").some(({ toId }) => toId === arcanum.id),
      );
      expect(listed).toEqual([]);
      expect(rows.linksOf(arcanum.id, "drawsFrom").map(({ tier, toId }) => ({ tier, toId }))).toEqual([
        { tier: 6, toId: rows.aptitude("Warlock Spells").id },
      ]);
    });

    test("give each skill its Skill Proficiency and Expertise, in the words the engine gives a new skill's", async () => {
      const rows = await seededRows();
      const descriptions = ["Skill Proficiency: Athletics", "Expertise: Athletics"].map(
        (name) => rows.feats.find((feat) => feat.name === name)?.description,
      );
      expect(descriptions).toEqual([
        "You add your Proficiency Bonus to Athletics checks.",
        "You add twice your Proficiency Bonus to Athletics checks.",
      ]);
    });

    test("give a class feature's pick its pool: a cleric's Divine Order, a druid's Primal Order, a barbarian's skill", async () => {
      const rows = await seededRows();
      const listedIn = (pool: string) =>
        rows.feats
          .filter(({ id }) => rows.linksOf(id, "listedIn").some(({ toId }) => toId === rows.aptitude(pool).id))
          .map(({ name }) => name)
          .sort();
      expect(rows.modifiersOf(rows.classLevel("Cleric", 1).id).map(describeModifier)).toContain(
        "aptitudes.divineorder.allowed add 1",
      );
      expect(listedIn("Divine Order")).toEqual(["Divine Order: Protector", "Divine Order: Thaumaturge"]);
      expect(rows.modifiersOf(rows.feat("Divine Order: Protector").id).map(describeModifier).sort()).toEqual([
        "feats.armortrainingheavyarmor.possessed set true",
        "feats.weaponproficiencymartialweapons.possessed set true",
      ]);
      expect(rows.modifiersOf(rows.feat("Divine Order: Thaumaturge").id).map(describeModifier)).toContain(
        "aptitudes.clericspells.0.allowed add 1",
      );
      expect(rows.modifiersOf(rows.classLevel("Druid", 1).id).map(describeModifier)).toContain(
        "aptitudes.primalorder.allowed add 1",
      );
      expect(listedIn("Primal Order")).toEqual(["Primal Order: Magician", "Primal Order: Warden"]);
      // Primal Knowledge's skill, one more of the barbarian's
      expect(rows.modifiersOf(rows.classLevel("Barbarian", 3).id).map(describeModifier)).toContain(
        "aptitudes.barbarianskills.allowed add 1",
      );
      // Thieves' Cant, and one more language
      expect(rows.modifiersOf(rows.feat("Thieves' Cant (Rogue)").id).map(describeModifier).sort()).toEqual([
        "languages.extrapicks add 1",
        "languages.thievescant.known set true",
      ]);
    });

    test("require of a multiclass 13 in its primary abilities, on its class's first level alone", async () => {
      const rows = await seededRows();
      const requirements = (klass: string, level: number) =>
        rows
          .requirementsOf(rows.classLevel(klass, level).id)
          .map(({ chainingOperator, level: place, target, value }) =>
            `${place} ${chainingOperator ?? target} ${value ?? ""}`.trim(),
          )
          .sort();
      expect(requirements("Wizard", 1)).toEqual(["1 abilities.intelligence.total 13"]);
      expect(requirements("Paladin", 1)).toEqual(["1 abilities.strength.total 13", "2 abilities.charisma.total 13"]);
      expect(requirements("Fighter", 1)).toEqual([
        "1 or",
        "1.1 abilities.strength.total 13",
        "1.2 abilities.dexterity.total 13",
      ]);
      expect(requirements("Wizard", 2)).toEqual([]);
    });

    test("list a class's skill choices' Skill Proficiencies in its skills' pool", async () => {
      const rows = await seededRows();
      const listed = (pool: string) =>
        rows.feats
          .filter(({ id }) => rows.linksOf(id, "listedIn").some(({ toId }) => toId === rows.aptitude(pool).id))
          .map(({ name }) => name)
          .sort();
      expect(listed("Wizard Skills")).toEqual(
        ["Arcana", "History", "Insight", "Investigation", "Medicine", "Nature", "Religion"].map(
          (s) => `Skill Proficiency: ${s}`,
        ),
      );
      // A bard picks any skill, in the pool of any skill's proficiency, which a skill a ruleset adds joins
      expect(rows.aptitudes.some(({ name }) => name === "Bard Skills")).toBe(false);
      expect(listed("Skill Proficiencies")).toEqual(SKILL_NAMES.map((s) => `Skill Proficiency: ${s}`).sort());
      expect(listed("Expertise")).toEqual(SKILL_NAMES.map((s) => `Expertise: ${s}`).sort());
    });

    test("list a spell on each class's list at its level there", async () => {
      const rows = await seededRows();
      const lists = (spell: string) =>
        rows
          .linksOf(rows.spell(spell).id, "listedIn")
          .map(({ tier, toId }) => `${rows.nameOf(toId)} ${tier}`)
          .sort();
      expect(lists("Fireball")).toEqual(["Sorcerer Spells 3", "Wizard Spells 3"]);
      expect(lists("Cure Wounds")).toEqual([
        "Bard Spells 1",
        "Cleric Spells 1",
        "Druid Spells 1",
        "Paladin Spells 1",
        "Ranger Spells 1",
      ]);
      expect(lists("Light")).toEqual(["Bard Spells 0", "Cleric Spells 0", "Sorcerer Spells 0", "Wizard Spells 0"]);
    });
  });

  describe("hold the SRD's skills, species and backgrounds", () => {
    test("make a skill's Skill Proficiency, and its Expertise, which requires it", async () => {
      const rows = await seededRows();
      const proficiency = rows.feat("Skill Proficiency: Stealth");
      const expertise = rows.feat("Expertise: Stealth");
      expect(rows.modifiersOf(proficiency.id).map(describeModifier)).toEqual(["skills.stealth.proficient set true"]);
      expect(rows.modifiersOf(expertise.id).map(describeModifier)).toEqual(["skills.stealth.expertise set true"]);
      // Its Expertise requires the proficiency, however the character has it
      expect(rows.requirementsOf(expertise.id)).toMatchObject([
        { target: "skills.stealth.proficient", operator: "equal", value: "true" },
      ]);
      // Monks, rangers and rogues pick it, and the pool of any skill's proficiency lists it, a bard's
      expect(rows.linkedNames(proficiency.id, "listedIn").sort()).toEqual([
        "Monk Skills",
        "Ranger Skills",
        "Rogue Skills",
        "Skill Proficiencies",
      ]);
    });

    test("grant a species' traits and Common, and give room in its lineage's pool, whose feats are its lineages", async () => {
      const rows = await seededRows();
      expect(rows.modifiersOf(rows.speciesNamed("Elf").id).map(describeModifier).sort()).toEqual([
        "aptitudes.elflineage.allowed add 1",
        "feats.darkvision60ft.possessed set true",
        "feats.elvenlineage.possessed set true",
        "feats.feyancestry.possessed set true",
        "feats.keensenses.possessed set true",
        "feats.trance.possessed set true",
        "languages.common.known set true",
      ]);
      const lineage = rows.aptitude("Elf Lineage");
      const lineages = rows.feats.filter(({ id }) =>
        rows.linksOf(id, "listedIn").some(({ toId }) => toId === lineage.id),
      );
      expect(sortedNames(lineages)).toEqual([
        "Elven Lineage: Drow",
        "Elven Lineage: High Elf",
        "Elven Lineage: Wood Elf",
      ]);
      expect(rows.modifiersOf(rows.feat("Elven Lineage: Wood Elf").id).map(describeModifier)).toEqual([
        "combat.speed.misc add 5",
      ]);
    });

    test("grant a background's Origin feat, its skills and its tool, and room in its ability scores' pool", async () => {
      const rows = await seededRows();
      expect(rows.modifiersOf(rows.background("Sage").id).map(describeModifier).sort()).toEqual([
        "aptitudes.sageabilityscores.allowed add 1",
        "feats.magicinitiatewizard.possessed set true",
        "feats.skillproficiencyarcana.possessed set true",
        "feats.skillproficiencyhistory.possessed set true",
        "feats.toolproficiencycalligrapherssupplies.possessed set true",
      ]);
      const pool = rows.aptitude("Sage Ability Scores");
      const spreads = rows.feats.filter(({ id }) => rows.linksOf(id, "listedIn").some(({ toId }) => toId === pool.id));
      expect(spreads).toHaveLength(7);
      expect(rows.modifiersOf(rows.feat("Sage: Intelligence +2, Wisdom +1").id).map(describeModifier).sort()).toEqual([
        "abilities.intelligence.misc add 2",
        "abilities.wisdom.misc add 1",
      ]);
    });
  });

  describe("are D&D 5th Edition's alone", () => {
    test("link, customize and list only their own rows", async () => {
      const rows = await seededRows();
      const ownIds = new Set(Object.values(rows.raw.entities).flatMap((entities) => entities.map(({ id }) => id)));
      const foreign = [
        ...[...rows.raw.links.values()].flatMap(({ links }) =>
          links.flatMap(({ toId, viaId }) => [toId, viaId ?? toId]),
        ),
        ...Object.values(rows.raw.entities).flatMap((entities) =>
          entities.flatMap(({ links }) => Object.values(links).filter((id): id is string => !!id)),
        ),
        ...rows.raw.modifiers.map(({ sourceId }) => sourceId),
        ...rows.raw.requirements.filter(({ entityType }) => entityType !== "modifiers").map(({ entityId }) => entityId),
      ].filter((id) => !ownIds.has(id));
      expect(foreign).toEqual([]);
    });

    test("share no row with 3.5's or Pathfinder's core rules, which hold no species or background", async () => {
      const own = await seededRows();
      const others = await findOtherCoreRulesets();
      expect(others.map(({ baseRules }) => baseRules).sort()).toEqual(["Dungeons & Dragons: 3.5", "Pathfinder: 1"]);
      for (const other of others) {
        const raw = await RulesetViews.getRawData(other.id);
        const ids = new Set(Object.values(raw.entities).flatMap((entities) => entities.map(({ id }) => id)));
        expect(Object.values(own.raw.entities).flatMap((entities) => entities.filter(({ id }) => ids.has(id)))).toEqual(
          [],
        );
        expect([raw.entities.species ?? [], raw.entities.backgrounds ?? []].flat()).toEqual([]);
        expect((raw.entities.feats ?? []).filter(({ name }) => name.startsWith("Expertise: "))).toEqual([]);
      }
    });
  });
});
