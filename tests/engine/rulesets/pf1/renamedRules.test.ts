/**
 * What Pathfinder's rules find by a name keeps working once a fork renames it, as a translation does: a class's own
 * feature pool and spell list, a language's type and a weapon's size, which a translation can't write as its own.
 */

import { describe, expect, test } from "bun:test";

import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { getPf1SeedCtx } from "@/tests/support/pf1/seed.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { ITEM_TYPE, LANGUAGE_TYPE, WEAPON_SIZE } from "@/vocabulary/pf1/fields/index.ts";

/** A pool or a list as a progression's answer names it. */
interface PoolRef {
  id: string | null;
  name: string;
}

const session = makeSession();

/** The seed user's private fork of the seeded core rules. */
async function createFork() {
  const { rulesetId } = await getPf1SeedCtx();
  return await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
}

/** The view's entity of a kind by its name: refused when the view shows none. */
async function findNamed(forkId: string, type: string, name: string) {
  const entity = (await readView(forkId)).rows(type).find((row) => row.name === name);
  if (!entity) throw new Error(`No ${type} named ${name}`);
  return entity;
}

/** What a class's page reads of its own pool and list, as its progression's answer gives them. */
async function readOwn(forkId: string, classId: string) {
  return (await EntitiesService.getProgression(session, forkId, "classes", classId)) as {
    offeredPools: PoolRef[];
    ownFeaturePool: PoolRef;
    ownSpellList: PoolRef;
  };
}

describe("a Pathfinder class's own feature pool and spell list", () => {
  test("stay its own once the fork renames the class", async () => {
    const fork = await createFork();
    const rogue = await findNamed(fork.id, "classes", "Rogue");
    const wizard = await findNamed(fork.id, "classes", "Wizard");
    const pool = await findNamed(fork.id, "aptitudes", "Rogue Class Feature");
    const list = await findNamed(fork.id, "aptitudes", "Wizard Spells");
    await EntitiesService.updateEntity(session, fork.id, "classes", rogue.id, { name: "Roublard" });
    await EntitiesService.updateEntity(session, fork.id, "classes", wizard.id, { name: "Magicien" });

    const rogues = await readOwn(fork.id, rogue.id);
    expect(rogues.ownFeaturePool).toMatchObject({ id: pool.id, name: "Rogue Class Feature" });
    expect(rogues.offeredPools.map(({ name }) => name)).not.toContain("Rogue Class Feature");
    expect((await readOwn(fork.id, wizard.id)).ownSpellList).toEqual({ id: list.id, name: "Wizard Spells" });
  });
});

describe("a Pathfinder ruleset's words the rules read", () => {
  test("a language's type and a weapon's size come from their lists alone", async () => {
    const fork = await createFork();
    await expectRefusedWith(
      EntitiesService.createEntity(session, fork.id, "languages", {
        name: "Druidique",
        fields: { [LANGUAGE_TYPE]: "Secrète" },
      }),
      400,
    );
    await expectRefusedWith(
      EntitiesService.createEntity(session, fork.id, "items", {
        name: "Espadon",
        fields: { [ITEM_TYPE]: "Weapon", [WEAPON_SIZE]: "Grande" },
      }),
      400,
    );
    expect(
      await EntitiesService.createEntity(session, fork.id, "languages", {
        name: "Druidique",
        fields: { [LANGUAGE_TYPE]: "Secret" },
      }),
    ).toMatchObject({ fields: { [LANGUAGE_TYPE]: "Secret" } });
  });
});
