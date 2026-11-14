/**
 * What D&D 5th Edition's rules find by a name keeps working once a fork renames it, as a translation does: the Ability
 * Score Improvement pool a class's page offers, a class's own feature pool and spell list, and a language's type,
 * which a translation can't write as its own.
 */

import { describe, expect, test } from "bun:test";

import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { getDnd5SeedCtx } from "@/tests/support/dnd5/seed.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd5/fields/index.ts";

/** A pool or a list as a progression's answer names it. */
interface PoolRef {
  id: string | null;
  name: string;
}

const session = makeSession();

/** The seed user's private fork of the seeded core rules. */
async function createFork() {
  const { rulesetId } = await getDnd5SeedCtx();
  return await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
}

/** The view's entity of a kind by its name: refused when the view shows none. */
async function findNamed(forkId: string, type: string, name: string) {
  const entity = (await readView(forkId)).rows(type).find((row) => row.name === name);
  if (!entity) throw new Error(`No ${type} named ${name}`);
  return entity;
}

/** What a class's page reads of its pools and list, as its progression's answer gives them. */
async function readOwn(forkId: string, classId: string) {
  return (await EntitiesService.getProgression(session, forkId, "classes", classId)) as {
    featurePools: PoolRef[];
    offeredPools: PoolRef[];
    ownFeaturePool: PoolRef;
    ownSpellList: PoolRef;
  };
}

describe("a D&D 5th Edition class's pools", () => {
  test("its features are granted through Ability Score Improvement, whatever the fork calls it", async () => {
    const fork = await createFork();
    const monk = await findNamed(fork.id, "classes", "Monk");
    const improvement = await findNamed(fork.id, "aptitudes", "Ability Score Improvement");
    await EntitiesService.updateEntity(session, fork.id, "aptitudes", improvement.id, {
      name: "Amélioration de caractéristique",
    });
    expect((await readOwn(fork.id, monk.id)).featurePools.map(({ name }) => name)).toContain(
      "Amélioration de caractéristique",
    );
  });

  test("its own feature pool and spell list stay its own once the fork renames the class", async () => {
    const fork = await createFork();
    const rogue = await findNamed(fork.id, "classes", "Rogue");
    const wizard = await findNamed(fork.id, "classes", "Wizard");
    const pool = await findNamed(fork.id, "aptitudes", "Rogue Features");
    const list = await findNamed(fork.id, "aptitudes", "Wizard Spells");
    await EntitiesService.updateEntity(session, fork.id, "classes", rogue.id, { name: "Roublard" });
    await EntitiesService.updateEntity(session, fork.id, "classes", wizard.id, { name: "Magicien" });

    const rogues = await readOwn(fork.id, rogue.id);
    expect(rogues.ownFeaturePool).toMatchObject({ id: pool.id, name: "Rogue Features" });
    expect(rogues.offeredPools.map(({ name }) => name)).not.toContain("Rogue Features");
    expect((await readOwn(fork.id, wizard.id)).ownSpellList).toEqual({ id: list.id, name: "Wizard Spells" });
  });
});

describe("a D&D 5th Edition language's type", () => {
  test("is Standard or Rare: a translated one would make a rare language anyone's pick", async () => {
    const fork = await createFork();
    await expectRefusedWith(
      EntitiesService.createEntity(session, fork.id, "languages", {
        name: "Druidique",
        fields: { [LANGUAGE_TYPE]: "Rara" },
      }),
      400,
    );
    expect(
      await EntitiesService.createEntity(session, fork.id, "languages", {
        name: "Druidique",
        fields: { [LANGUAGE_TYPE]: "Rare" },
      }),
    ).toMatchObject({ fields: { [LANGUAGE_TYPE]: "Rare" } });
  });
});
