/**
 * A skill's own feats through restores, books' renames and name swaps: what an eighth independent review found. A
 * restored skill gets back the feats deleted with it, whatever took their names meanwhile, and no feat its author
 * deleted by hand.
 */

import { describe, expect, test } from "bun:test";

import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const RULES = { dnd35: "Dungeons & Dragons: 3.5", dnd5: "Dungeons & Dragons: 5", pf1: "Pathfinder: 1" } as const;

const ALL = Object.values(RULES);

/** The kinds of feats a skill brings, by their names' start, in each base rules. */
const KINDS: Record<string, string[]> = {
  [RULES.dnd35]: ["Skill Focus"],
  [RULES.dnd5]: ["Skill Proficiency", "Expertise"],
  [RULES.pf1]: ["Skill Focus"],
};

/** The names of the feats a skill of this name brings, sorted. */
function broughtBy(rules: string, skillName: string) {
  return KINDS[rules].map((kind) => `${kind}: ${skillName}`).toSorted();
}

/** What a write answers: "ok", or its refusal's words. */
async function attempt(write: () => Promise<unknown>) {
  try {
    await write();
    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
}

/** A published book of a base rules, as its author prepared it. */
async function bookOf(rules: string, prepare: (author: Session, bookId: string) => Promise<void>) {
  const { fork: book, session: author } = await forkOf(rules);
  await prepare(author, book.id);
  await RulesetsService.publishRuleset(author, book.id, { kind: "extension" });
  return { author, book };
}

/** A ruleset's changes, each as a line. */
async function changesOf(session: Session, rulesetId: string) {
  const changes = await RulesetChangesService.getChanges(session, rulesetId);
  return changes.map((change) => `${change.status} ${change.entityType} ${change.name}`);
}

/** The feat of a name in a ruleset's view. */
async function featNamed(rulesetId: string, name: string) {
  return (await featsOf(rulesetId)).find((feat) => feat.name === name);
}

/** A ruleset's feats, each with the paths its rules give to. */
async function featsOf(rulesetId: string) {
  const view = await readView(rulesetId);
  return view.rows("feats").map((feat) => ({
    description: feat.description,
    id: feat.id,
    name: feat.name,
    targets: (view.modifiersBySource.get(feat.id) ?? []).map((modifier) => modifier.target),
  }));
}

/** A fork of a seeded base rules, with its owner's session. */
async function forkOf(rules: string) {
  const bases = await Rulesets.findMany(db, { system: true });
  const base = bases.find((ruleset) => ruleset.rulesetId === null && ruleset.baseRules === rules)!;
  const { session } = await createTestUser();
  const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
  return { fork, session };
}

/** The names of a skill's kinds of feats with a rule on a skill of this name. */
async function givingTo(rulesetId: string, rules: string, skillName: string) {
  const path = `skills.${stripSeparators(skillName)}.`;
  return (await featsOf(rulesetId))
    .filter((feat) => KINDS[rules].some((kind) => feat.name.startsWith(`${kind}: `)))
    .filter((feat) => feat.targets.some((target) => target.startsWith(path)))
    .map((feat) => feat.name)
    .toSorted();
}

async function rename(session: Session, rulesetId: string, skillId: string, name: string) {
  return await EntitiesService.updateEntity(session, rulesetId, "skills", skillId, { name });
}

async function restore(session: Session, rulesetId: string, type: "feats" | "skills", id: string) {
  return await RulesetChangesService.revertOverride(session, rulesetId, type, id);
}

/** The skill of a name, as a ruleset's view shows it. */
async function skillNamed(rulesetId: string, name: string) {
  return (await readView(rulesetId)).rows("skills").find((skill) => skill.name === name)!;
}

/** The skills that bring every kind of feat their base rules give a skill. */
async function skillsWithFeats(rulesetId: string, rules: string) {
  const view = await readView(rulesetId);
  const names = new Set(view.rows("feats").map((feat) => feat.name));
  return view.rows("skills").filter((skill) => broughtBy(rules, skill.name).every((name) => names.has(name)));
}

describe("a deleted skill, restored", () => {
  test("3.5: gets its Skill Focus back, though a skill with none had its name meanwhile", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    const speak = await skillNamed(fork.id, "Speak Language");
    await EntitiesService.deleteEntity(session, fork.id, "skills", climb.id);
    await rename(session, fork.id, speak.id, "Climb");
    await restore(session, fork.id, "skills", speak.id);

    await restore(session, fork.id, "skills", climb.id);

    expect({
      changes: await changesOf(session, fork.id),
      climb: await givingTo(fork.id, RULES.dnd35, "Climb"),
    }).toEqual({
      changes: ["added feats Skill Focus: Speak Language"],
      climb: ["Skill Focus: Climb"],
    });
  });

  test.each(ALL)(
    "gets its feats back, another skill having had its name and been renamed since (%s)",
    async (rules) => {
      const { fork, session } = await forkOf(rules);
      const [first, second] = await skillsWithFeats(fork.id, rules);
      for (const name of broughtBy(rules, second.name))
        await EntitiesService.deleteEntity(session, fork.id, "feats", (await featNamed(fork.id, name))!.id);
      await EntitiesService.deleteEntity(session, fork.id, "skills", first.id);
      await rename(session, fork.id, second.id, first.name);
      await rename(session, fork.id, (await skillNamed(fork.id, first.name)).id, "Elsewhere");

      await restore(session, fork.id, "skills", first.id);

      expect({ rules, feats: await givingTo(fork.id, rules, first.name) }).toEqual({
        rules,
        feats: broughtBy(rules, first.name),
      });
    },
  );

  test.each(ALL)("gets its feats back under the name a subscribed book gave it since (%s)", async (rules) => {
    let skillId = "";
    const { book } = await bookOf(rules, async (author, bookId) => {
      const [skill] = await skillsWithFeats(bookId, rules);
      skillId = skill.id;
      await rename(author, bookId, skill.id, "Bookname");
    });
    const { fork, session } = await forkOf(rules);
    await EntitiesService.deleteEntity(session, fork.id, "skills", skillId);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);

    await restore(session, fork.id, "skills", skillId);

    expect({
      rules,
      changes: await changesOf(session, fork.id),
      feats: await givingTo(fork.id, rules, "Bookname"),
    }).toEqual({ rules, changes: [], feats: broughtBy(rules, "Bookname") });
  });
});

