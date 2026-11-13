/**
 * A skill's own feats once their author changed them, or made feats by hand under such names: what a seventh
 * independent review found. The app tells a skill's feat by its name's kind ("Skill Focus: …", which its author can't
 * change) and the skill it gives to, and leaves alone what it can't tell.
 */

import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { stripSeparators } from "@/shared/text.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const RULES = { dnd35: "Dungeons & Dragons: 3.5", dnd5: "Dungeons & Dragons: 5", pf1: "Pathfinder: 1" } as const;

/** What a write answers: "ok", or its refusal's words. */
async function attempt(write: () => Promise<unknown>) {
  try {
    await write();
    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
}

/** The feat of a name in a ruleset's view, with the paths its rules give to. */
async function featNamed(rulesetId: string, name: string) {
  return (await featsOf(rulesetId)).find((feat) => feat.name === name);
}

/** A ruleset's feats, each with whether the app made it and the paths its rules give to. */
async function featsOf(rulesetId: string) {
  const view = await readView(rulesetId);
  return view.rows("feats").map((feat) => ({
    generated: feat.fields.FEAT_GENERATED === true,
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

/** The names of the feats of a kind (`prefix`) with a rule on a skill of this name. */
async function givingTo(rulesetId: string, skillName: string, prefix: string) {
  const path = `skills.${stripSeparators(skillName)}.`;
  return (await featsOf(rulesetId))
    .filter((feat) => feat.name.startsWith(prefix) && feat.targets.some((target) => target.startsWith(path)))
    .map((feat) => feat.name)
    .toSorted();
}

/** The pools a feat is listed in, as a new feat's links. */
async function poolsOf(session: Parameters<typeof EntitiesService.getEntity>[0], rulesetId: string, featId: string) {
  const described = await EntitiesService.getEntity(session, rulesetId, "feats", featId);
  return described.links.filter((link) => link.role === "listedIn").map((link) => ({ toId: link.toId }));
}

/** The skill of a name, as a ruleset's view shows it. */
async function skillNamed(rulesetId: string, name: string) {
  return (await readView(rulesetId)).rows("skills").find((skill) => skill.name === name)!;
}

describe("a skill's own feat whose author changed it", () => {
  test.each(Object.values(RULES))("its rule removed, its renamed skill is still restored (%s)", async (rules) => {
    const { fork, session } = await forkOf(rules);
    const [skill] = (await readView(fork.id)).rows("skills");
    const own = (await featsOf(fork.id)).filter((feat) => feat.name.endsWith(`: ${skill.name}`));
    for (const feat of own) {
      for (;;) {
        const view = await readView(fork.id);
        const now = view.rows("feats").find((candidate) => candidate.name === feat.name)!;
        const [modifier] = view.modifiersBySource.get(now.id) ?? [];
        if (!modifier) break;
        await ModifiersService.deleteModifier(session, fork.id, "feats", now.id, modifier.id);
      }
    }
    await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, { name: "Scale" });

    const restored = await attempt(() => RulesetChangesService.revertOverride(session, fork.id, "skills", skill.id));

    expect(restored).toBe("ok");
  });

  test.each(["rename", "delete"] as const)(
    "5e: a Skill Proficiency given an expertise rule isn't taken for its skill's Expertise on the skill's %s",
    async (action) => {
      const { fork, session } = await forkOf(RULES.dnd5);
      const stealth = await skillNamed(fork.id, "Stealth");
      const proficiency = (await featNamed(fork.id, "Skill Proficiency: Stealth"))!;
      const expertise = (await featNamed(fork.id, "Expertise: Stealth"))!;
      await ModifiersService.createModifier(session, fork.id, "feats", proficiency.id, {
        operator: "set",
        target: "skills.stealth.expertise",
        value: "true",
      });
      await EntitiesService.deleteEntity(session, fork.id, "feats", expertise.id);

      if (action === "delete") {
        expect(await attempt(() => EntitiesService.deleteEntity(session, fork.id, "skills", stealth.id))).toBe("ok");
        return;
      }
      await EntitiesService.updateEntity(session, fork.id, "skills", stealth.id, { name: "Sneak" });

      const kept = await featNamed(fork.id, "Skill Proficiency: Sneak");
      expect(kept?.targets.toSorted()).toEqual(["skills.sneak.expertise", "skills.sneak.proficient"]);
    },
  );

  test("3.5: another kind's generated feat given a rule on a skill keeps its name when the skill is renamed", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const speak = await skillNamed(fork.id, "Speak Language");
    const other = (await featsOf(fork.id)).find((feat) => feat.generated && !feat.name.startsWith("Skill Focus: "))!;
    await ModifiersService.createModifier(session, fork.id, "feats", other.id, {
      operator: "add",
      target: "skills.speaklanguage.misc",
      value: "2",
    });

    await EntitiesService.updateEntity(session, fork.id, "skills", speak.id, { name: "Tongues" });

    expect({ feat: other.name, kept: !!(await featNamed(fork.id, other.name)) }).toEqual({
      feat: other.name,
      kept: true,
    });
  });

  test.each([RULES.dnd35, RULES.pf1])(
    "another kind's generated feat given a rule on a skill stays when the skill is deleted (%s)",
    async (rules) => {
      const { fork, session } = await forkOf(rules);
      const climb = await skillNamed(fork.id, "Climb");
      const focus = (await featNamed(fork.id, "Skill Focus: Climb"))!;
      const other = (await featsOf(fork.id)).find((feat) => feat.generated && !feat.name.startsWith("Skill Focus: "))!;
      await ModifiersService.createModifier(session, fork.id, "feats", other.id, {
        operator: "add",
        target: "skills.climb.misc",
        value: "2",
      });
      await EntitiesService.deleteEntity(session, fork.id, "feats", focus.id);

      await EntitiesService.deleteEntity(session, fork.id, "skills", climb.id);

      expect({ feat: other.name, kept: !!(await featNamed(fork.id, other.name)) }).toEqual({
        feat: other.name,
        kept: true,
      });
    },
  );

  test("3.5: given a second skill's rule, then restored by itself, it keeps its own skill's name", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    const appraise = await skillNamed(fork.id, "Appraise");
    const focus = (await featNamed(fork.id, "Skill Focus: Climb"))!;
    await EntitiesService.updateEntity(session, fork.id, "skills", appraise.id, { name: "Assess" });
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
    const scale = (await featNamed(fork.id, "Skill Focus: Scale"))!;
    await ModifiersService.createModifier(session, fork.id, "feats", scale.id, {
      operator: "add",
      target: "skills.assess.misc",
      value: "1",
    });
    await EntitiesService.deleteEntity(
      session,
      fork.id,
      "feats",
      (await featNamed(fork.id, "Skill Focus: Assess"))!.id,
    );

    await RulesetChangesService.revertOverride(session, fork.id, "feats", focus.id);

    expect(await givingTo(fork.id, "Scale", "Skill Focus: ")).toEqual(["Skill Focus: Scale"]);
  });

  test("5e: a Skill Proficiency given an expertise rule, then restored by itself, keeps its name", async () => {
    const { fork, session } = await forkOf(RULES.dnd5);
    const stealth = await skillNamed(fork.id, "Stealth");
    const proficiency = (await featNamed(fork.id, "Skill Proficiency: Stealth"))!;
    await EntitiesService.updateEntity(session, fork.id, "skills", stealth.id, { name: "Sneak" });
    const renamed = (await featNamed(fork.id, "Skill Proficiency: Sneak"))!;
    await ModifiersService.createModifier(session, fork.id, "feats", renamed.id, {
      operator: "set",
      target: "skills.sneak.expertise",
      value: "true",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", (await featNamed(fork.id, "Expertise: Sneak"))!.id);

    await RulesetChangesService.revertOverride(session, fork.id, "feats", proficiency.id);

    const names = (await featsOf(fork.id)).filter((feat) => feat.name.endsWith(": Sneak")).map((feat) => feat.name);
    expect(names).toEqual(["Skill Proficiency: Sneak"]);
  });

  test("3.5: a rule or a description its author gave it stays when its renamed skill is restored", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
    const scale = (await featNamed(fork.id, "Skill Focus: Scale"))!;
    await ModifiersService.createModifier(session, fork.id, "feats", scale.id, {
      operator: "add",
      target: "abilities.strength.misc",
      value: "1",
    });

    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb.id);

    expect((await featNamed(fork.id, "Skill Focus: Climb"))?.targets.toSorted()).toEqual([
      "abilities.strength.misc",
      "skills.climb.misc",
    ]);
  });
});

describe("a feat made by hand under a skill's feat's name", () => {
  test("3.5: in place of a deleted Skill Focus, it stays when another skill takes that name", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    const swim = await skillNamed(fork.id, "Swim");
    const focus = (await featNamed(fork.id, "Skill Focus: Climb"))!;
    const listedIn = await poolsOf(session, fork.id, focus.id);
    await EntitiesService.deleteEntity(session, fork.id, "feats", focus.id);
    const mine = await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Skill Focus: Climb",
      description: "My own rule, by hand",
      links: { listedIn },
    });
    await RequirementsService.createRequirement(session, fork.id, "feats", mine.id, {
      level: "1",
      operator: "equal",
      target: "feats.dodge.possessed",
      value: "true",
    });
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });

    await EntitiesService.updateEntity(session, fork.id, "skills", swim.id, { name: "Climb" });

    expect((await featNamed(fork.id, "Skill Focus: Climb"))?.id).toBe(mine.id);
  });
});

