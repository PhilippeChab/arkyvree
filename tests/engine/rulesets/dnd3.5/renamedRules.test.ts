/**
 * What 3.5's rules find by a name keeps working once a fork renames it, as a translation does, and a homebrew entity
 * named like a rules' one doesn't pass for it: the wizard's list a specialist's prohibited schools leave spells out of,
 * a class's own feature pool and spell list, a skill's subtypes and its family, and skills named in another script.
 */

import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Session } from "@/shared/relations.ts";
import { getStepOptions } from "@/tests/support/advancementPlans.ts";
import { buildCharacter, createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import { addCharacterLevel, findClassLevel, increasesOf } from "@/tests/support/dnd3.5/levels.ts";
import { createSeededTestRuleset, ownerSessionOf, readView } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";

/** A pool or a list as a progression's answer names it. */
interface PoolRef {
  id: string | null;
  name: string;
}

/** A homebrew feat of the fork's, in its pools (`pools`, by name: General unless given). */
async function createFeat(session: Session, forkId: string, name: string, pools = ["General"]) {
  const { aptMap } = await getSeedCtx();
  return await EntitiesService.createEntity(session, forkId, "feats", {
    name,
    links: { listedIn: pools.map((pool) => ({ toId: aptMap[pool] })) },
  });
}

/** A fighter of the fork's at its first level, with these picks (its General feats, its skills' points). */
async function createFighter(forkId: string, picks: { feats?: string[]; skills?: Record<string, number> } = {}) {
  const { classMap, aptMap } = await getSeedCtx();
  const character = await createTestCharacter(SEED_USER_ID, { rulesetId: forkId });
  const level = (await findClassLevel(classMap.pc["Fighter"], 1))!;
  await addCharacterLevel(character.id, level.id, {
    feats: { [aptMap["General"]]: picks.feats ?? [] },
    skills: picks.skills ?? {},
  });
  return character;
}

/** A seeded fork, owned by the seed user (whose seeded characters a test may move onto it), with its owner's session. */
async function createFork() {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  return { fork, session: await ownerSessionOf(fork.id) };
}

/** A homebrew skill of the fork's, keyed on Intelligence. */
async function createSkill(session: Session, forkId: string, name: string) {
  const intelligence = (await readView(forkId)).rows("abilities").find((row) => row.name === "Intelligence")!;
  return await EntitiesService.createEntity(session, forkId, "skills", {
    name,
    links: { keyAbility: intelligence.id },
  });
}

/** The view's entity of a kind by its name: refused when the view shows none. */
async function findNamed(forkId: string, type: "aptitudes" | "classes" | "feats" | "skills", name: string) {
  const entity = (await readView(forkId)).rows(type).find((row) => row.name === name);
  if (!entity) throw new Error(`No ${type} named ${name}`);
  return entity;
}

/** Renames an entity of the fork as its author would: its first edit copies an inherited one. */
async function rename(session: Session, forkId: string, type: string, id: string, name: string) {
  await EntitiesService.updateEntity(session, forkId, type as "skills", id, { name });
}

/** A character's skills as its sheet counts them, by their slug. */
async function skillsOf(characterId: string) {
  const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
  const built = await buildCharacter(record!);
  if (!(built instanceof DetailedCharacter)) throw new Error("Not a 3.5 character");
  return built.components.skills.getSkills();
}

/** The fork's view, as 3.5 reads it. */
async function viewOf(forkId: string) {
  return Dnd35View.of(await readView(forkId));
}

describe("a specialist wizard's prohibited schools", () => {
  test("leave their spells out of the wizard's list, whatever the fork calls it", async () => {
    const { fork, session } = await createFork();
    const { aptMap, classMap } = await getSeedCtx();
    const elara = await findSeededCharacter("Elara Starweaver");
    await db.update(charactersInCharacter).set({ rulesetId: fork.id }).where(eq(charactersInCharacter.id, elara.id));
    const plan = levelUpPlan([{ abilityIncreases: [], classId: classMap.pc["Wizard"], hp: 1, level: 4 }]);
    const offered = async (search: string) => {
      const options = await getStepOptions(
        session,
        elara.id,
        "spells",
        plan,
        { pool: aptMap["Wizard Spells"] },
        {
          search,
        },
      );
      return options.items.map(({ name }) => name);
    };

    expect([await offered("Color Spray"), await offered("Chill Touch")]).toEqual([[], []]);
    await rename(session, fork.id, "aptitudes", aptMap["Wizard Spells"], "Sorts de magicien");

    // An evoker who prohibited Illusion and Necromancy: neither school's spells, an evocation still
    expect([await offered("Color Spray"), await offered("Chill Touch")]).toEqual([[], []]);
    expect(await offered("Shocking Grasp")).toEqual(["Shocking Grasp"]);
  });
});

describe("a class's own feature pool and spell list", () => {
  test("stay its own once the fork renames the class: its page finds them, and a new feature goes in its pool", async () => {
    const { fork, session } = await createFork();
    const { classMap } = await getSeedCtx();
    const rogue = classMap.pc["Rogue"];
    const pool = await findNamed(fork.id, "aptitudes", "Rogue Class Feature");
    await rename(session, fork.id, "classes", rogue, "Roublard");

    const progression = (await EntitiesService.getProgression(session, fork.id, "classes", rogue)) as {
      offeredPools: PoolRef[];
      ownFeaturePool: PoolRef & { featureName: string };
    };
    expect(progression.ownFeaturePool).toEqual({
      featureName: "{name} (Roublard)",
      id: pool.id,
      name: "Rogue Class Feature",
    });
    expect(progression.offeredPools.map(({ name }) => name)).not.toContain("Rogue Class Feature");

    await EntitiesService.createFeature(session, fork.id, "classes", rogue, "Ruse");
    const view = await viewOf(fork.id);
    expect(view.aptitudes.map(({ name }) => name)).not.toContain("Roublard Class Feature");
    const ruse = view.feats.find(({ name }) => name === "Ruse (Roublard)")!;
    expect(view.listLinksOf(ruse.id).map(({ toId }) => toId)).toEqual([pool.id]);
  });

  test("a renamed wizard's spell list is still the wizard's own", async () => {
    const { fork, session } = await createFork();
    const { aptMap, classMap } = await getSeedCtx();
    await rename(session, fork.id, "classes", classMap.pc["Wizard"], "Magicien");
    const progression = (await EntitiesService.getProgression(session, fork.id, "classes", classMap.pc["Wizard"])) as {
      ownSpellList: PoolRef;
    };
    expect(progression.ownSpellList).toEqual({ id: aptMap["Wizard Spells"], name: "Wizard Spells" });
  });
});

describe("a skill's subtypes and its family", () => {
  test("a homebrew Craft (Alchemy) stays a fighter's class skill once the fork translates Craft", async () => {
    const { fork, session } = await createFork();
    const { skillMap } = await getSeedCtx();
    const alchemy = await createSkill(session, fork.id, "Craft (Alchemy)");
    const fighter = await createFighter(fork.id, { skills: { [alchemy.id]: 4 } });
    expect((await skillsOf(fighter.id))["craftalchemy"]).toMatchObject({ innate: true, rank: 4 });

    await rename(session, fork.id, "skills", skillMap["Craft"], "Artisanat");
    expect((await skillsOf(fighter.id))["craftalchemy"]).toMatchObject({ innate: true, rank: 4 });
  });

  test("a rule on the Knowledge skills keeps reaching them once the fork translates them", async () => {
    const { fork, session } = await createFork();
    const lore = await createFeat(session, fork.id, "Keeper of Lore");
    const modifier = { operator: "add", target: "skills.knowledge.misc", value: "2" };
    await ModifiersService.createModifier(session, fork.id, "feats", lore.id, modifier);
    const sage = await createFighter(fork.id, { feats: [lore.id] });
    expect((await skillsOf(sage.id))["knowledgearcana"].misc).toBe(2);

    for (const skill of (await viewOf(fork.id)).skills.filter(({ name }) => name.startsWith("Knowledge (")))
      await rename(session, fork.id, "skills", skill.id, skill.name.replace("Knowledge", "Connaissances"));

    const skills = await skillsOf(sage.id);
    expect([skills["connaissancesarcana"].misc, skills["connaissancesreligion"].misc]).toEqual([2, 2]);
  });

  test("a homebrew skill whose name starts as Spot's is no Spot: Alertness gives it nothing", async () => {
    const { fork, session } = await createFork();
    const { featMap } = await getSeedCtx();
    await createSkill(session, fork.id, "Spotlight Operation");
    const watcher = await createFighter(fork.id, { feats: [featMap["Alertness"]] });
    const skills = await skillsOf(watcher.id);
    expect([skills["spot"].misc, skills["spotlightoperation"].misc]).toEqual([2, 0]);
  });
});

describe("skills a fork names in another script", () => {
  test("keep their own rows, totals and rules: Athletic's bonus still lands on the renamed Climb", async () => {
    const { fork, session } = await createFork();
    const { featMap, skillMap } = await getSeedCtx();
    const points = { [skillMap["Climb"]]: 4, [skillMap["Swim"]]: 2, [skillMap["Jump"]]: 1 };
    const athlete = await createFighter(fork.id, { feats: [featMap["Athletic"]], skills: points });
    const before = await skillsOf(athlete.id);

    const renamed = { Climb: "Лазание", Jump: "Прыжок", Swim: "Плавание" } as const;
    for (const [name, translated] of Object.entries(renamed))
      await rename(session, fork.id, "skills", skillMap[name], translated);

    const after = await skillsOf(athlete.id);
    const totals = (skills: typeof after, keys: string[]) => keys.map((key) => [skills[key].rank, skills[key].total]);
    expect(totals(after, ["лазание", "плавание", "прыжок"])).toEqual(totals(before, ["climb", "swim", "jump"]));
    expect([after["лазание"].misc, after["плавание"].misc, after["прыжок"].misc]).toEqual([2, 2, 0]);
  });

  test("a formula and a requirement read a path in another script by its text", async () => {
    const { fork, session } = await createFork();
    const { aptMap, classMap, skillMap } = await getSeedCtx();
    await rename(session, fork.id, "skills", skillMap["Climb"], "Лазание");
    const dodge = await createFeat(session, fork.id, "Уклонение");
    const gated = await createFeat(session, fork.id, "Порог", ["General", "Fighter Bonus Feat"]);
    // The swim bonus reads the climb ranks; the gated feat asks for the dodge
    const formula = { operator: "add", target: "skills.swim.misc", value: "{{ [skills.лазание.rank] }}" };
    await ModifiersService.createModifier(session, fork.id, "feats", dodge.id, formula);
    const requirement = { level: "1", operator: "equal", target: "feats.уклонение.possessed", value: "true" };
    await RequirementsService.createRequirement(session, fork.id, "feats", gated.id, requirement);

    const holder = await createFighter(fork.id, { feats: [dodge.id], skills: { [skillMap["Climb"]]: 4 } });
    expect((await skillsOf(holder.id))["swim"].misc).toBe(4);
    const takeGated = async (characterId: string) => {
      const fighter = { abilityIncreases: increasesOf(null), classId: classMap.pc["Fighter"], hp: 5, level: 2 };
      const plan = levelUpPlan([fighter], { feats: { [aptMap["Fighter Bonus Feat"]]: [gated.id] } });
      return await CharacterAdvancementsService.addAdvancements(session, characterId, plan, false).then(
        () => "saved",
        (error: Error) => error.message,
      );
    };
    const stranger = await createFighter(fork.id);
    expect(await takeGated(stranger.id)).toContain("Порог");
    expect(await takeGated(holder.id)).not.toContain("Порог");
  });
});
