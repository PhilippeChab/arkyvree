import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { DND35_COMPLETE_ARCANE_NAME, DND35_COMPLETE_DIVINE_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import { writeNameBindings } from "@/database/packages/nameBindings.ts";
import { RulesError } from "@/engine/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { NameBindingFill, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Requirements, Rulesets } from "@/server/repositories/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { buildCharacter, createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset, invalidateSeededRuleset, readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The seeded system books of these names, by name. */
async function booksOf(...names: string[]) {
  const books = (await Rulesets.findMany(db, { system: true })).filter((ruleset) => ruleset.kind === "extension");
  return names.map((name) => books.find((book) => book.name === name)!.id);
}

/** The paths of an entity's conditions, as a ruleset's view reads them. */
async function conditionsOf(rulesetId: string, entityId: string) {
  const view = await readView(rulesetId);
  return (view.requirementsByEntity.get(entityId) ?? []).flatMap((requirement) => requirement.target ?? []);
}

/** A new feat of the fork's own. */
async function createFeat(session: Session, rulesetId: string, name: string) {
  const general = Dnd35View.of(await readView(rulesetId)).aptitudes.find((aptitude) => aptitude.name === "General")!;
  return await EntitiesService.createEntity(session, rulesetId, "feats", {
    name,
    links: { listedIn: [{ toId: general.id }] },
  });
}

/** The feat of a name, as a ruleset's view shows it. */
async function featOf(rulesetId: string, name: string) {
  const feat = Dnd35View.of(await readView(rulesetId)).feats.find((candidate) => candidate.name === name);
  if (!feat) throw new Error(`No feat ${name} in ${rulesetId}`);
  return feat;
}

/** A public fork of the seeded 3.5 core, as its owner forks it. */
async function forkCore(session: Session) {
  const { fork } = await setUp();
  return await RulesetsService.forkRuleset(session, fork.rulesetId!, { name: `Fork ${uniqueId()}`, private: false });
}

/** A bonus on a feat, and the conditions it applies under: the bonuses the view keeps, and each one's conditions. */
async function gatedBonus(conditions: { chainingOperator?: string; level: string; target?: string; value?: string }[]) {
  const { fork, session } = await setUp();
  const gone = await createFeat(session, fork.id, "Soon Gone");
  const holder = await createFeat(session, fork.id, "Holder");
  const modifier = await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
    operator: "add",
    target: "abilities.strength.misc",
    value: "2",
  });
  for (const condition of conditions) {
    await RequirementsService.createRequirement(session, fork.id, "modifiers", modifier.id, {
      ...condition,
      ...(condition.target && { operator: "equal" }),
    });
  }
  await EntitiesService.deleteEntity(session, fork.id, "feats", gone.id);
  const view = await readView(fork.id);
  return {
    bonuses: (view.modifiersBySource.get(holder.id) ?? []).length,
    conditions: (view.requirementsByEntity.get(modifier.id) ?? []).map((r) => r.target ?? r.chainingOperator),
  };
}

/** A condition on a feat: it requires having the feat a path names. */
async function requireFeat(session: Session, rulesetId: string, featId: string, target: string) {
  return await RequirementsService.createRequirement(session, rulesetId, "feats", featId, {
    level: "1",
    operator: "equal",
    target,
    value: "true",
  });
}

/** A fork of the seeded 3.5 core, its owner's session, and what the tests read and write in it. */
async function setUp() {
  const { session, user } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  return { fork, session, user };
}

/** The names a ruleset's view leaves rules out for: what they named, gone. */
async function switchedOffIn(rulesetId: string) {
  return (await readView(rulesetId)).switchedOff.map((row) => row.named.name);
}