describe("a deleted Skill Focus", () => {
  test("3.5: isn't restored beside the one its renamed skill was given since, so each skill keeps one", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const climb = await skillNamed(fork.id, "Climb");
    const swim = await skillNamed(fork.id, "Swim");
    const focus = (await featNamed(fork.id, "Skill Focus: Climb"))!;
    await EntitiesService.deleteEntity(session, fork.id, "feats", focus.id);
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });

    const restored = await attempt(() => RulesetChangesService.revertOverride(session, fork.id, "feats", focus.id));

    expect(restored).toBe("Scale has Skill Focus: Scale already: delete it to restore this feat");
    await EntitiesService.updateEntity(session, fork.id, "skills", swim.id, { name: "Climb" });
    expect({
      climb: await givingTo(fork.id, "Climb", "Skill Focus: "),
      scale: await givingTo(fork.id, "Scale", "Skill Focus: "),
    }).toEqual({ climb: ["Skill Focus: Climb"], scale: ["Skill Focus: Scale"] });
  });
});

describe("a group of conditions a feat's page doesn't list", () => {
  test("takes no new condition, at a level it holds or at a free one", async () => {
    const { fork, session } = await forkOf(RULES.dnd35);
    const listedIn = await poolsOf(session, fork.id, (await featNamed(fork.id, "Skill Focus: Climb"))!.id);
    const make = (name: string) =>
      EntitiesService.createEntity(session, fork.id, "feats", { name, links: { listedIn } });
    const first = await make("Gone First");
    const second = await make("Gone Second");
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
    await add("1.1", "feats.gonefirst.possessed");
    await add("1.2", "feats.gonesecond.possessed");
    await EntitiesService.deleteEntity(session, fork.id, "feats", first.id);
    await EntitiesService.deleteEntity(session, fork.id, "feats", second.id);
    expect(await RequirementsService.getRequirements(session, fork.id, "feats", holder.id)).toEqual([]);

    expect(await attempt(() => add("1.3", "feats.dodge.possessed"))).toBe("A requirement at this level already exists");
    expect(await attempt(() => add("1.1", "feats.dodge.possessed"))).toBe("A requirement at this level already exists");
    expect(await attempt(() => add("1", "feats.dodge.possessed"))).toBe("ok");
  });
});
