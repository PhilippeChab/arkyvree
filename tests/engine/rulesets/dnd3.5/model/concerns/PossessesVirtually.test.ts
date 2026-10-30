import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_ADVENTURER_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import { addClassLevels, createCharacter } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import type { Aptitude, Feat, Klass } from "@/engine/rulesets/dnd3.5/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import type { Requirement } from "@/shared/relations.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, findClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx } from "@/tests/support/seed.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A gate a test puts on a grant: its target, read as a requirement reads it. */
type Gate = Pick<Requirement, "operator" | "target" | "value" | "valueType">;

/** Why a grant written as a template is skipped. */
const AS_TEMPLATE = /^A grant sets .* to true, not to a template: to grant the \w+ on a condition/;

/** Why a grant written as a family's wildcard is skipped. */
const AS_WILDCARD = /^feats\.weaponfocus\.\*\.possessed reaches several feats: a grant names the one feat it gives/;

/** A gate on what the character has: a feat it possesses, a language it speaks (`target`, true). */
function holding(target: string): Gate {
  return { target, operator: "equal", value: "true", valueType: "boolean" };
}

/** A gate on the character's Strength: met at 10 and below (its score), unmet at 40. */
function strengthAtLeast(score: number): Gate {
  return {
    target: "abilities.strength.total",
    operator: "greater_than_or_equal",
    value: String(score),
    valueType: "number",
  };
}

/** The character of `characterId`, built. */
async function build(characterId: string) {
  return await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
}

/**
 * A modifier of the character's own that grants what `target` names (`set` true: a feat's possession, a spell's or a
 * language's knowledge), behind `gate` when given.
 */
async function grant(characterId: string, target: string, gate?: Gate) {
  const modifier = await setPossession(characterId, target, "true");
  if (gate) await Requirements.create(db, { entityId: modifier.id, entityType: "modifiers", level: "1", ...gate });
  return modifier;
}

/** A human of the seeded ruleset (`rulesetId` when given), every ability score 10. */
async function seedHuman(
  name: string,
  values: { alignment?: "Lawful Good" | "True Neutral"; rulesetId?: string } = {},
) {
  const ctx = await getSeedCtx();
  const abilities = Object.fromEntries(Object.keys(ctx.abilityMap).map((ability) => [ability, 10]));
  return await createCharacter(db, ctx, {
    name,
    description: "Test",
    abilities,
    languages: ["Common"],
    rulesetId: values.rulesetId,
    links: { race: "Human" },
    fields: {
      [CHARACTER_XP]: 0,
      [CHARACTER_ALIGNMENT]: values.alignment ?? "True Neutral",
      [CHARACTER_AGE]: 30,
      [CHARACTER_GENDER]: "Male",
      [CHARACTER_HEIGHT]: "180",
      [CHARACTER_WEIGHT]: "80",
    },
  });
}

/**
 * A modifier of the character's own that sets what `target` names (a feat's possession, a spell's or a language's
 * knowledge) to `value`: a grant when it's `true` on one feat, spell or language.
 */
async function setPossession(characterId: string, target: string, value: string) {
  const [modifier] = await Modifiers.create(db, {
    sourceId: characterId,
    sourceType: "characters",
    target,
    operator: "set",
    value,
    valueType: "boolean",
  });
  return modifier;
}