describe("a rule keeps meaning the entity its author picked", () => {
  test("a fork renames an inherited feat: the base's rule follows it there, and nowhere else", async () => {
    const { fork, session } = await setUp();
    const mobility = await featOf(fork.id, "Mobility");
    const dodge = await featOf(fork.id, "Dodge");
    expect(await conditionsOf(fork.id, mobility.id)).toContain("feats.dodge.possessed");

    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });

    expect(await conditionsOf(fork.id, mobility.id)).toContain("feats.sidestep.possessed");
    expect(await conditionsOf(fork.id, mobility.id)).not.toContain("feats.dodge.possessed");
    expect(await conditionsOf(fork.rulesetId!, mobility.id)).toContain("feats.dodge.possessed");
    expect(await switchedOffIn(fork.id)).toEqual([]);
  });

  test("a name reused after a rename: old rules mean the renamed feat, new rules the new one", async () => {
    const { fork, session } = await setUp();
    const mobility = await featOf(fork.id, "Mobility");
    const dodge = await featOf(fork.id, "Dodge");
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });
    const newDodge = await createFeat(session, fork.id, "Dodge");
    const holder = await createFeat(session, fork.id, "Needs The New Dodge");
    await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");

    expect(await conditionsOf(fork.id, mobility.id)).toContain("feats.sidestep.possessed");
    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.dodge.possessed"]);

    await EntitiesService.updateEntity(session, fork.id, "feats", newDodge.id, { name: "Duck" });

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.duck.possessed"]);
    expect(await conditionsOf(fork.id, mobility.id)).toContain("feats.sidestep.possessed");
  });

  test("restoring the parent version: the fork's own rule means the original again", async () => {
    const { fork, session } = await setUp();
    const dodge = await featOf(fork.id, "Dodge");
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });
    const holder = await createFeat(session, fork.id, "Needs Sidestep");
    await requireFeat(session, fork.id, holder.id, "feats.sidestep.possessed");

    await RulesetChangesService.revertOverride(session, fork.id, "feats", dodge.id);

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.dodge.possessed"]);
    expect(await switchedOffIn(fork.id)).toEqual([]);
  });

  test("a rule copied with its feat keeps its meaning, whatever the fork named since", async () => {
    const { fork, session } = await setUp();
    const mobility = await featOf(fork.id, "Mobility");
    const dodge = await featOf(fork.id, "Dodge");
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });
    await createFeat(session, fork.id, "Dodge");

    await EntitiesService.updateEntity(session, fork.id, "feats", mobility.id, {
      name: "Mobility",
      description: "Edited in the fork",
    });

    const copy = await featOf(fork.id, "Mobility");
    expect(copy.id).not.toBe(mobility.id);
    expect(await conditionsOf(fork.id, copy.id)).toContain("feats.sidestep.possessed");
    expect(await conditionsOf(fork.id, copy.id)).not.toContain("feats.dodge.possessed");
  });

  test("a save that changes no path keeps what the rule meant", async () => {
    const { fork, session } = await setUp();
    const dodge = await featOf(fork.id, "Dodge");
    const holder = await createFeat(session, fork.id, "Holder");
    const requirement = await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });
    await createFeat(session, fork.id, "Dodge");

    await RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, requirement.id, {
      level: "1",
      operator: "not_equal",
      target: "feats.sidestep.possessed",
      value: "true",
    });

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.sidestep.possessed"]);
  });

  test("a formula's path follows its class", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Wild Growth");
    await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
      operator: "add",
      target: "skills.survival.misc",
      value: "{{ [classes.druid.level] }}",
    });
    const view = Dnd35View.of(await readView(fork.id));
    const druid = view.classes.find((klass) => klass.name === "Druid")!;
    const survival = view.skills.find((skill) => skill.name === "Survival")!;

    await EntitiesService.updateEntity(session, fork.id, "classes", druid.id, { name: "Greenwarden" });
    await EntitiesService.updateEntity(session, fork.id, "skills", survival.id, { name: "Wayfinding" });

    const [modifier] = (await readView(fork.id)).modifiersBySource.get(holder.id) ?? [];
    expect(modifier).toMatchObject({ target: "skills.wayfinding.misc", value: "{{ [classes.greenwarden.level] }}" });
  });
});

describe("a rule whose entity is gone is switched off, and never read by its text", () => {
  test("an own feat deleted, then another made under its name: the rule stays off", async () => {
    const { fork, session } = await setUp();
    const parry = await createFeat(session, fork.id, "Parry");
    const holder = await createFeat(session, fork.id, "Needs Parry");
    await requireFeat(session, fork.id, holder.id, "feats.parry.possessed");

    await EntitiesService.deleteEntity(session, fork.id, "feats", parry.id);

    expect(await conditionsOf(fork.id, holder.id)).toEqual([]);
    expect(await switchedOffIn(fork.id)).toEqual(["Parry"]);

    await createFeat(session, fork.id, "Parry");

    expect(await conditionsOf(fork.id, holder.id)).toEqual([]);
    expect(await switchedOffIn(fork.id)).toEqual(["Parry"]);
  });

  test("an inherited feat deleted in a fork: off there, in force in the base; replaced under its name, in force again", async () => {
    const { fork, session } = await setUp();
    const mobility = await featOf(fork.id, "Mobility");
    const dodge = await featOf(fork.id, "Dodge");

    await EntitiesService.deleteEntity(session, fork.id, "feats", dodge.id);

    expect(await conditionsOf(fork.id, mobility.id)).not.toContain("feats.dodge.possessed");
    expect(await switchedOffIn(fork.id)).toContain("Dodge");
    expect(await conditionsOf(fork.rulesetId!, mobility.id)).toContain("feats.dodge.possessed");

    const replacement = await createFeat(session, fork.id, "Dodge");

    expect(await conditionsOf(fork.id, mobility.id)).toContain("feats.dodge.possessed");
    expect(await switchedOffIn(fork.id)).not.toContain("Dodge");
    expect((await featOf(fork.id, "Dodge")).id).toBe(replacement.id);
  });
});