describe("a skill's edit, restored", () => {
  test.each(ALL)("leaves deleted the feats its author deleted by hand (%s)", async (rules) => {
    const { fork, session } = await forkOf(rules);
    const [skill] = await skillsWithFeats(fork.id, rules);
    for (const name of broughtBy(rules, skill.name))
      await EntitiesService.deleteEntity(session, fork.id, "feats", (await featNamed(fork.id, name))!.id);
    await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, {
      name: skill.name,
      description: "My words",
    });
    const deleted = (await changesOf(session, fork.id)).filter((change) => change.startsWith("deleted feats"));

    await restore(session, fork.id, "skills", skill.id);

    expect({ rules, changes: await changesOf(session, fork.id) }).toEqual({ rules, changes: deleted });
  });

  test.each(ALL)("leaves no change of a renamed skill's feats, their pools edited before (%s)", async (rules) => {
    const { fork, session } = await forkOf(rules);
    const [skill] = await skillsWithFeats(fork.id, rules);
    const view = await readView(fork.id);
    const pools = new Set<string>();
    for (const name of broughtBy(rules, skill.name)) {
      const described = await EntitiesService.getEntity(
        session,
        fork.id,
        "feats",
        (await featNamed(fork.id, name))!.id,
      );
      for (const link of described.links.filter((candidate) => candidate.role === "listedIn")) pools.add(link.toId);
    }
    for (const poolId of pools) {
      const pool = view.rows("aptitudes").find((aptitude) => aptitude.id === poolId)!;
      await EntitiesService.updateEntity(session, fork.id, "aptitudes", pool.id, {
        name: pool.name,
        description: "Mine",
      });
    }
    const before = await changesOf(session, fork.id);

    await rename(session, fork.id, skill.id, "Renamed");
    await restore(session, fork.id, "skills", skill.id);

    expect({ rules, changes: await changesOf(session, fork.id) }).toEqual({ rules, changes: before });
  });
});