describe("A grant", () => {
  test.each([
    ["unmet", strengthAtLeast(40), { possessed: false, count: 0 }, [], 0],
    ["met", strengthAtLeast(10), { possessed: true, count: 1 }, ["Great Fortitude"], 2],
  ] as const)(
    "of a feat, its requirements %s, gives the feat and what it gives only when they hold",
    async (_, gate, entry, virtual, misc) => {
      // Great Fortitude: +2 to Fortitude saves
      const characterId = await seedHuman("Granted Feat");
      const modifier = await grant(characterId, "feats.greatfortitude.possessed", gate);
      const detailed = await build(characterId);

      expect(detailed.components.feats.getFeat("Great Fortitude")).toMatchObject(entry);
      expect(detailed.getVirtualFeats().map(({ name }) => name)).toEqual([...virtual]);
      expect(detailed.getHeldFeats().filter(({ entity }) => entity.name === "Great Fortitude")).toHaveLength(
        virtual.length,
      );
      expect(detailed.components.saves.getSaves().fortitude.misc).toBe(misc);
      const { appliedModifiers, unappliedModifiers } = detailed.modifierEvaluator.getModifiers();
      expect(appliedModifiers.some(({ id }) => id === modifier.id)).toBe(virtual.length > 0);
      expect(unappliedModifiers.some(({ id }) => id === modifier.id)).toBe(virtual.length === 0);
    },
  );

  test.each([
    ["unmet", strengthAtLeast(40), false, []],
    ["met", strengthAtLeast(10), true, ["Magic Missile"]],
  ] as const)(
    "of a spell, its requirements %s, makes it known on its list only when they hold",
    async (_, gate, known, virtual) => {
      const characterId = await seedHuman("Granted Spell");
      await grant(characterId, "spells.magicmissile.wizard.known", gate);
      const detailed = await build(characterId);

      expect(detailed.components.spells.getSpellEntry("Magic Missile", "Wizard Spells")?.known).toBe(known);
      expect(detailed.getVirtualSpells().map(({ name }) => name)).toEqual([...virtual]);
      expect(detailed.getHeldSpells().map(({ entity }) => entity.name)).toEqual([...virtual]);
    },
  );

  test.each([
    ["unmet", strengthAtLeast(40), ["Common"]],
    ["met", strengthAtLeast(10), ["Common", "Elven"]],
  ] as const)(
    "of a language, its requirements %s, lets the character speak it only when they hold",
    async (_, gate, granted) => {
      // Common: the human race's grant, which nothing gates
      const characterId = await seedHuman("Granted Language");
      await grant(characterId, "languages.elven.known", gate);
      const detailed = await build(characterId);

      expect(detailed.components.languages.getGranted().map(({ name }) => name)).toEqual([...granted]);
      expect(detailed.components.languages.getSpoken().map(({ name }) => name)).toEqual([...granted]);
    },
  );

  test.each([
    ["granted", undefined, ["Alertness", "Great Fortitude"], ["Common", "Elven", "Sylvan"]],
    ["withheld", strengthAtLeast(40), [], ["Common"]],
  ] as const)(
    "gated on what another grant gives applies once that one has, and not when it's %s",
    async (_, firstGate, feats, languages) => {
      // Great Fortitude needs Alertness, and Sylvan Elven, each given by a grant of its own
      const characterId = await seedHuman("Granted Chain");
      await grant(characterId, "feats.greatfortitude.possessed", holding("feats.alertness.possessed"));
      await grant(characterId, "feats.alertness.possessed", firstGate);
      await grant(characterId, "languages.sylvan.known", holding("languages.elven.known"));
      await grant(characterId, "languages.elven.known", firstGate);
      const detailed = await build(characterId);

      expect(detailed.getVirtualFeats().map(({ name }) => name)).toEqual([...feats]);
      expect(detailed.components.languages.getGranted().map(({ name }) => name)).toEqual([...languages]);
      expect(detailed.validate().issues.filter(({ category }) => category === "modifiers")).toEqual([]);
    },
  );

  test("that breaks another's gate once applied leaves it given, as a modifier breaking another's does", async () => {
    // Alertness is granted while the character hasn't Great Fortitude, and Great Fortitude once it speaks Common (its
    // race's grant): both apply in one round, Great Fortitude's breaking Alertness's gate. Alertness stays given, its
    // grant reported past its gate
    const characterId = await seedHuman("Granted Past Its Gate");
    const alertness = await grant(characterId, "feats.alertness.possessed", {
      ...holding("feats.greatfortitude.possessed"),
      value: "false",
    });
    await grant(characterId, "feats.greatfortitude.possessed", holding("languages.common.known"));
    const detailed = await build(characterId);

    expect(
      detailed
        .getVirtualFeats()
        .map(({ name }) => name)
        .toSorted(),
    ).toEqual(["Alertness", "Great Fortitude"]);
    expect(detailed.modifierEvaluator.getModifiers().appliedModifiers.some(({ id }) => id === alertness.id)).toBe(true);
    expect(detailed.validate().issues.map(({ message }) => message)).toContainEqual(
      expect.stringMatching(/^Modifier on feats\.alertness\.possessed .* applied while its requirement held/),
    );
  });

  describe("written as a template or a family's wildcard", () => {
    // Each would mark what it names had without giving it: a template applies after the rounds that give, and a
    // wildcard names no one feat to give
    test.each([
      ["literal true", "true", { possessed: true, count: 1 }, ["Great Fortitude"], 2, []],
      ["template", "{{ languages.common.known }}", { possessed: false, count: 0 }, [], 0, [AS_TEMPLATE]],
    ] as const)(
      "gives a feat as a %s: a template is skipped, saying why",
      async (_, value, entry, virtual, misc, skipped) => {
        // A human speaks Common, its race's grant: the template reads true
        const characterId = await seedHuman("Feat By Template");
        const modifier = await setPossession(characterId, "feats.greatfortitude.possessed", value);
        const detailed = await build(characterId);

        expect(detailed.components.feats.getFeat("Great Fortitude")).toMatchObject(entry);
        expect(detailed.getVirtualFeats().map(({ name }) => name)).toEqual([...virtual]);
        expect(detailed.components.saves.getSaves().fortitude.misc).toBe(misc);
        const { appliedModifiers, skippedModifiers } = detailed.modifierEvaluator.getModifiers();
        expect(appliedModifiers.some(({ id }) => id === modifier.id)).toBe(virtual.length > 0);
        expect(skippedModifiers.map(({ warning }) => warning)).toEqual(
          skipped.map((reason) => expect.stringMatching(reason)),
        );
      },
    );

    test("of a spell or a language is skipped, saying why: it isn't known", async () => {
      const characterId = await seedHuman("Spell And Language By Template");
      await setPossession(characterId, "spells.magicmissile.wizard.known", "{{ languages.common.known }}");
      await setPossession(characterId, "languages.elven.known", "{{ languages.common.known }}");
      const detailed = await build(characterId);

      expect(detailed.components.spells.getSpellEntry("Magic Missile", "Wizard Spells")?.known).toBe(false);
      expect(detailed.getVirtualSpells()).toEqual([]);
      expect(detailed.components.languages.getSpoken().map(({ name }) => name)).toEqual(["Common"]);
      expect(detailed.modifierEvaluator.getModifiers().skippedModifiers.map(({ warning }) => warning)).toEqual([
        expect.stringMatching(AS_TEMPLATE),
        expect.stringMatching(AS_TEMPLATE),
      ]);
    });

    test("gives no feat of the family, its skip shown in the diagnostics", async () => {
      const characterId = await seedHuman("Family By Wildcard");
      await setPossession(characterId, "feats.weaponfocus.*.possessed", "true");
      const detailed = await build(characterId);

      expect(detailed.components.feats.getFeat("Weapon Focus: Rapier")).toMatchObject({ possessed: false, count: 0 });
      expect(detailed.getVirtualFeats()).toEqual([]);
      const { appliedModifiers, skippedModifiers } = detailed.modifierEvaluator.getModifiers();
      expect(appliedModifiers.filter(({ target }) => target.startsWith("feats.weaponfocus"))).toEqual([]);
      expect(skippedModifiers.map(({ warning }) => warning)).toEqual([expect.stringMatching(AS_WILDCARD)]);
      expect(detailed.validate().issues.map(({ message }) => message)).toContainEqual(
        expect.stringMatching(/^Skipped modifier on feats\.weaponfocus\.\*\.possessed from Family By Wildcard/),
      );
    });

    test.each([
      ["given", ["Great Fortitude", "Weapon Focus: Rapier"]],
      ["not given", []],
    ] as const)(
      "still gates a grant on any feat of a family, read as a requirement: met when one is %s",
      async (given, feats) => {
        const characterId = await seedHuman("Gated On A Family");
        await grant(characterId, "feats.greatfortitude.possessed", holding("feats.weaponfocus.*.possessed"));
        if (given === "given") await grant(characterId, "feats.weaponfocusrapier.possessed");
        const detailed = await build(characterId);

        expect(
          detailed
            .getVirtualFeats()
            .map(({ name }) => name)
            .toSorted(),
        ).toEqual([...feats]);
      },
    );
  });

  describe("of the seeded content", () => {
    test("an animal lord's second totem gives its totem's feat alone", async () => {
      // Second Totem grants each totem's feat behind its totem: a catlord's is Lightning Reflexes
      const ctx = await getSeedCtx();
      const book = await findSeededRuleset(DND35_COMPLETE_ADVENTURER_NAME);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: ctx.rulesetId,
        extensionIds: [book.id],
      });
      const characterId = await seedHuman("Catlord", { rulesetId: fork.id });
      const animalLord = (await Entities.findOne<Klass>(db, {
        entityType: "classes",
        name: "Animal Lord",
        rulesetId: book.id,
      }))!;
      const catlord = (await Entities.findOne<Feat>(db, {
        entityType: "feats",
        name: "Catlord (Animal Lord)",
        rulesetId: book.id,
      }))!;
      const bond = (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: "Animal Lord Animal Bond",
        rulesetId: book.id,
      }))!;
      for (let level = 1; level <= 6; level++) {
        const picks = level === 1 ? { feats: { [bond.id]: [catlord.id] } } : {};
        await addCharacterLevel(characterId, (await findClassLevel(animalLord.id, level))!.id, picks);
      }
      const { feats } = (await build(characterId)).components;

      const totems = ["Lightning Reflexes", "Brachiation", "Improved Grapple", "Trample", "Improved Initiative"];
      expect(totems.map((name) => feats.getFeat(name)?.possessed)).toEqual([true, false, false, false, false]);
      expect(feats.getFeat("Improved Trip")?.possessed).toBe(false);
    });

    test.each([
      ["True Neutral", true],
      ["Lawful Good", false],
    ] as const)(
      "a %s druid's first level gives Druidic as it gives its other features: %p",
      async (alignment, speaks) => {
        // The druid's first level takes a neutral alignment, which gates its modifiers, its grant of Druidic among them
        const ctx = await getSeedCtx();
        const characterId = await seedHuman(`${alignment} Druid`, { alignment });
        await addClassLevels(db, ctx, characterId, "Druid", [1], [8]);
        const detailed = await build(characterId);

        expect(detailed.components.languages.getGranted().some(({ name }) => name === "Druidic")).toBe(speaks);
      },
    );
  });
});