describe("a rule that names a book's feat", () => {
  test("follows the other book's printing when its book leaves, and is off once both are gone", async () => {
    const { session } = await createTestUser();
    const fork = await forkCore(session);
    const [arcane, divine] = await booksOf(DND35_COMPLETE_ARCANE_NAME, DND35_COMPLETE_DIVINE_NAME);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [arcane, divine]);
    const holder = await createFeat(session, fork.id, "Arcane Echo");
    await requireFeat(session, fork.id, holder.id, "feats.practicedspellcaster.possessed");
    const shown = (await featOf(fork.id, "Practiced Spellcaster")).id;
    const [first, second] =
      shown === (await featOf(arcane, "Practiced Spellcaster")).id ? [arcane, divine] : [divine, arcane];

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, first);

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.practicedspellcaster.possessed"]);
    expect(await switchedOffIn(fork.id)).toEqual([]);

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, second);

    expect(await conditionsOf(fork.id, holder.id)).toEqual([]);
    expect(await switchedOffIn(fork.id)).toEqual(["Practiced Spellcaster"]);
  });

  test("in a published book: in force for a subscriber who has either printing, off for one who has neither", async () => {
    const { session: alice } = await createTestUser("alice");
    const book = await forkCore(alice);
    const [arcane, divine] = await booksOf(DND35_COMPLETE_ARCANE_NAME, DND35_COMPLETE_DIVINE_NAME);
    await RulesetExtensionsService.subscribeExtension(alice, book.id, [arcane, divine]);
    const holder = await createFeat(alice, book.id, "Arcane Echo");
    await requireFeat(alice, book.id, holder.id, "feats.practicedspellcaster.possessed");
    await RulesetExtensionsService.unsubscribeExtension(alice, book.id, arcane);
    await RulesetExtensionsService.unsubscribeExtension(alice, book.id, divine);
    await RulesetsService.publishRuleset(alice, book.id, { kind: "extension" });

    const { session: bob } = await createTestUser("bob");
    const withArcane = await forkCore(bob);
    await RulesetExtensionsService.subscribeExtension(bob, withArcane.id, [book.id, arcane]);
    const withDivine = await forkCore(bob);
    await RulesetExtensionsService.subscribeExtension(bob, withDivine.id, [book.id, divine]);
    const withNeither = await forkCore(bob);
    await RulesetExtensionsService.subscribeExtension(bob, withNeither.id, [book.id]);

    expect(await conditionsOf(withArcane.id, holder.id)).toEqual(["feats.practicedspellcaster.possessed"]);
    expect(await conditionsOf(withDivine.id, holder.id)).toEqual(["feats.practicedspellcaster.possessed"]);
    expect(await conditionsOf(withNeither.id, holder.id)).toEqual([]);
    expect(await switchedOffIn(withNeither.id)).toEqual(["Practiced Spellcaster"]);
  });

  test("a subscriber's own renamed feat is not captured by a book's later feat of its old name", async () => {
    const { session: alice } = await createTestUser("alice");
    const book = await forkCore(alice);
    await RulesetsService.publishRuleset(alice, book.id, { kind: "extension" });
    const { session: bob } = await createTestUser("bob");
    const fork = await forkCore(bob);
    await RulesetExtensionsService.subscribeExtension(bob, fork.id, [book.id]);
    const riposte = await createFeat(bob, fork.id, "Riposte");
    const holder = await createFeat(bob, fork.id, "Counterstrike");
    await requireFeat(bob, fork.id, holder.id, "feats.riposte.possessed");
    await EntitiesService.updateEntity(bob, fork.id, "feats", riposte.id, { name: "Parry" });

    await createFeat(alice, book.id, "Riposte");

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.parry.possessed"]);
    expect((await featOf(fork.id, "Riposte")).id).not.toBe(riposte.id);
  });
});

describe("the base's own content", () => {
  test("renames a feat: its rule follows in the base and its forks, and a fork's edited copy keeps its own name", async () => {
    const { fork } = await setUp();
    const mobility = await featOf(fork.id, "Mobility");
    const dodge = await featOf(fork.id, "Dodge");
    const owner = await createTestUser();
    const withCopy = await createSeededTestRuleset(owner.user.id);
    await EntitiesService.updateEntity(owner.session, withCopy.id, "feats", dodge.id, {
      name: "Dodge",
      description: "Edited in the fork",
    });

    await db.execute(sql`update rules.entities set name = 'Evade' where id = ${dodge.id}`);
    invalidateSeededRuleset(fork.rulesetId!);
    RulesetViews.invalidate(fork.id);
    RulesetViews.invalidate(withCopy.id);

    expect(await conditionsOf(fork.rulesetId!, mobility.id)).toContain("feats.evade.possessed");
    expect(await conditionsOf(fork.id, mobility.id)).toContain("feats.evade.possessed");
    expect(await conditionsOf(withCopy.id, mobility.id)).toContain("feats.dodge.possessed");
    expect(await switchedOffIn(withCopy.id)).toEqual([]);
  });

  test("has a binding for every rule that names a feat, a skill, a class, a language or a pool", async () => {
    const unbound = await db.execute<{ rows: number }>(sql`
      with named as (
        select m.id, m.target, m.source_id as owner_id, 'modifier' as of from customization.modifiers m
          where m.source_type <> 'characters'
        union all
        select r.id, r.target, r.entity_id, 'requirement' from customization.requirements r where r.target is not null
      )
      select count(*)::int as rows from named n
        left join rules.entities e on e.id = n.owner_id
        left join customization.modifiers gate on gate.id = n.owner_id
        left join rules.entities gated on gated.id = gate.source_id
        where split_part(n.target, '.', 1) in ('feats', 'skills', 'classes', 'languages', 'aptitudes')
          and split_part(n.target, '.', 2) not like '%*%'
          and split_part(n.target, '.', 2) not in ('budget', 'extrapicks')
          and coalesce(e.base_rules, gated.base_rules) = 'Dungeons & Dragons: 3.5'
          and not exists (
            select 1 from customization.name_bindings b
              where (n.of = 'modifier' and b.modifier_id = n.id) or (n.of = 'requirement' and b.requirement_id = n.id)
          )`);
    expect(unbound.rows[0].rows).toBe(0);
  });
});