describe("a book's skills renamed under a subscriber's copies of them", () => {
  test.each(ALL)(
    "two that took each other's place: renaming one copy keeps each skill its feats (%s)",
    async (rules) => {
      const ids = { first: "", second: "" };
      const { author, book } = await bookOf(rules, async (session, bookId) => {
        const [ability] = (await readView(bookId)).rows("abilities");
        const make = (name: string) =>
          EntitiesService.createEntity(session, bookId, "skills", { name, links: { keyAbility: ability.id } });
        ids.first = (await make("Aaa")).id;
        ids.second = (await make("Bbb")).id;
      });
      const { fork, session } = await forkOf(rules);
      await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
      await EntitiesService.updateEntity(session, fork.id, "skills", ids.first, { name: "Aaa", description: "Mine" });
      await EntitiesService.updateEntity(session, fork.id, "skills", ids.second, { name: "Bbb", description: "Mine" });
      await rename(author, book.id, ids.first, "Ccc");
      await rename(author, book.id, ids.second, "Aaa");

      await rename(session, fork.id, (await skillNamed(fork.id, "Bbb")).id, "Ccc");

      expect({
        rules,
        aaa: await givingTo(fork.id, rules, "Aaa"),
        ccc: await givingTo(fork.id, rules, "Ccc"),
      }).toEqual({ rules, aaa: broughtBy(rules, "Aaa"), ccc: broughtBy(rules, "Ccc") });
    },
  );

  test.each(ALL)("a feat the subscriber's rename renames is described by its new name (%s)", async (rules) => {
    let skillId = "";
    const { author, book } = await bookOf(rules, async (session, bookId) => {
      const [ability] = (await readView(bookId)).rows("abilities");
      const skill = await EntitiesService.createEntity(session, bookId, "skills", {
        name: "Parkour",
        links: { keyAbility: ability.id },
      });
      skillId = skill.id;
    });
    const { fork, session } = await forkOf(rules);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
    await EntitiesService.updateEntity(session, fork.id, "skills", skillId, { name: "Parkour", description: "Mine" });
    await rename(author, book.id, skillId, "Freerunning");

    await rename(session, fork.id, (await skillNamed(fork.id, "Parkour")).id, "Vaulting");

    const [name] = broughtBy(rules, "Vaulting");
    const description = (await featNamed(fork.id, name))?.description ?? "";
    expect({
      rules,
      freerunning: description.includes("Freerunning"),
      vaulting: description.includes("Vaulting"),
    }).toEqual({ rules, freerunning: false, vaulting: true });
  });
});

describe("a Skill Focus its author rewrote", () => {
  test("3.5: stays when another skill takes its name, what its own rule named deleted since", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    const swim = await skillNamed(fork.id, "Swim");
    const focus = (await featNamed(fork.id, "Skill Focus: Climb"))!;
    const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
    const homebrew = await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Homebrew",
      links: { listedIn: [{ toId: general.id }] },
    });
    const [rule] = (await readView(fork.id)).modifiersBySource.get(focus.id)!;
    await ModifiersService.deleteModifier(session, fork.id, "feats", focus.id, rule.id);
    const mine = (await featNamed(fork.id, "Skill Focus: Climb"))!;
    await EntitiesService.updateEntity(session, fork.id, "feats", mine.id, {
      name: mine.name,
      description: "My own Skill Focus",
    });
    await ModifiersService.createModifier(session, fork.id, "feats", mine.id, {
      operator: "set",
      target: "feats.homebrew.possessed",
      value: "true",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", homebrew.id);
    await rename(session, fork.id, climb.id, "Scale");

    await rename(session, fork.id, swim.id, "Climb");

    expect((await featNamed(fork.id, "Skill Focus: Climb"))?.description).toBe("My own Skill Focus");
  });
});

describe("a group of conditions a feat's page doesn't list", () => {
  test("takes no new condition however deep inside it", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
    const make = (name: string) =>
      EntitiesService.createEntity(session, fork.id, "feats", { name, links: { listedIn: [{ toId: general.id }] } });
    const gone = await make("Gone");
    const holder = await make("Holder");
    const add = (level: string, target: string) =>
      RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
        level,
        operator: "equal",
        target,
        value: "true",
      });
    await RequirementsService.createRequirement(session, fork.id, "feats", holder.id, {
      chainingOperator: "or",
      level: "1",
    });
    await add("1.1", "feats.gone.possessed");
    await EntitiesService.deleteEntity(session, fork.id, "feats", gone.id);

    const saved = await attempt(() => add("1.2.1", "feats.dodge.possessed"));

    expect({
      listed: (await RequirementsService.getRequirements(session, fork.id, "feats", holder.id)).length,
      saved,
    }).toEqual({ listed: 0, saved: "A requirement at this level already exists" });
  });
});

