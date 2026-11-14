/**
 * A first edit's copy of an inherited entity, in every base rules the seeds hold: it holds what the view showed, a link
 * to an entity the fork or its book deleted since left out, as the view leaves it out.
 */

import { describe, expect, test } from "bun:test";

import { Engine, RulesError, type RulesetData } from "@/engine/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/**
 * A first edit of a class (`run`, of `classId` in `forkId`), named, which a class takes when `takes` says (any, without
 * it).
 */
interface FirstEdit {
  name: string;
  run: (session: Session, forkId: string, classId: string) => Promise<unknown>;
  takes?: (view: RulesetData, classId: string) => boolean;
}

/** A class that names an entity (a feat one of its levels grants, a skill it has), with the entity it names. */
interface Granting {
  classId: string;
  grantedId: string;
}

/** The most levels a base class has: a prestige class has fewer, and takes one past its last. */
const MOST_LEVELS = 20;

/** The kinds a class names, each whether its levels name it (a granted feat) or the class itself (a class skill). */
const NAMED_KINDS: readonly (readonly [RulesetEntityType, boolean])[] = [
  ["feats", true],
  ["skills", false],
];

/**
 * The classes of a view (`view`, of `baseRules`) whose levels link to an entity of `grantedType` (a granted feat, a
 * class skill: `fromLevels` false reads the class's own links), each with one it links to.
 */
function findGrantings(baseRules: BaseRules, view: RulesetData, grantedType: string, fromLevels: boolean): Granting[] {
  const ownedTypes = Engine.forRules(baseRules).storage().ownedKinds("classes");
  return view.rows("classes").flatMap((klass) => {
    const holders = fromLevels
      ? ownedTypes.flatMap((type) => view.rows(type).filter((level) => level.ownerId === klass.id))
      : [klass];
    const linked = holders.flatMap((holder) => view.nameLinks(view.linksOf(holder.id, undefined, grantedType)));
    return linked.length > 0 ? [{ classId: klass.id, grantedId: linked[0].toId }] : [];
  });
}

/**
 * The classes of a view (`view`, of `baseRules`) whose levels grant through a pool (a class's features' pool), each
 * with the pool it grants the most through, those that grant the most first.
 */
function findPools(baseRules: BaseRules, view: RulesetData): Granting[] {
  const ownedTypes = Engine.forRules(baseRules).storage().ownedKinds("classes");
  return view
    .rows("classes")
    .flatMap((klass) => {
      const levels = ownedTypes.flatMap((type) => view.rows(type).filter((level) => level.ownerId === klass.id));
      const pools = Map.groupBy(
        levels.flatMap((level) => view.linksOf(level.id).flatMap((link) => link.viaId ?? [])),
        (viaId) => viaId,
      );
      const [most] = [...pools].toSorted(([, a], [, b]) => b.length - a.length);
      return most ? [{ classId: klass.id, grantedId: most[0], grants: most[1].length }] : [];
    })
    .toSorted((a, b) => b.grants - a.grants);
}

/**
 * What a view (`view`, of `baseRules`) shows of a class (`classId`, by its stored id): its links and each of its
 * levels', by the level's position, each by its role, its target's name and the pool it's taken through (its id, as
 * the view resolves it: a pool deleted since resolves to its deleted copy), sorted.
 */
function linksShown(baseRules: BaseRules, view: RulesetData, classId: string) {
  const klass = view.find("classes", classId)!;
  const ownedTypes = Engine.forRules(baseRules).storage().ownedKinds("classes");
  const levels = ownedTypes.flatMap((type) => view.rows(type).filter((level) => level.ownerId === klass.id));
  return [klass, ...levels]
    .flatMap((holder) =>
      view
        .nameLinks(view.linksOf(holder.id))
        .map((link) => `${holder.position ?? 0} ${link.role} ${link.toType} ${link.toName} ${link.viaId ?? ""}`),
    )
    .toSorted();
}