describe("what an independent review found", () => {
  test("a rule saved again after a rename still follows the next rename", async () => {
    const { fork, session } = await setUp();
    const dodge = await featOf(fork.id, "Dodge");
    const holder = await createFeat(session, fork.id, "Holder");
    const requirement = await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });
    await RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, requirement.id, {
      level: "1",
      operator: "not_equal",
      target: "feats.sidestep.possessed",
      value: "true",
    });

    const sidestep = await featOf(fork.id, "Sidestep");
    await EntitiesService.updateEntity(session, fork.id, "feats", sidestep.id, { name: "Evade" });

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.evade.possessed"]);
  });

  test("a bonus that applies while not having a feat keeps applying once that feat is gone", async () => {
    const kept = await gatedBonus([{ level: "1", target: "feats.soongone.possessed", value: "false" }]);
    expect(kept).toEqual({ bonuses: 1, conditions: [] });
  });

  test("a bonus that applies with a feat or another way keeps its other way", async () => {
    const kept = await gatedBonus([
      { chainingOperator: "or", level: "1" },
      { level: "1.1", target: "feats.soongone.possessed", value: "true" },
      { level: "1.2", target: "feats.dodge.possessed", value: "true" },
    ]);
    expect(kept).toEqual({ bonuses: 1, conditions: ["or", "feats.dodge.possessed"] });
  });

  test("a bonus that applies only while having a feat stops once that feat is gone", async () => {
    const kept = await gatedBonus([{ level: "1", target: "feats.soongone.possessed", value: "true" }]);
    expect(kept).toEqual({ bonuses: 0, conditions: [] });
  });

  test("a condition left out doesn't block the next one, nor hide a new empty group", async () => {
    const { fork, session } = await setUp();
    const gone = await createFeat(session, fork.id, "Soon Gone");
    const holder = await createFeat(session, fork.id, "Holder");
    await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");
    await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      level: "2",
      operator: "equal",
      target: "feats.soongone.possessed",
      value: "true",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", gone.id);

    // The page lists one condition, so its next one asks for level 2, which the one left out holds
    await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      level: "2",
      operator: "equal",
      target: "feats.mobility.possessed",
      value: "true",
    });
    const group = await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      chainingOperator: "or",
      level: "4",
    });

    const listed = (await readView(fork.id)).requirementsByEntity.get(holder.id) ?? [];
    expect(listed.map((r) => r.target ?? r.chainingOperator)).toEqual([
      "feats.dodge.possessed",
      "feats.mobility.possessed",
      "or",
    ]);
    expect(listed.map((r) => r.id)).toContain(group.id);
  });
});

describe("a path that names two things, and a value that names one", () => {
  test("a spell known on a list follows the spell and the list, each under its own spelling", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Arcane Dabbler");
    await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
      operator: "set",
      target: "spells.fireball.wizard.known",
      value: "true",
    });
    const view = Dnd35View.of(await readView(fork.id));
    const list = view.aptitudes.find((aptitude) => aptitude.name === "Wizard Spells")!;
    const spell = view.spells.find((candidate) => candidate.name === "Fireball")!;

    await EntitiesService.updateEntity(session, fork.id, "aptitudes", list.id, { name: "Mage Spells" });
    await EntitiesService.updateEntity(session, fork.id, "spells", spell.id, { name: "Orbe de feu" });

    const after = await readView(fork.id);
    expect((after.modifiersBySource.get(holder.id) ?? []).map((m) => m.target)).toEqual([
      "spells.orbedefeu.mage.known",
    ]);
    const slots = [...after.modifiersById.values()]
      .map((m) => m.target)
      .filter((target) => target.startsWith("aptitudes."));
    expect(slots.filter((target) => target.startsWith("aptitudes.wizardspells."))).toEqual([]);
    expect(slots.filter((target) => target.startsWith("aptitudes.magespells.")).length).toBeGreaterThan(0);
  });

  test("a condition on a race's name follows the race, and reads as nobody's once the race is gone", async () => {
    const { fork, session } = await setUp();
    const feat = await featOf(fork.id, "Improved Critical: Dwarven Waraxe");
    const valuesOf = async (rulesetId: string) =>
      ((await readView(rulesetId)).requirementsByEntity.get(feat.id) ?? [])
        .filter((r) => r.target === "identity.physiology.race.name")
        .map((r) => r.value);
    expect(await valuesOf(fork.id)).toEqual(["Dwarf"]);
    const dwarf = Dnd35View.of(await readView(fork.id)).races.find((race) => race.name === "Dwarf")!;

    await EntitiesService.updateEntity(session, fork.id, "races", dwarf.id, { name: "Mountain Dwarf" });

    expect(await valuesOf(fork.id)).toEqual(["Mountain Dwarf"]);
    expect(await valuesOf(fork.rulesetId!)).toEqual(["Dwarf"]);

    const renamed = Dnd35View.of(await readView(fork.id)).races.find((race) => race.name === "Mountain Dwarf")!;
    await EntitiesService.deleteEntity(session, fork.id, "races", renamed.id);

    // The condition stays, shown with the value it stores and marked: it's judged as of a race nobody is
    const [gone] = ((await readView(fork.id)).requirementsByEntity.get(feat.id) ?? []).filter(
      (r) => r.target === "identity.physiology.race.name",
    );
    expect(gone).toMatchObject({ value: "Dwarf", valueGone: true });
    expect(await switchedOffIn(fork.id)).toContain("Dwarf");
  });

  test("a familiar's race set by a feat follows that familiar race, not a player's race of its name", async () => {
    const { fork, session } = await setUp();
    const view = await readView(fork.id);
    const setter = [...view.modifiersById.values()].find(
      (m) => m.target === "bonded.familiar.race" && m.value === "Cat",
    )!;
    const cat = Dnd35View.of(view).races.find((race) => race.name === "Cat" && race.partition === "familiar")!;

    await EntitiesService.updateEntity(session, fork.id, "races", cat.id, { name: "Lynx" });

    const after = (await readView(fork.id)).modifiersById.get(setter.id);
    expect(after?.value).toBe("Lynx");
  });
});