describe("what a ninth independent review found", () => {
  test.each(ALL)(
    "a subscriber's copy of a book's skill's feat holds that feat's rules, and no other skill's (%s)",
    async (rules) => {
      let coreName = "";
      const { book } = await bookOf(rules, async (author, bookId) => {
        const [skill] = await skillsWithFeats(bookId, rules);
        const [ability] = (await readView(bookId)).rows("abilities");
        coreName = skill.name;
        const made = await EntitiesService.createEntity(author, bookId, "skills", {
          name: "Charlie",
          links: { keyAbility: ability.id },
        });
        await rename(author, bookId, skill.id, "Bravo");
        await rename(author, bookId, made.id, coreName);
      });
      const { fork, session } = await forkOf(rules);
      await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
      const [name] = broughtBy(rules, coreName);
      const inBook = (await featNamed(book.id, name))!;
      const shown = (await featNamed(fork.id, name))!;
      expect({ rules, targets: shown.targets }).toEqual({ rules, targets: inBook.targets });

      await EntitiesService.updateEntity(session, fork.id, "feats", shown.id, { name, description: "Mine" });

      expect({ rules, targets: (await featNamed(fork.id, name))!.targets }).toEqual({ rules, targets: inBook.targets });
    },
  );

  test("5e: a deleted skill's feat, restored without it, is the skill's again when one is made under its name", async () => {
    const { fork, session } = await forkOf(RULES.dnd5);
    const skill = await skillNamed(fork.id, "Acrobatics");
    const [ability] = (await readView(fork.id)).rows("abilities");
    const name = "Skill Proficiency: Acrobatics";
    const feat = (await featNamed(fork.id, name))!;
    const pools = async (id: string) =>
      (await EntitiesService.getEntity(session, fork.id, "feats", id)).links
        .filter((link) => link.role === "listedIn")
        .map((link) => link.toId)
        .toSorted();
    const before = await pools(feat.id);
    expect(before.length).toBeGreaterThan(1);
    await EntitiesService.deleteEntity(session, fork.id, "skills", skill.id);
    await restore(session, fork.id, "feats", feat.id);

    await EntitiesService.createEntity(session, fork.id, "skills", {
      name: "Acrobatics",
      links: { keyAbility: ability.id },
    });

    const kept = (await featNamed(fork.id, name))!;
    expect({ pools: await pools(kept.id), targets: kept.targets }).toEqual({
      pools: before,
      targets: ["skills.acrobatics.proficient"],
    });
  });

  test("3.5: a feat standing under a name that isn't its skill's gives it up to the skill that takes it", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    const spellcraft = await skillNamed(fork.id, "Spellcraft");
    const emptied = (await featNamed(fork.id, "Skill Focus: Spellcraft"))!;
    const [rule] = (await readView(fork.id)).modifiersBySource.get(emptied.id)!;
    await ModifiersService.deleteModifier(session, fork.id, "feats", emptied.id, rule.id);
    const own = (await featNamed(fork.id, "Skill Focus: Climb"))!;
    await EntitiesService.updateEntity(session, fork.id, "feats", own.id, { name: own.name, description: "My words" });
    await rename(session, fork.id, climb.id, "Temp");
    await rename(session, fork.id, spellcraft.id, "Climb");
    await restore(session, fork.id, "skills", spellcraft.id);

    await rename(session, fork.id, (await skillNamed(fork.id, "Temp")).id, "Climb");

    const mine = (await featsOf(fork.id)).filter((feat) => feat.description === "My words");
    expect({
      climb: await givingTo(fork.id, RULES.dnd35, "Climb"),
      mine: mine.map((feat) => feat.name),
      spellcraft: await givingTo(fork.id, RULES.dnd35, "Spellcraft"),
    }).toEqual({ climb: ["Skill Focus: Climb"], mine: ["Skill Focus: Climb"], spellcraft: [] });
  });

  test("3.5: a book's Skill Focus restored by itself keeps the book's author's words", async () => {
    let skillId = "";
    const { book } = await bookOf(RULES.dnd35, async (author, bookId) => {
      const [ability] = (await readView(bookId)).rows("abilities");
      const skill = await EntitiesService.createEntity(author, bookId, "skills", {
        name: "Parkour",
        links: { keyAbility: ability.id },
      });
      skillId = skill.id;
      const feat = (await featNamed(bookId, "Skill Focus: Parkour"))!;
      await EntitiesService.updateEntity(author, bookId, "feats", feat.id, {
        name: feat.name,
        description: "The book's own words",
      });
    });
    const { fork, session } = await forkOf(RULES.dnd35);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
    const inBook = (await featNamed(fork.id, "Skill Focus: Parkour"))!;
    await rename(session, fork.id, skillId, "Vaulting");

    await restore(session, fork.id, "feats", inBook.id);

    expect((await featNamed(fork.id, "Skill Focus: Vaulting"))?.description).toBe("The book's own words");
  });

  test("3.5: a restored skill brings back no other skill's feat that also gave to it", async () => {
    const { book } = await bookOf(RULES.dnd35, async (author, bookId) => {
      const jump = (await featNamed(bookId, "Skill Focus: Jump"))!;
      await ModifiersService.createModifier(author, bookId, "feats", jump.id, {
        operator: "add",
        target: "skills.climb.misc",
        value: "1",
      });
    });
    const { fork, session } = await forkOf(RULES.dnd35);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
    const jump = (await featNamed(fork.id, "Skill Focus: Jump"))!;
    const climb = await skillNamed(fork.id, "Climb");
    await EntitiesService.deleteEntity(session, fork.id, "feats", jump.id);
    await EntitiesService.deleteEntity(session, fork.id, "skills", climb.id);
    const before = (await changesOf(session, fork.id)).filter((change) => change.includes("Jump"));

    await restore(session, fork.id, "skills", climb.id);

    expect((await changesOf(session, fork.id)).filter((change) => change.includes("Jump"))).toEqual(before);
    expect(await givingTo(fork.id, RULES.dnd35, "Climb")).toEqual(["Skill Focus: Climb"]);
  });
});