/**
 * Deletes, in a ruleset (`rulesetId`), the first of the entities of `type` the grantings name that its delete takes
 * (one the app generates may refuse it, a kind its rules keep refuses every one), answering its granting: none when
 * none is.
 */
async function deleteGranted(session: Session, rulesetId: string, type: RulesetEntityType, grantings: Granting[]) {
  for (const granting of grantings) {
    const deleted = await EntitiesService.deleteEntity(session, rulesetId, type, granting.grantedId).catch(() => null);
    if (deleted) return granting;
  }
  return undefined;
}

/** The seeded system bases, one per base rules. */
async function findBases() {
  return (await Rulesets.findMany(db, { system: true })).filter(
    (ruleset) => ruleset.rulesetId === null && ruleset.kind === "ruleset",
  );
}

/** A fork of a base, of a new user's. */
async function forkBase(baseId: string) {
  const { session } = await createTestUser();
  const fork = await RulesetsService.forkRuleset(session, baseId, { name: `Fork ${uniqueId()}`, private: false });
  return { fork, session };
}

describe("a first edit of a class that names an entity deleted since", () => {
  // A feat a level grants, and a skill the class has (where its rules link a class to its skills)
  test("saves the class as the view showed it, in every base rules", async () => {
    const bases = await findBases();
    expect(bases.length).toBeGreaterThanOrEqual(3);
    let saved = 0;
    for (const base of bases) {
      for (const [type, fromLevels] of NAMED_KINDS) {
        const { fork, session } = await forkBase(base.id);
        const grantings = findGrantings(base.baseRules, await readView(fork.id), type, fromLevels);
        const deleted = await deleteGranted(session, fork.id, type, grantings);
        if (!deleted) continue;
        const { classId, grantedId } = deleted;
        const shown = linksShown(base.baseRules, await readView(fork.id), classId);
        const klass = (await readView(fork.id)).find("classes", classId)!;

        await EntitiesService.updateEntity(session, fork.id, "classes", classId, { name: klass.name });

        const after = await readView(fork.id);
        expect({ rules: base.baseRules, type, gone: after.find(type, grantedId) }).toEqual({
          rules: base.baseRules,
          type,
          gone: undefined,
        });
        expect({ rules: base.baseRules, type, links: linksShown(base.baseRules, after, classId) }).toEqual({
          rules: base.baseRules,
          type,
          links: shown,
        });
        saved++;
      }
    }
    expect(saved).toBeGreaterThanOrEqual(5);
  });

  test("keeps every grant through a pool deleted since, in every base rules", async () => {
    const bases = await findBases();
    for (const base of bases) {
      const { fork, session } = await forkBase(base.id);
      const pools = findPools(base.baseRules, await readView(fork.id));
      const { classId } = (await deleteGranted(session, fork.id, "aptitudes", pools))!;
      const shown = linksShown(base.baseRules, await readView(fork.id), classId);
      const klass = (await readView(fork.id)).find("classes", classId)!;

      await EntitiesService.updateEntity(session, fork.id, "classes", classId, { name: klass.name });

      expect({ rules: base.baseRules, links: linksShown(base.baseRules, await readView(fork.id), classId) }).toEqual({
        rules: base.baseRules,
        links: shown,
      });
    }
  });

  test("grants a feat restored after the class's edit again, in every base rules", async () => {
    for (const base of await findBases()) {
      const { fork, session } = await forkBase(base.id);
      const before = await readView(fork.id);
      const grantings = findGrantings(base.baseRules, before, "feats", true);
      const { classId, grantedId } = (await deleteGranted(session, fork.id, "feats", grantings))!;
      const klass = before.find("classes", classId)!;
      await EntitiesService.updateEntity(session, fork.id, "classes", classId, { name: klass.name });

      await RulesetChangesService.revertOverride(session, fork.id, "feats", grantedId);

      expect({ rules: base.baseRules, links: linksShown(base.baseRules, await readView(fork.id), classId) }).toEqual({
        rules: base.baseRules,
        links: linksShown(base.baseRules, before, classId),
      });
    }
  });

  test("takes a modifier, a class skill and a level, in every base rules", async () => {
    const made = new Set<string>();
    for (const base of await findBases()) {
      const view = await readView((await forkBase(base.id)).fork.id);
      const [modifier] = view.modifiersById.values();
      const levelsOf = (shown: RulesetData, classId: string) =>
        Engine.forRules(base.baseRules)
          .storage()
          .ownedKinds("classes")
          .flatMap((type) => shown.rows(type).filter((level) => level.ownerId === shown.canonicalize(classId)));
      const edits: FirstEdit[] = [
        {
          name: "modifier",
          run: (session, forkId, classId) =>
            ModifiersService.createModifier(session, forkId, "classes", classId, {
              operator: modifier.operator,
              target: modifier.target,
              value: modifier.value,
            }),
        },
        // A skill the class doesn't have, of a class that has some
        {
          name: "class skill",
          takes: (shown, classId) => shown.linksOf(classId, undefined, "skills").length > 0,
          run: async (session, forkId, classId) => {
            const shown = await readView(forkId);
            const held = new Set(shown.linksOf(classId, undefined, "skills").map((link) => link.toId));
            const skill = shown.rows("skills").find((row) => !held.has(row.id))!;
            return await EntitiesService.addEntityLink(session, forkId, "classes", classId, skill.id);
          },
        },
        // The level after a class's last, of a class of fewer than the most levels (a prestige class)
        {
          name: "level",
          takes: (shown, classId) => levelsOf(shown, classId).length < MOST_LEVELS,
          run: async (session, forkId, classId) => {
            const positions = levelsOf(await readView(forkId), classId).map((level) => level.position ?? 0);
            return await EntitiesService.createOwnedEntity(session, forkId, "classes", classId, {
              position: Math.max(...positions) + 1,
            });
          },
        },
      ];

      for (const { name, run, takes } of edits) {
        const { fork, session } = await forkBase(base.id);
        const shown = await readView(fork.id);
        const grantings = findGrantings(base.baseRules, shown, "feats", true).filter(
          ({ classId }) => takes?.(shown, classId) ?? true,
        );
        const deleted = await deleteGranted(session, fork.id, "feats", grantings);
        if (!deleted) continue;
        const { classId } = deleted;
        const refused = await run(session, fork.id, classId).then(
          () => undefined,
          (error: unknown) => error,
        );
        // A kind of edit the rules don't take (5e's classes edit no skills) is theirs to refuse, not the copy's
        if (refused instanceof RulesError && refused.refusal === "not-found") continue;
        expect({ rules: base.baseRules, name, refused }).toEqual({ rules: base.baseRules, name, refused: undefined });
        made.add(name);
      }
    }
    expect([...made].toSorted()).toEqual(["class skill", "level", "modifier"]);
  });

  test("saves a subscriber's class whose level grants an entity its book deleted, in every base rules", async () => {
    for (const base of await findBases()) {
      const book = await forkBase(base.id);
      await Rulesets.update(db, { kind: "extension", status: "Published", private: false }, { id: book.fork.id });
      RulesetViews.invalidate(book.fork.id);
      const host = await forkBase(base.id);
      await RulesetExtensionsService.subscribeExtension(host.session, host.fork.id, [book.fork.id]);

      const grantings = findGrantings(base.baseRules, await readView(book.fork.id), "feats", true);
      const { classId, grantedId } = (await deleteGranted(book.session, book.fork.id, "feats", grantings))!;
      const shown = linksShown(base.baseRules, await readView(host.fork.id), classId);
      const klass = (await readView(host.fork.id)).find("classes", classId)!;

      await EntitiesService.updateEntity(host.session, host.fork.id, "classes", classId, { name: klass.name });

      const after = await readView(host.fork.id);
      expect({ rules: base.baseRules, gone: after.find("feats", grantedId) }).toEqual({
        rules: base.baseRules,
        gone: undefined,
      });
      expect({ rules: base.baseRules, links: linksShown(base.baseRules, after, classId) }).toEqual({
        rules: base.baseRules,
        links: shown,
      });
    }
  });
});