describe("a skill's own feat", () => {
  test("is renamed with an inherited skill and keeps its identity, so what names it follows", async () => {
    const { fork, session } = await setUp();
    const focus = await featOf(fork.id, "Skill Focus: Climb");
    const holder = await createFeat(session, fork.id, "Needs Climb Focus");
    await requireFeat(session, fork.id, holder.id, "feats.skillfocusclimb.possessed");
    const climb = Dnd35View.of(await readView(fork.id)).skills.find((skill) => skill.name === "Climb")!;

    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scaling" });

    const view = await readView(fork.id);
    const renamed = await featOf(fork.id, "Skill Focus: Scaling");
    // The fork's copy of the base's feat: what named the base's reads it
    expect(view.cow.resolve(focus.id)).toBe(renamed.id);
    expect(Dnd35View.of(view).feats.filter((feat) => feat.name === "Skill Focus: Climb")).toEqual([]);
    expect((view.modifiersBySource.get(renamed.id) ?? []).map((m) => m.target)).toEqual(["skills.scaling.misc"]);
    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.skillfocusscaling.possessed"]);
    expect(view.switchedOff).toEqual([]);
  });

  test("made with a new skill is bound at once, and a hand-made feat of such a name is never removed", async () => {
    const { fork, session } = await setUp();
    const strength = Dnd35View.of(await readView(fork.id)).abilities.find((ability) => ability.name === "Strength")!;
    const handMade = await createFeat(session, fork.id, "Skill Focus: Lifting");
    const weaving = await EntitiesService.createEntity(session, fork.id, "skills", {
      name: "Basket Weaving",
      links: { keyAbility: strength.id },
    });
    const made = await featOf(fork.id, "Skill Focus: Basket Weaving");

    await EntitiesService.updateEntity(session, fork.id, "skills", weaving.id, {
      name: "Wicker Craft",
      links: { keyAbility: strength.id },
    });

    const view = await readView(fork.id);
    expect((await featOf(fork.id, "Skill Focus: Wicker Craft")).id).toBe(made.id);
    expect((view.modifiersBySource.get(made.id) ?? []).map((m) => m.target)).toEqual(["skills.wickercraft.misc"]);

    // A skill named as the hand-made feat's: renaming it makes its own feat, and leaves the hand-made one
    const lifting = await EntitiesService.createEntity(session, fork.id, "skills", {
      name: "Lifting",
      links: { keyAbility: strength.id },
    });
    await EntitiesService.updateEntity(session, fork.id, "skills", lifting.id, {
      name: "Hauling",
      links: { keyAbility: strength.id },
    });
    expect((await featOf(fork.id, "Skill Focus: Lifting")).id).toBe(handMade.id);
    expect((await featOf(fork.id, "Skill Focus: Hauling")).id).not.toBe(handMade.id);
  });
});

describe("a character's own modifier", () => {
  test("follows the skill it names when its ruleset renames it", async () => {
    const { fork, session, user } = await setUp();
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    await CharacterModifiersService.createModifier(session, character.id, {
      operator: "add",
      target: "skills.climb.misc",
      value: "5",
    });
    const climb = Dnd35View.of(await readView(fork.id)).skills.find((skill) => skill.name === "Climb")!;

    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scaling" });

    const built = await buildCharacter(character);
    const { appliedModifiers, skippedModifiers } = built.modifierEvaluator.getModifiers();
    const own = (modifier: { sourceId: string }) => modifier.sourceId === character.id;
    expect(appliedModifiers.filter(own).map((modifier) => modifier.target)).toEqual(["skills.scaling.misc"]);
    expect(skippedModifiers.filter(({ modifier }) => own(modifier))).toEqual([]);
  });
});

