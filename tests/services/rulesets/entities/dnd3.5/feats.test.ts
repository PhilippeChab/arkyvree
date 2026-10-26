import { describe, expect, test } from "bun:test";

import type { Aptitude, Klass } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Entities, EntityLinks, EntitySnapshots } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { pickFeat } from "@/tests/support/dnd3.5/levels.ts";
import { findLists } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { writeFieldValues } from "@/tests/support/ownerValues.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { CLASS_HD, CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS, FEAT_FAMILY } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The aptitudes of the test's ruleset. */
const APTITUDES = ["Combat", "Metamagic", "General"];

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
      ruleset.id,
      "feats",
      { listedIn: combat },
      { limit: 10, page: 1 },
    );
    expect(grouped.items.map((row) => ({ ...row, variantCount: Number(row.variantCount) }))).toMatchObject([
      { displayName: "Cleave", group: null, variantCount: 1 },
      { displayName: "Focus", group: "Focus", variantCount: 2 },
    ]);
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
    expect(await EntityLinks.findMany(db, { fromType: "class_levels", role: "grants", toIds: [feat.id] })).toEqual([]);
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
      const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });
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