describe("what a tenth independent review found", () => {
  test("3.5: a deleted skill, restored, gets back its own feat that a book's author had give to another skill too", async () => {
    const { book } = await bookOf(RULES.dnd35, async (author, bookId) => {
      const feat = (await featNamed(bookId, "Skill Focus: Appraise"))!;
      await ModifiersService.createModifier(author, bookId, "feats", feat.id, {
        operator: "add",
        target: "skills.balance.misc",
        value: "1",
      });
    });
    const { fork, session } = await forkOf(RULES.dnd35);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
    const appraise = await skillNamed(fork.id, "Appraise");
    await EntitiesService.deleteEntity(session, fork.id, "skills", appraise.id);

    await restore(session, fork.id, "skills", appraise.id);

    expect({
      changes: await changesOf(session, fork.id),
      feats: await givingTo(fork.id, RULES.dnd35, "Appraise"),
    }).toEqual({ changes: [], feats: ["Skill Focus: Appraise"] });
  });

  test("3.5: a skill made under a name another skill's feat holds leaves that feat as its author changed it", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const appraise = await skillNamed(fork.id, "Appraise");
    const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
    const [ability] = (await readView(fork.id)).rows("abilities");
    await rename(session, fork.id, appraise.id, "Zed");
    const focus = (await featNamed(fork.id, "Skill Focus: Zed"))!;
    await ModifiersService.createModifier(session, fork.id, "feats", focus.id, {
      operator: "add",
      target: "abilities.strength.misc",
      value: "1",
    });
    await EntitiesService.updateEntity(session, fork.id, "feats", focus.id, {
      name: "Skill Focus: Zed",
      description: "My words",
    });
    await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Skill Focus: Appraise",
      description: "Hand-made",
      links: { listedIn: [{ toId: general.id }] },
    });
    await restore(session, fork.id, "skills", appraise.id);

    await EntitiesService.createEntity(session, fork.id, "skills", { name: "Zed", links: { keyAbility: ability.id } });

    const mine = (await featsOf(fork.id)).filter((feat) => feat.description === "My words");
    expect(mine.map((feat) => feat.name)).toEqual(["Skill Focus: Zed"]);
  });

  test("3.5: copying an inherited skill whose name the ruleset's own skill has is refused, not an error", async () => {
    let skillId = "";
    const { author, book } = await bookOf(RULES.dnd35, async (session, bookId) => {
      skillId = (await skillNamed(bookId, "Appraise")).id;
      await EntitiesService.deleteEntity(session, bookId, "skills", skillId);
    });
    const { fork, session } = await forkOf(RULES.dnd35);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
    await rename(session, fork.id, (await skillNamed(fork.id, "Balance")).id, "Appraise");
    await restore(author, book.id, "skills", skillId);
    const skills = (await readView(fork.id)).rows("skills");
    const inherited = skills.find((skill) => skill.name === "Appraise" && skill.rulesetId !== fork.id)!;

    const deleted = await attempt(() => EntitiesService.deleteEntity(session, fork.id, "skills", inherited.id));

    expect(deleted).toContain("Appraise");
    expect(deleted).not.toContain("duplicate key");
  });
});
