import { describe, expect, test } from "bun:test";

import type { Feat, Klass, KlassLevelSpell, Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, Joins } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";

/**
 * A join's rows that name the aptitude by a part of their links: as the list a feat or a spell is in (`to`), or the one
 * a grant is through (`via`).
 */
async function linksOf(join: string, part: "to" | "via", aptitudeId: string) {
  return await Joins.findMany(db, { join, ...(part === "to" ? { toIds: [aptitudeId] } : { viaIds: [aptitudeId] }) });
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
      aptitudeIds: [featAptitude.id],
    });
    await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Linked Spell",
      aptitudes: [{ id: spellAptitude.id }],
    });

    const [feat] = await Entities.create<Feat>(db, "feats", { name: "Granted Feat", rulesetId: ruleset.id });
    const [spell] = await Entities.create<Spell>(db, "spells", { name: "Granted Power", rulesetId: ruleset.id });
    const [klass] = await Entities.create<Klass>(db, "classes", {
      name: "Granting Class",
      rulesetId: ruleset.id,
      hd: 10,
    });
    const level = await EntitiesService.createOwnedEntity(session, ruleset.id, "classes", klass.id, {
      level: 1,
      fields: { bab: 1, skills: 2 },
      feats: [{ featId: feat.id, aptitudeId: featAptitude.id }],
    });
    await Joins.create<KlassLevelSpell>(db, "class_level_spells", {
      klassLevelId: level.id,
      spellId: spell.id,
      aptitudeId: spellAptitude.id,
    });

    await EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", featAptitude.id);
    await EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", spellAptitude.id);

    expect(await linksOf("feats_aptitudes", "to", featAptitude.id)).toEqual([]);
    expect(await linksOf("spells_aptitudes", "to", spellAptitude.id)).toEqual([]);
    expect(await linksOf("class_level_feats", "via", featAptitude.id)).toEqual([]);
    expect(await linksOf("class_level_spells", "via", spellAptitude.id)).toEqual([]);
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
      aptitudeIds: [featAptitude.id],
    });
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Picked Spell",
      aptitudes: [{ id: spellAptitude.id }],
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await addCharacterLevel(character.id, klassLevel.id, {
      feats: [{ featId: feat.id, aptitudeId: featAptitude.id }],
      spells: [{ spellId: spell.id, aptitudeId: spellAptitude.id }],
    });

    expect(EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", featAptitude.id)).rejects.toThrow(
      ConflictError,
    );
    expect(EntitiesService.deleteEntity(session, ruleset.id, "aptitudes", spellAptitude.id)).rejects.toThrow(
      ConflictError,
    );
  });
});
