import { describe, expect, test } from "bun:test";

import { eq, or } from "drizzle-orm";

import { entityLinksInRules } from "@/drizzle/schema.ts";
import type { Feat, Klass, Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { addGrants } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { CLASS_HD, CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * The links that name the aptitude: as the list a feat or a spell is in (their target), or the pool a grant is through
 * (their via).
 */
async function linksOf(aptitudeId: string) {
  return await db
    .select({ id: entityLinksInRules.id })
    .from(entityLinksInRules)
    .where(or(eq(entityLinksInRules.toId, aptitudeId), eq(entityLinksInRules.viaId, aptitudeId)));
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("EntitiesService: aptitudes", () => {
  test("stores an aptitude's description", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", {
      name: "Arcane Spells",
      description: "Wizard and sorcerer spells",
    });
    expect(created).toMatchObject({ name: "Arcane Spells", description: "Wizard and sorcerer spells" });
    const updated = await EntitiesService.updateEntity(session, ruleset.id, "aptitudes", created.id, {
      name: "Arcane Spells",
      description: "Updated",
    });
    expect(updated.description).toBe("Updated");
  });

  test("keeps General, which the general feats count toward: neither renamed nor deleted, still described", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [generalId],
    } = await createTestUserAndRuleset(["General"]);
    expect(
      EntitiesService.updateEntity(session, ruleset.id, "aptitudes", generalId, { name: "General Feats" }),
    ).rejects.toMatchObject({ refusal: "unprocessable" });
    expect(EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", generalId)).rejects.toMatchObject({
      refusal: "unprocessable",
    });
    const described = await EntitiesService.updateEntity(session, ruleset.id, "aptitudes", generalId, {
      name: "General",
      description: "Any feat",
    });
    expect(described.description).toBe("Any feat");
    // By its slug, which the engine and the target paths know it by: a new case is no change to them
    const recased = await EntitiesService.updateEntity(session, ruleset.id, "aptitudes", generalId, {
      name: "GENERAL",
    });
    expect(recased.name).toBe("GENERAL");
    expect(EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", generalId)).rejects.toMatchObject({
      refusal: "unprocessable",
    });
  });

  test("deletes the feat, spell and class-level links of a deleted aptitude", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const featAptitude = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", {
      name: "Feat Aptitude",
    });
    const spellAptitude = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", {
      name: "Spell Aptitude",
    });
    await EntitiesService.createEntity(session, ruleset.id, "feats", {
      name: "Linked Feat",
      links: { listedIn: [{ toId: featAptitude.id }] },
    });
    await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Linked Spell",
      links: { listedIn: [{ toId: spellAptitude.id }] },
    });

    const [feat] = await Entities.create<Feat>(db, "feats", { name: "Granted Feat", rulesetId: ruleset.id });
    const [spell] = await Entities.create<Spell>(db, "spells", { name: "Granted Power", rulesetId: ruleset.id });
    const [klass] = await Entities.create<Klass>(db, "classes", {
      name: "Granting Class",
      rulesetId: ruleset.id,
      fields: { [CLASS_HD]: 10 },
    });
    // Written past the services, after the creates read the ruleset's view
    RulesetViews.invalidate(ruleset.id);
    const level = await EntitiesService.createOwnedEntity(session, ruleset.id, "classes", klass.id, {
      fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 2 },
      links: { grants: [{ toId: feat.id, viaId: featAptitude.id }] },
      position: 1,
    });
    await addGrants(db, level.id, "spells", [{ toId: spell.id, viaId: spellAptitude.id }]);

    await EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", featAptitude.id);
    await EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", spellAptitude.id);

    expect(await linksOf(featAptitude.id)).toEqual([]);
    expect(await linksOf(spellAptitude.id)).toEqual([]);
  });

  test("refuses to delete an aptitude a character picked a feat or a spell through", async () => {
    const { user, session, ruleset } = await createTestUserAndRuleset();
    const featAptitude = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", {
      name: "Feat Aptitude",
    });
    const spellAptitude = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", {
      name: "Spell Aptitude",
    });
    const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
      name: "Picked Feat",
      links: { listedIn: [{ toId: featAptitude.id }] },
    });
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Picked Spell",
      links: { listedIn: [{ toId: spellAptitude.id }] },
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    const { classLevel } = await createTestClassLevel(ruleset.id);
    await addCharacterLevel(character.id, classLevel.id, {
      feats: { [featAptitude.id]: [feat.id] },
      spells: { [spellAptitude.id]: [spell.id] },
    });

    expect(EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", featAptitude.id)).rejects.toThrow(
      ConflictError,
    );
    expect(EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", spellAptitude.id)).rejects.toThrow(
      ConflictError,
    );
  });
});
