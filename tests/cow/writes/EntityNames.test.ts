/**
 * Names kept within a partition (what a race or a class is for), as the name index keeps them, in every base rules
 * the seeds hold: a familiar's race and an animal companion's of one name are two, which a fork deletes, renames and
 * restores, and a book renames, one without the other.
 */

import { describe, expect, test } from "bun:test";

import { Engine, type RulesetData } from "@/engine/index.ts";
import { EntityNames, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { editRuleset, readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** Entities of a kind the view shows under one name, each in a partition of its own. */
interface Namesakes {
  ids: string[];
  name: string;
  partitions: string[];
  type: RulesetEntityType;
}

/** Each group of entities of a kind the view (`view`, of `baseRules`) shows under one name, in partitions apart. */
function findNamesakes(baseRules: BaseRules, view: RulesetData): Namesakes[] {
  return Engine.forRules(baseRules)
    .storage()
    .standaloneKinds()
    .flatMap((type) =>
      [...Map.groupBy(view.rows(type), (row) => row.name)].flatMap(([name, rows]) =>
        rows.length > 1
          ? [{ ids: rows.map((row) => row.id), name, partitions: rows.map((row) => row.partition), type }]
          : [],
      ),
    );
}

/** How many entities of a kind a ruleset's view shows under a name. */
async function countNamed(rulesetId: string, type: RulesetEntityType, name: string) {
  return (await readView(rulesetId)).rows(type).filter((row) => row.name === name).length;
}

/** The seeded system bases, one per base rules. */
async function findBases() {
  return (await Rulesets.findMany(db, { system: true })).filter(
    (ruleset) => ruleset.rulesetId === null && ruleset.kind === "ruleset",
  );
}

/** A fork of a base, of a new user's, with its namesakes. */
async function forkBase(base: { baseRules: BaseRules; id: string }) {
  const { session } = await createTestUser();
  const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
  return { fork, namesakes: findNamesakes(base.baseRules, await readView(fork.id)), session };
}

describe("two entities of one name in partitions of their own", () => {
  test("are seeded in the base rules that have them, never two in one partition", async () => {
    let pairs = 0;
    for (const base of await findBases()) {
      const { namesakes } = await forkBase(base);
      for (const { name, partitions } of namesakes)
        expect({ name, partitions: new Set(partitions).size }).toEqual({ name, partitions: partitions.length });
      if (namesakes.length > 0) pairs++;
    }
    expect(pairs).toBeGreaterThanOrEqual(2);
  });

  test("a fork deletes one, then restores it, in every base rules", async () => {
    for (const base of await findBases()) {
      const { fork, namesakes, session } = await forkBase(base);
      for (const { ids, name, type } of namesakes.slice(0, 2)) {
        await EntitiesService.deleteEntity(session, fork.id, type, ids[0]);
        expect(await countNamed(fork.id, type, name)).toBe(ids.length - 1);

        await RulesetChangesService.revertOverride(session, fork.id, type, ids[0]);

        expect({ rules: base.baseRules, name, count: await countNamed(fork.id, type, name) }).toEqual({
          rules: base.baseRules,
          name,
          count: ids.length,
        });
      }
      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
    }
  });

  test("a fork renames one, then restores it, in every base rules", async () => {
    for (const base of await findBases()) {
      const { fork, namesakes, session } = await forkBase(base);
      for (const { ids, name, type } of namesakes.slice(0, 2)) {
        await EntitiesService.updateEntity(session, fork.id, type, ids[0], { name: `${name} (Renamed)` });
        expect(await countNamed(fork.id, type, name)).toBe(ids.length - 1);

        await RulesetChangesService.revertOverride(session, fork.id, type, ids[0]);

        expect({ rules: base.baseRules, name, count: await countNamed(fork.id, type, name) }).toEqual({
          rules: base.baseRules,
          name,
          count: ids.length,
        });
      }
      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
    }
  });

  test("a name stays one entity's in its partition: a rename to it there is refused, one in another taken", async () => {
    for (const base of await findBases()) {
      const { fork, namesakes, session } = await forkBase(base);
      const [namesake] = namesakes;
      if (!namesake) continue;
      const { name, partitions, type } = namesake;
      const others = (await readView(fork.id)).rows(type).filter((row) => row.name !== name);
      const sameKind = others.find((row) => row.partition === partitions[0])!;
      const otherKind = others.find((row) => !partitions.includes(row.partition));

      expect(EntitiesService.updateEntity(session, fork.id, type, sameKind.id, { name })).rejects.toEqual(
        new ConflictError(`Name already exists in the source chain (an ancestor or subscribed extension): ${name}`),
      );
      // A new entity takes its kind's own partition, where no other has the name
      if (!partitions.includes(Engine.forRules(base.baseRules).storage().partitionOf(type))) {
        const names = await editRuleset(EntityNames, fork);
        expect(await names.assertNameAvailable(db, type, name)).toEqual({ tombstoneAncestorId: null });
      }
      if (otherKind) {
        await EntitiesService.updateEntity(session, fork.id, type, otherKind.id, { name });
        expect(await countNamed(fork.id, type, name)).toBe(partitions.length + 1);
      }
    }
  });

  test("a book renames one, and its subscriber unsubscribes, and the book restores it, in every base rules", async () => {
    for (const base of await findBases()) {
      const book = await forkBase(base);
      const [namesake] = book.namesakes;
      if (!namesake) continue;
      const { ids, name, type } = namesake;
      await Rulesets.update(db, { kind: "extension", status: "Published", private: false }, { id: book.fork.id });
      RulesetViews.invalidate(book.fork.id);
      const host = await forkBase(base);
      await RulesetExtensionsService.subscribeExtension(host.session, host.fork.id, [book.fork.id]);

      await EntitiesService.updateEntity(book.session, book.fork.id, type, ids[0], { name: `${name} (Renamed)` });
      expect(await countNamed(host.fork.id, type, name)).toBe(ids.length - 1);

      await RulesetExtensionsService.unsubscribeExtension(host.session, host.fork.id, book.fork.id);
      expect(await countNamed(host.fork.id, type, name)).toBe(ids.length);
      await RulesetChangesService.revertOverride(book.session, book.fork.id, type, ids[0]);
      expect({ rules: base.baseRules, name, count: await countNamed(book.fork.id, type, name) }).toEqual({
        rules: base.baseRules,
        name,
        count: ids.length,
      });
    }
  });

  test("a kind a path names by its name alone keeps a name one entity's across its partitions, in every base rules", async () => {
    let refused = 0;
    for (const base of await findBases()) {
      const { fork, session } = await forkBase(base);
      const pathNamed = Engine.rules().pathNamedKindsOf(base.baseRules);
      expect({
        rules: base.baseRules,
        classes: pathNamed.includes("classes"),
        races: pathNamed.includes("races"),
      }).toEqual({ rules: base.baseRules, classes: true, races: false });
      const classes = (await readView(fork.id)).rows("classes");
      const kind = Engine.forRules(base.baseRules).storage().partitionOf("classes");
      // A bonded creature's class (a familiar's), and a player's class of its own
      const bonded = classes.find((row) => row.partition !== kind);
      const own = classes.find((row) => row.partition === kind)!;
      if (!bonded) continue;
      const taken = new ConflictError(
        `Name already exists in the source chain (an ancestor or subscribed extension): ${bonded.name}`,
      );

      expect(EntitiesService.createEntity(session, fork.id, "classes", { name: bonded.name })).rejects.toEqual(taken);
      expect(EntitiesService.updateEntity(session, fork.id, "classes", own.id, { name: bonded.name })).rejects.toEqual(
        taken,
      );
      refused++;
    }
    expect(refused).toBeGreaterThanOrEqual(2);
  });
});
