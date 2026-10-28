import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_SCOUNDREL_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import type { Aptitude, Feat, Klass } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Entities, EntityLinks, EntitySnapshots, fetchEveryPage } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { pickFeat } from "@/tests/support/dnd3.5/levels.ts";
import { findLists } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { writeFieldValues } from "@/tests/support/ownerValues.ts";
import {
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
  ownerSessionOf,
  subscribeTestRuleset,
} from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { CLASS_HD, CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS, FEAT_FAMILY } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The aptitudes of the test's ruleset. */
const APTITUDES = ["Combat", "Metamagic", "General"];

/**
 * A ruleset's feats page grouped by family, as its query asks for it (`where`: its pool, its search): every row, and
 * each family's row's feats as it opens to them, through the same route with the family.
 */
async function featGroupsOf(rulesetId: string, where: { listedIn?: string; search?: string }) {
  const session = await ownerSessionOf(rulesetId);
  const rows = await fetchEveryPage((page) =>
    EntitiesService.getEntityGroups(session, rulesetId, "feats", where, page),
  );
  const opened = new Map<string, { id: string; name: string }[]>();
  for (const { count, group } of rows) {
    if (group === null || count < 2) continue;
    const family = { ...where, family: group };
    opened.set(
      group,
      await fetchEveryPage((page) => EntitiesService.getEntityGroups(session, rulesetId, "feats", family, page)),
    );
  }
  return { opened, rows };
}