describe("what a second independent review found", () => {
  test("a condition saved without its value keeps following a renamed race", async () => {
    const { fork, session } = await setUp();
    const feat = await featOf(fork.id, "Improved Critical: Dwarven Waraxe");
    const raceCondition = async () =>
      ((await readView(fork.id)).requirementsByEntity.get((await featOf(fork.id, feat.name)).id) ?? []).find(
        (r) => r.target === "identity.physiology.race.name",
      )!;
    const dwarf = Dnd35View.of(await readView(fork.id)).races.find((race) => race.name === "Dwarf")!;
    await EntitiesService.updateEntity(session, fork.id, "races", dwarf.id, { name: "Mountain Dwarf" });
    const before = await raceCondition();

    await RequirementsService.updateRequirement(session, fork.id, "feats", feat.id, before.id, {
      level: before.level,
      operator: "not_equal",
      target: "identity.physiology.race.name",
    });
    expect((await raceCondition()).value).toBe("Mountain Dwarf");

    const renamed = Dnd35View.of(await readView(fork.id)).races.find((race) => race.name === "Mountain Dwarf")!;
    await EntitiesService.updateEntity(session, fork.id, "races", renamed.id, { name: "Hill Dwarf" });
    expect((await raceCondition()).value).toBe("Hill Dwarf");
  });

  test("a skill takes a name whose Skill Focus was made by hand: the hand-made feat stays, the skill's own goes", async () => {
    const { fork, session } = await setUp();
    const handMade = await createFeat(session, fork.id, "Skill Focus: Stealth");
    const hide = Dnd35View.of(await readView(fork.id)).skills.find((skill) => skill.name === "Hide")!;

    await EntitiesService.updateEntity(session, fork.id, "skills", hide.id, { name: "Stealth" });

    const feats = Dnd35View.of(await readView(fork.id)).feats.filter((feat) => feat.name.startsWith("Skill Focus: "));
    expect(feats.filter((feat) => feat.name === "Skill Focus: Stealth").map((feat) => feat.id)).toEqual([handMade.id]);
    expect(feats.filter((feat) => feat.name === "Skill Focus: Hide")).toEqual([]);
  });

  test("a skill restored, then renamed again, keeps one Skill Focus", async () => {
    const { fork, session } = await setUp();
    const hide = Dnd35View.of(await readView(fork.id)).skills.find((skill) => skill.name === "Hide")!;
    await EntitiesService.updateEntity(session, fork.id, "skills", hide.id, { name: "Stealth" });
    await RulesetChangesService.revertOverride(session, fork.id, "skills", hide.id);

    await EntitiesService.updateEntity(session, fork.id, "skills", hide.id, { name: "Skulk" });

    const view = await readView(fork.id);
    const giving = Dnd35View.of(view).feats.filter((feat) =>
      (view.modifiersBySource.get(feat.id) ?? []).some((modifier) => modifier.target === "skills.skulk.misc"),
    );
    expect(giving.filter((feat) => feat.name.startsWith("Skill Focus")).map((feat) => feat.name)).toEqual([
      "Skill Focus: Skulk",
    ]);
  });

  test("a word the paths use is not taken for a language of its name", async () => {
    const { fork, session } = await setUp();
    const language = await EntitiesService.createEntity(session, fork.id, "languages", { name: "Extra Picks" });
    const holder = await createFeat(session, fork.id, "Polyglot");
    await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
      operator: "add",
      target: "languages.extrapicks",
      value: "2",
    });

    await EntitiesService.updateEntity(session, fork.id, "languages", language.id, { name: "Old Tongue" });

    const targets = ((await readView(fork.id)).modifiersBySource.get(holder.id) ?? []).map((m) => m.target);
    expect(targets).toEqual(["languages.extrapicks"]);
  });

  test("a bonus that applies while a spell doesn't contain something keeps applying once the spell is gone", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Wary");
    const modifier = await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
      operator: "add",
      target: "abilities.strength.misc",
      value: "2",
    });
    await RequirementsService.createRequirement(session, fork.id, "modifiers", modifier.id, {
      level: "1",
      operator: "not_contains",
      target: "spells.fireball.fields.SPELL_SCHOOL",
      value: "Necromancy",
    });
    const fireball = Dnd35View.of(await readView(fork.id)).spells.find((spell) => spell.name === "Fireball")!;

    await EntitiesService.deleteEntity(session, fork.id, "spells", fireball.id);

    expect(((await readView(fork.id)).modifiersBySource.get(holder.id) ?? []).length).toBe(1);
  });
});

describe("what a third independent review found", () => {
  test("a fork that edited a feat two books print, then drops the book it read: the rule follows the other printing", async () => {
    const { session } = await createTestUser();
    const fork = await forkCore(session);
    const [arcane, divine] = await booksOf(DND35_COMPLETE_ARCANE_NAME, DND35_COMPLETE_DIVINE_NAME);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [arcane, divine]);
    const holder = await createFeat(session, fork.id, "Arcane Echo");
    await requireFeat(session, fork.id, holder.id, "feats.practicedspellcaster.possessed");
    const shown = await featOf(fork.id, "Practiced Spellcaster");
    const winner = shown.id === (await featOf(arcane, "Practiced Spellcaster")).id ? arcane : divine;
    await EntitiesService.updateEntity(session, fork.id, "feats", shown.id, {
      name: "Practiced Spellcaster",
      description: "Edited in the fork",
    });

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, winner);

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.practicedspellcaster.possessed"]);
    expect(await switchedOffIn(fork.id)).toEqual([]);
  });

  test("a save that sends only a condition's level keeps what it means", async () => {
    const { fork, session } = await setUp();
    const dodge = await featOf(fork.id, "Dodge");
    const holder = await createFeat(session, fork.id, "Holder");
    const requirement = await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });

    await RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, requirement.id, { level: "2" });

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.sidestep.possessed"]);
    await createFeat(session, fork.id, "Dodge");
    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.sidestep.possessed"]);
  });

  test("a rule whose text was changed straight in the database is read anew by the next fill", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Holder");
    const requirement = await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");
    await db.execute(
      sql`update customization.requirements set target = 'feats.mobility.possessed' where id = ${requirement.id}`,
    );
    RulesetViews.invalidate(fork.id);

    await NameBindingFill.fill(db, fork.id);
    RulesetViews.invalidate(fork.id);
    const mobility = await featOf(fork.id, "Mobility");
    await EntitiesService.updateEntity(session, fork.id, "feats", mobility.id, { name: "Fleet Feet" });

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.fleetfeet.possessed"]);
  });
});