async function linkedAptitudeIds(featId: string) {
  return (await findLists(db, [featId])).map((link) => link.toId).sort();
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: feats", () => {
  describe("aptitudes", () => {
    test("links a feat to its aptitudes; an update replaces them, keeps them when it omits them, and can clear them", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [combat, metamagic, general],
      } = await createTestUserAndRuleset(APTITUDES);
      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Power Attack",
        links: { listedIn: [{ toId: combat }, { toId: metamagic }] },
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([combat, metamagic].sort());

      await EntitiesService.updateEntity(session, ruleset.id, "feats", feat.id, {
        name: "Power Attack",
        links: { listedIn: [{ toId: general }] },
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([general]);

      await EntitiesService.updateEntity(session, ruleset.id, "feats", feat.id, {
        name: "Power Attack",
        description: "Renamed only",
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([general]);

      await EntitiesService.updateEntity(session, ruleset.id, "feats", feat.id, {
        name: "Power Attack",
        links: { listedIn: [] },
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([]);
    });

    test("an edit answers an aptitude its fork copied after the feat was listed in it as the copy, as its page does", async () => {
      const {
        user,
        session,
        ruleset: parent,
        aptitudeIds: [combat],
      } = await createTestUserAndRuleset(APTITUDES);
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      const feat = await EntitiesService.createEntity(session, fork.id, "feats", {
        name: "Cleave",
        links: { listedIn: [{ toId: combat }] },
      });
      const copy = await EntitiesService.updateEntity(session, fork.id, "aptitudes", combat, { name: "Melee" });

      // Its stored list is the original, which its view reads as the fork's copy
      const edited = await EntitiesService.updateEntity(session, fork.id, "feats", feat.id, {
        name: "Cleave",
        description: "Renamed list",
      });
      expect(edited.links).toEqual([expect.objectContaining({ role: "listedIn", toId: copy.id, toName: "Melee" })]);
      expect(edited.links).toEqual((await EntitiesService.getEntity(session, fork.id, "feats", feat.id)).links);
    });

    test("an edit in a fork of a fork answers the copy of the aptitude that stands for it there, or none once it's deleted, as its page does", async () => {
      const {
        user,
        session,
        ruleset: base,
        aptitudeIds: [combat],
      } = await createTestUserAndRuleset(APTITUDES);
      const middle = await createTestRuleset(user.id, { rulesetId: base.id, ancestorRulesetIds: [base.id] });
      const leaf = await createTestRuleset(user.id, { rulesetId: middle.id, ancestorRulesetIds: [middle.id, base.id] });
      const feat = await EntitiesService.createEntity(session, leaf.id, "feats", {
        name: "Cleave",
        links: { listedIn: [{ toId: combat }] },
      });
      const editedLinks = async () => {
        const edited = await EntitiesService.updateEntity(session, leaf.id, "feats", feat.id, { name: "Cleave" });
        expect(edited.links).toEqual((await EntitiesService.getEntity(session, leaf.id, "feats", feat.id)).links);
        return edited.links;
      };

      const middleCopy = await EntitiesService.updateEntity(session, middle.id, "aptitudes", combat, {
        name: "Middle",
      });
      expect(await editedLinks()).toEqual([expect.objectContaining({ toId: middleCopy.id, toName: "Middle" })]);
      const leafCopy = await EntitiesService.updateEntity(session, leaf.id, "aptitudes", combat, { name: "Leaf" });
      expect(await editedLinks()).toEqual([expect.objectContaining({ toId: leafCopy.id, toName: "Leaf" })]);
      await EntitiesService.deleteEntity(session, leaf.id, "aptitudes", leafCopy.id);
      expect(await editedLinks()).toEqual([]);
    });

    test("refuses a new feat without an aptitude", async () => {
      const { session, ruleset } = await createTestUserAndRuleset(APTITUDES);
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "feats", { name: "Orphan Feat", links: { listedIn: [] } }),
        400,
      );
    });

    test("refuses an aptitude that spells already use", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [combat, spells],
      } = await createTestUserAndRuleset(APTITUDES);
      await EntitiesService.createEntity(session, ruleset.id, "spells", {
        name: "Magic Missile",
        links: { listedIn: [{ toId: spells }] },
      });
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "feats", {
          name: "Spell Feat",
          links: { listedIn: [{ toId: spells }] },
        }),
        409,
      );

      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Combat Feat",
        links: { listedIn: [{ toId: combat }] },
      });
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "feats", feat.id, {
          name: "Combat Feat",
          links: { listedIn: [{ toId: spells }] },
        }),
        409,
      );
    });

    test("counts the spells its own ruleset's view links to an aptitude, not a sibling fork's", async () => {
      const { user: author } = await createTestUser();
      const base = await createTestRuleset(author.id, { status: "Published" });
      const [list] = await Entities.create<Aptitude>(db, "aptitudes", { name: "Shared List", rulesetId: base.id });
      const forkOf = async () => {
        const { user, session } = await createTestUser();
        const fork = await createTestRuleset(user.id, { rulesetId: base.id, ancestorRulesetIds: [base.id] });
        return { session, fork };
      };
      const [spellFork, featFork] = [await forkOf(), await forkOf()];
      await EntitiesService.createEntity(spellFork.session, spellFork.fork.id, "spells", {
        name: "Spark",
        links: { listedIn: [{ toId: list.id }] },
      });

      const feat = await EntitiesService.createEntity(featFork.session, featFork.fork.id, "feats", {
        name: "Listed Feat",
        links: { listedIn: [{ toId: list.id }] },
      });
      expect(feat).toMatchObject({ name: "Listed Feat" });
    });
  });

  test("groups a family's variants into one row, filtered by aptitude", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [combat, general],
    } = await createTestUserAndRuleset(APTITUDES);
    for (const name of ["Focus: Axe", "Focus: Sword"]) {
      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name,
        links: { listedIn: [{ toId: combat }] },
      });
      await writeFieldValues("feats", feat.id, [[FEAT_FAMILY, "Focus"]]);
    }
    await EntitiesService.createEntity(session, ruleset.id, "feats", {
      name: "Cleave",
      links: { listedIn: [{ toId: combat }] },
    });
    await EntitiesService.createEntity(session, ruleset.id, "feats", {
      name: "Alertness",
      links: { listedIn: [{ toId: general }] },
    });

    const grouped = await EntitiesService.getEntityGroups(
      await ownerSessionOf(ruleset.id),
      ruleset.id,
      "feats",
      { listedIn: combat },
      { limit: 10, page: 1 },
    );
    expect(grouped.items.map((row) => ({ ...row, count: Number(row.count) }))).toMatchObject([
      { name: "Cleave", group: null, count: 1 },
      { name: "Focus", group: "Focus", count: 2 },
    ]);
  });

  describe("the page's families", () => {
    test("count a family's row as the feats it opens to, in a pool and for a search only their texts hold", async () => {
      const ruleset = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
      const session = await ownerSessionOf(ruleset.id);
      const general = (await getSeedCtx()).aptMap["General"];
      const pool = await fetchEveryPage((page) =>
        EntitiesService.getEntities(session, ruleset.id, "feats", { listedIn: general }, page),
      );
      const inPool = new Set(pool.map((feat) => feat.id));

      // In the General pool, Weapon Focus opens to its variants there: no Deity's Weapon Focus, no War Domain Weapon
      const pooled = await featGroupsOf(ruleset.id, { listedIn: general });
      expect([...pooled.opened.keys()]).toContain("Weapon Focus");
      for (const row of pooled.rows.filter((row) => pooled.opened.has(row.group!))) {
        const feats = pooled.opened.get(row.group!)!;
        expect({ family: row.group, count: feats.length }).toEqual({ family: row.group, count: row.count });
        expect(feats.filter((feat) => !inPool.has(feat.id) || !feat.name.startsWith(`${row.group}: `))).toEqual([]);
      }

      // "threat range" is in Improved Critical's texts, and in no feat's name
      const searched = await featGroupsOf(ruleset.id, { search: "threat range" });
      const improved = searched.rows.find((row) => row.group === "Improved Critical");
      expect(improved?.count).toBeGreaterThan(1);
      for (const row of searched.rows.filter((row) => searched.opened.has(row.group!)))
        expect(searched.opened.get(row.group!)!.length).toBe(row.count);
      expect(searched.opened.get("Improved Critical")!.map((feat) => feat.name)).toEqual(
        expect.arrayContaining(["Improved Critical: Longsword"]),
      );
    }, 60_000);

    test("list no feat in two groups: a family's are its variants alone", async () => {
      // War Domain Weapon: Longsword is of the Weapon Focus and Martial Weapon Proficiency families, and a variant of
      // neither
      const ruleset = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
      const { opened, rows } = await featGroupsOf(ruleset.id, {});
      const listed = rows.flatMap((row) => (opened.get(row.group!) ?? [row]).map((feat) => feat.id));
      expect(listed.length).toBe(new Set(listed).size);
      for (const [family, feats] of opened)
        expect(feats.filter((feat) => !feat.name.startsWith(`${family}: `))).toEqual([]);
      expect(rows.find((row) => row.name === "War Domain Weapon: Longsword")).toMatchObject({ count: 1 });
    }, 60_000);

    test("find a feat by its family as well as its name, so a family's search finds its every feat", async () => {
      // Complete Scoundrel's 20 luck feats, Good Karma and Tempting Fate among them, which no name says
      const scoundrel = await findSeededRuleset(DND35_COMPLETE_SCOUNDREL_NAME);
      const ruleset = await createSeededTestRuleset(SEED_USER_ID);
      await subscribeTestRuleset(ruleset.id, [scoundrel.id]);
      const where = { entityType: "feats", rulesetId: scoundrel.id, fields: { [FEAT_FAMILY]: "Luck" } };
      const luck = (await Entities.findList<Feat>(db, { ...where, order: "name" })).map((feat) => feat.name);
      expect(luck).toHaveLength(20);

      const { rows } = await featGroupsOf(ruleset.id, { search: "Luck" });
      expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(luck));
      const session = await ownerSessionOf(ruleset.id);
      const listed = await fetchEveryPage((page) =>
        EntitiesService.getEntities(session, ruleset.id, "feats", { search: "Luck" }, page),
      );
      expect(listed.map((feat) => feat.name)).toEqual(expect.arrayContaining(luck));
    }, 30_000);
  });

  test("deletes a feat's aptitude and class-level links with it", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [combat],
    } = await createTestUserAndRuleset(APTITUDES);
    const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
      name: "Doomed Feat",
      links: { listedIn: [{ toId: combat }] },
    });
    const [klass] = await Entities.create<Klass>(db, "classes", {
      name: "Granting Class",
      rulesetId: ruleset.id,
      fields: { [CLASS_HD]: 10 },
    });
    // Written past the services, after the feat's create read the ruleset's view
    RulesetViews.invalidate(ruleset.id);
    await EntitiesService.createOwnedEntity(session, ruleset.id, "classes", klass.id, {
      fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 2 },
      links: { grants: [{ toId: feat.id, viaId: combat }] },
      position: 1,
    });

    await EntitiesService.deleteEntity(session, ruleset.id, "feats", feat.id);

    expect(await linkedAptitudeIds(feat.id)).toEqual([]);
    // A grant's feat is its link's to-entity
    expect(await EntityLinks.findMany(db, { fromType: "class-levels", role: "grants", toIds: [feat.id] })).toEqual([]);
  });

  describe("deleting a feat characters picked", () => {
    test("is refused while a character of the ruleset has picked it, even an archived one", async () => {
      const {
        user,
        session,
        ruleset,
        aptitudeIds: [combat],
      } = await createTestUserAndRuleset(APTITUDES);
      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Picked Feat",
        links: { listedIn: [{ toId: combat }] },
      });
      const character = await pickFeat(user.id, ruleset.id, feat.id, combat);
      await expectRefusedWith(EntitiesService.deleteEntity(session, ruleset.id, "feats", feat.id), 409);

      // An archived character keeps its picks so unarchiving restores them.
      await Characters.archive(db, { id: character.id });
      await expectRefusedWith(EntitiesService.deleteEntity(session, ruleset.id, "feats", feat.id), 409);
    });

    test("is refused when a character of a fork picked it", async () => {
      const {
        user,
        session,
        ruleset: parent,
        aptitudeIds: [combat],
      } = await createTestUserAndRuleset(APTITUDES);
      const feat = await EntitiesService.createEntity(session, parent.id, "feats", {
        name: "Inherited Feat",
        links: { listedIn: [{ toId: combat }] },
      });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      await pickFeat(user.id, fork.id, feat.id, combat);
      await expectRefusedWith(EntitiesService.deleteEntity(session, parent.id, "feats", feat.id), 409);
    });

    test("is refused when a character of a ruleset using it as an extension picked it", async () => {
      const {
        user,
        session,
        ruleset: extension,
        aptitudeIds: [combat],
      } = await createTestUserAndRuleset(APTITUDES);
      const feat = await EntitiesService.createEntity(session, extension.id, "feats", {
        name: "Extension Feat",
        links: { listedIn: [{ toId: combat }] },
      });
      const host = await createTestRuleset(user.id, { extensionIds: [extension.id] });
      await pickFeat(user.id, host.id, feat.id, combat);
      await expectRefusedWith(EntitiesService.deleteEntity(session, extension.id, "feats", feat.id), 409);
    });

    test("is allowed when the ruleset's characters didn't pick it", async () => {
      const {
        user,
        session,
        ruleset,
        aptitudeIds: [combat],
      } = await createTestUserAndRuleset(APTITUDES);
      await createTestCharacter(user.id, { rulesetId: ruleset.id });
      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Unpicked Feat",
        links: { listedIn: [{ toId: combat }] },
      });
      expect(await EntitiesService.deleteEntity(session, ruleset.id, "feats", feat.id)).toMatchObject({ id: feat.id });
    });
  });

  test("points the fork's tombstone at a feat re-created under a deleted copy's name", async () => {
    // Regression: writes once rewrote the snapshot's source through the fork's
    // override map, leaving the tombstone pointing at the deleted copy.
    const {
      user,
      session,
      ruleset: parent,
      aptitudeIds: [combat],
    } = await createTestUserAndRuleset(APTITUDES);
    const source = await EntitiesService.createEntity(session, parent.id, "feats", {
      name: "Endurance",
      links: { listedIn: [{ toId: combat }] },
    });
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    const copy = await EntitiesService.updateEntity(session, fork.id, "feats", source.id, {
      name: "Endurance",
      description: "Edited in fork",
    });
    await EntitiesService.deleteEntity(session, fork.id, "feats", copy.id);
    const recreated = await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Endurance",
      links: { listedIn: [{ toId: combat }] },
    });

    const snapshots = await EntitySnapshots.findMany(db, { rulesetId: fork.id, entityType: "feats" });
    expect(snapshots).toMatchObject([{ sourceEntityId: source.id, forkedEntityId: recreated.id }]);
  });
});