describe("what a fourth independent review found", () => {
  test("a rule made under one book's printing, a feat edited under another's, the first book dropped, the edit undone: the rule holds", async () => {
    const { session } = await createTestUser();
    const fork = await forkCore(session);
    const [arcane, divine] = await booksOf(DND35_COMPLETE_ARCANE_NAME, DND35_COMPLETE_DIVINE_NAME);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [arcane]);
    const holder = await createFeat(session, fork.id, "Arcane Echo");
    await requireFeat(session, fork.id, holder.id, "feats.practicedspellcaster.possessed");
    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, arcane);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [divine]);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [arcane]);
    const shown = await featOf(fork.id, "Practiced Spellcaster");
    await EntitiesService.updateEntity(session, fork.id, "feats", shown.id, {
      name: "Practiced Spellcaster",
      description: "Edited in the fork",
    });

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, arcane);
    await RulesetChangesService.revertOverride(session, fork.id, "feats", shown.id);

    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.practicedspellcaster.possessed"]);
    expect(await switchedOffIn(fork.id)).toEqual([]);
  });

  test("a character's own modifier follows the other book's printing when its book leaves", async () => {
    const { session, user } = await createTestUser();
    const fork = await forkCore(session);
    const [arcane, divine] = await booksOf(DND35_COMPLETE_ARCANE_NAME, DND35_COMPLETE_DIVINE_NAME);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [arcane, divine]);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    await CharacterModifiersService.createModifier(session, character.id, {
      operator: "set",
      target: "feats.practicedspellcaster.possessed",
      value: "true",
    });
    const shown = (await featOf(fork.id, "Practiced Spellcaster")).id;
    const first = shown === (await featOf(arcane, "Practiced Spellcaster")).id ? arcane : divine;

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, first);
    const staying = await featOf(fork.id, "Practiced Spellcaster");
    await EntitiesService.updateEntity(session, fork.id, "feats", staying.id, { name: "Seasoned Spellcaster" });

    const built = await buildCharacter(character);
    const { appliedModifiers, skippedModifiers } = built.modifierEvaluator.getModifiers();
    const own = (modifier: { sourceId: string }) => modifier.sourceId === character.id;
    expect(appliedModifiers.filter(own).map((modifier) => modifier.target)).toEqual([
      "feats.seasonedspellcaster.possessed",
    ]);
    expect(skippedModifiers.filter(({ modifier }) => own(modifier))).toEqual([]);
  });

  test("a fill run beside a running server tells it which rulesets' rules it gave their meaning", async () => {
    const { fork, session } = await setUp();
    const other = (await setUp()).fork;
    const holder = await createFeat(session, fork.id, "Holder");
    const requirement = await requireFeat(session, fork.id, holder.id, "feats.dodge.possessed");
    await db.execute(sql`delete from customization.name_bindings where requirement_id = ${requirement.id}`);
    const versions = async () => await Rulesets.findVersions(db, { ids: [fork.id, other.id] });
    const before = await versions();

    await writeNameBindings(db, "all");

    const after = await versions();
    expect(Number(after.get(fork.id)) - Number(before.get(fork.id))).toBe(1);
    expect(Number(after.get(other.id)) - Number(before.get(other.id))).toBe(0);
  });
});

describe("what a fifth independent review found", () => {
  test("a formula follows its class whether its path is written in brackets or bare", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Holder");
    const valueOf = async (value: string) => {
      const modifier = await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
        operator: "add",
        target: "abilities.strength.misc",
        value,
      });
      return async () => (await readView(fork.id)).modifiersById.get(modifier.id)?.value;
    };
    const bare = await valueOf("{{ floor(classes.fighter.level / 2) }}");
    const mixed = await valueOf(
      "{{ max([classes.fighter.level], classes.wizard.level) + abilities.strength.modifier }}",
    );
    const fighter = Dnd35View.of(await readView(fork.id)).classes.find((c) => c.name === "Fighter")!;

    await EntitiesService.updateEntity(session, fork.id, "classes", fighter.id, { name: "Warrior" });

    expect(await bare()).toBe("{{ floor(classes.warrior.level / 2) }}");
    expect(await mixed()).toBe(
      "{{ max([classes.warrior.level], classes.wizard.level) + abilities.strength.modifier }}",
    );
  });

  test("a fill gives a copied class's level's rule what its source meant, as a copied feat's", async () => {
    const { fork, session } = await setUp();
    const start = Dnd35View.of(await readView(fork.id));
    const mobility = start.feats.find((feat) => feat.name === "Mobility")!;
    const dodge = start.feats.find((feat) => feat.name === "Dodge")!;
    const druid = start.classes.find((klass) => klass.name === "Druid")!;
    const druidic = start.languages.find((language) => language.name === "Druidic")!;
    await EntitiesService.updateEntity(session, fork.id, "feats", mobility.id, { name: "Mobility", description: "x" });
    await EntitiesService.updateEntity(session, fork.id, "classes", druid.id, { name: "Druid", description: "x" });
    await EntitiesService.updateEntity(session, fork.id, "feats", dodge.id, { name: "Sidestep" });
    await EntitiesService.updateEntity(session, fork.id, "languages", druidic.id, { name: "Old Tongue" });
    // As a ruleset saved before its rules' names were kept
    await db.execute(sql`
      delete from customization.name_bindings b
      where b.modifier_id in (
          select m.id from customization.modifiers m join rules.entities e on e.id = m.source_id
          where e.ruleset_id = ${fork.id})
        or b.requirement_id in (
          select q.id from customization.requirements q join rules.entities e on e.id = q.entity_id
          where e.ruleset_id = ${fork.id})`);
    RulesetViews.invalidate(fork.id);

    await NameBindingFill.fill(db, fork.id);
    RulesetViews.invalidate(fork.id);

    const view = await readView(fork.id);
    const dnd35 = Dnd35View.of(view);
    const feat = dnd35.feats.find((candidate) => candidate.name === "Mobility")!;
    const copy = dnd35.classes.find((klass) => klass.name === "Druid")!;
    const level = dnd35.classLevels.find((candidate) => candidate.ownerId === copy.id && candidate.position === 1)!;
    expect((view.requirementsByEntity.get(feat.id) ?? []).map((r) => r.target)).toContain("feats.sidestep.possessed");
    expect((view.modifiersBySource.get(level.id) ?? []).map((m) => m.target)).toContain("languages.oldtongue.known");
  });

  test("a condition moved to a level only a hidden condition holds takes the next free one", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Holder");
    const gone = await createFeat(session, fork.id, "Soon Gone");
    await requireFeat(session, fork.id, holder.id, "feats.soongone.possessed");
    const kept = await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      level: "2",
      operator: "equal",
      target: "feats.dodge.possessed",
      value: "true",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", gone.id);
    const listed = async () =>
      (await RequirementsService.getRequirements(session, fork.id, "feats", holder.id)).map((r) => r.level);
    expect(await listed()).toEqual(["2"]);

    await RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, kept.id, {
      level: "1",
      operator: "equal",
      target: "feats.dodge.possessed",
      value: "true",
    });

    expect(await listed()).toEqual(["3"]);
    expect(await conditionsOf(fork.id, holder.id)).toEqual(["feats.dodge.possessed"]);
  });

  test("a group whose children are all hidden conditions goes with them: its page can't turn it into a condition", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Holder");
    const gone = await createFeat(session, fork.id, "Soon Gone");
    const group = await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      level: "1",
      chainingOperator: "and",
    });
    await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      level: "1.1",
      operator: "equal",
      target: "feats.soongone.possessed",
      value: "true",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", gone.id);
    const listed = await RequirementsService.getRequirements(session, fork.id, "feats", holder.id);

    const turned = RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, group.id, {
      level: "1",
      operator: "equal",
      target: "feats.dodge.possessed",
      value: "true",
    });

    expect(listed).toEqual([]);
    expect(turned).rejects.toEqual(new RulesError("not-found", "Requirement not found for this entity"));
    expect(
      (await Requirements.findMany(db, { entityIds: [holder.id], entityType: "feats" })).map((r) => r.level),
    ).toEqual(["1", "1.1"]);
  });

  test("a condition whose race is gone is listed with the fields it stores, and no other", async () => {
    const { fork, session } = await setUp();
    const holder = await createFeat(session, fork.id, "Holder");
    const condition = { level: "1", operator: "equal", target: "identity.physiology.race.name" };
    await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, { ...condition, value: "Elf" });
    const before = await RequirementsService.getRequirements(session, fork.id, "feats", holder.id);
    const gnome = Dnd35View.of(await readView(fork.id)).races.find((race) => race.name === "Gnome")!;
    await RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, before[0].id, {
      ...condition,
      value: "Gnome",
    });

    await EntitiesService.deleteEntity(session, fork.id, "races", gnome.id);

    const [after] = await RequirementsService.getRequirements(session, fork.id, "feats", holder.id);
    expect(after.value).toBe("Gnome");
    expect(Object.keys(after).toSorted()).toEqual(Object.keys(before[0]).toSorted());
  });

  test("a condition asked into a group its page doesn't list is refused, as a taken level is", async () => {
    const { fork, session } = await setUp();
    const first = await createFeat(session, fork.id, "Gone First");
    const second = await createFeat(session, fork.id, "Gone Second");
    const holder = await createFeat(session, fork.id, "Holder");
    const condition = { operator: "equal", value: "true" };
    await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      chainingOperator: "or",
      level: "1",
    });
    const hidden = (level: string, target: string) =>
      RequirementsService.createRequirement(session, fork.id, "feats", holder.id, { ...condition, level, target });
    await hidden("1.1", "feats.gonefirst.possessed");
    await hidden("1.2", "feats.gonesecond.possessed");
    const kept = await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      ...condition,
      level: "2",
      target: "feats.dodge.possessed",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", first.id);
    await EntitiesService.deleteEntity(session, fork.id, "feats", second.id);
    const asked = { ...condition, level: "1.1", target: "feats.dodge.possessed" };

    expect(RequirementsService.updateRequirement(session, fork.id, "feats", holder.id, kept.id, asked)).rejects.toThrow(
      "A requirement at this level already exists",
    );
    expect(RequirementsService.createRequirement(session, fork.id, "feats", holder.id, asked)).rejects.toThrow(
      "A requirement at this level already exists",
    );
  });
});
