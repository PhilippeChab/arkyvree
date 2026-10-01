import { abilitiesInRules } from "@/drizzle/schema.ts";
/**
 * Customizing an entity a fork inherits copies the entity into the fork and
 * changes the copy: the parent's rows never move.
 */
import { describe, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Feats, Klasses, KlassLevels, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestRuleset, createTestUser, insertRows } from "@/tests/helpers.ts";

const requirement = { valueType: "number", operator: "greater_than_or_equal" } as const;

/**
 * A published ruleset whose feat has a modifier (with a requirement of its
 * own), a property and a requirement, and whose class level has a modifier;
 * and another user's fork of it.
 */
async function setup() {
  const { user: owner } = await createTestUser();
  const { session } = await createTestUser();
  const parent = await createTestRuleset(owner.id, { private: false, status: "Published" });
  const rulesetId = parent.id;
  await insertRows(abilitiesInRules, ["Strength", "Dexterity"].map((name) => ({ name, description: name, rulesetId })));

  const [feat] = await Feats.create(db, { name: "Power Attack", description: "Parent feat", rulesetId });
  const [modifier] = await Modifiers.create(db, { sourceId: feat.id, sourceType: "feats", target: "abilities.strength.misc", value: "2", valueType: "number", operator: "add" });
  await Requirements.create(db, { ...requirement, entityId: modifier.id, entityType: "modifiers", level: "1", target: "abilities.strength.misc", value: "15" });
  await Properties.create(db, { entityId: feat.id, entityType: "feats", type: "tag", value: "combat" });
  await Requirements.create(db, { ...requirement, entityId: feat.id, entityType: "feats", level: "1", target: "abilities.strength.misc", value: "13" });

  const [klass] = await Klasses.create(db, { name: "Fighter", rulesetId, hd: 10 });
  const [level] = await KlassLevels.create(db, { klassId: klass.id, level: 1 });
  await Modifiers.create(db, { sourceId: level.id, sourceType: "klass_levels", target: "abilities.strength.misc", value: "1", valueType: "number", operator: "add" });

  const fork = await RulesetsMethods.forkRuleset(session, rulesetId, { name: "Fork", private: false });
  return { session, parent, fork, feat, klass, owners: { feats: feat.id, klass_levels: level.id, modifiers: modifier.id } };
}

type Row = { id: string };
type Written = Row & { resolvedEntityId: string };
type Kind = {
  rowsOf: (ownerType: string, ownerId: string) => Promise<Row[]>;
  list: (rulesetId: string, ownerType: string, ownerId: string) => Promise<Row[]>;
  create: (session: Session, rulesetId: string, ownerType: string, ownerId: string) => Promise<Written>;
  update: (session: Session, rulesetId: string, ownerType: string, ownerId: string, id: string) => Promise<Written>;
  remove: (session: Session, rulesetId: string, ownerType: string, ownerId: string, id: string) => Promise<Written>;
};

const dexterityBonus = { target: "abilities.dexterity.misc", value: "5", operator: "add" };
const dexterityAtLeast = { level: "2", target: "abilities.dexterity.misc", value: "10", operator: "greater_than_or_equal" };

const KINDS: Record<string, Kind> = {
  modifiers: {
    rowsOf: (sourceType, sourceId) => Modifiers.findManyBySource(db, { sourceIds: [sourceId], sourceType }),
    list: ModifiersMethods.getEntityModifiers,
    create: (s, rulesetId, type, ownerId) => ModifiersMethods.createEntityModifier(s, rulesetId, type, ownerId, dexterityBonus),
    update: (s, rulesetId, type, ownerId, id) => ModifiersMethods.updateEntityModifier(s, rulesetId, type, ownerId, id, dexterityBonus),
    remove: ModifiersMethods.deleteEntityModifier,
  },
  properties: {
    rowsOf: (entityType, entityId) => Properties.findManyByEntity(db, { entityIds: [entityId], entityType }),
    list: PropertiesMethods.getEntityProperties,
    create: (s, rulesetId, type, ownerId) => PropertiesMethods.createEntityProperty(s, rulesetId, type, ownerId, { type: "tag", value: "fork" }),
    update: (s, rulesetId, type, ownerId, id) => PropertiesMethods.updateEntityProperty(s, rulesetId, type, ownerId, id, { type: "tag", value: "changed" }),
    remove: PropertiesMethods.deleteEntityProperty,
  },
  requirements: {
    rowsOf: (entityType, entityId) => Requirements.findManyByEntity(db, { entityIds: [entityId], entityType }),
    list: RequirementsMethods.getEntityRequirements,
    create: (s, rulesetId, type, ownerId) => RequirementsMethods.createEntityRequirement(s, rulesetId, type, ownerId, dexterityAtLeast),
    update: (s, rulesetId, type, ownerId, id) => RequirementsMethods.updateEntityRequirement(s, rulesetId, type, ownerId, id, { ...dexterityAtLeast, level: "1" }),
    remove: RequirementsMethods.deleteEntityRequirement,
  },
};

// A class level is copied with its whole class, and a modifier with the entity it modifies.
const CASES = [["feats", "modifiers"], ["feats", "properties"], ["feats", "requirements"], ["klass_levels", "modifiers"], ["modifiers", "requirements"]] as const;

describe.each(CASES)("an inherited %s's %s", (ownerType, kindName) => {
  const kind = KINDS[kindName];

  /** `setup()`, with the parent's rows of this kind before the fork touches them. */
  async function setupCase() {
    const context = await setup();
    const ownerId = context.owners[ownerType];
    return { ...context, ownerId, parentRows: await kind.rowsOf(ownerType, ownerId) };
  }

  test("get a new one on the fork's copy of the entity", async () => {
    const { session, fork, feat, klass, ownerId, parentRows } = await setupCase();
    const created = await kind.create(session, fork.id, ownerType, ownerId);

    expect(created.resolvedEntityId).not.toBe(ownerId);
    expect((await kind.rowsOf(ownerType, created.resolvedEntityId)).map((r) => r.id)).toContain(created.id);
    const copied = ownerType === "klass_levels" ? { entityType: "klasses", sourceEntityId: klass.id } : { entityType: "feats", sourceEntityId: feat.id };
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id })).toMatchObject([copied]);
    expect(await kind.rowsOf(ownerType, ownerId)).toEqual(parentRows);
  });

  test("are edited on the fork's copy", async () => {
    const { session, fork, ownerId, parentRows } = await setupCase();
    const updated = await kind.update(session, fork.id, ownerType, ownerId, parentRows[0].id);
    expect(updated.resolvedEntityId).not.toBe(ownerId);
    expect(updated.id).not.toBe(parentRows[0].id);
    expect((await kind.rowsOf(ownerType, updated.resolvedEntityId)).map((r) => r.id)).toEqual([updated.id]);
    expect(await kind.rowsOf(ownerType, ownerId)).toEqual(parentRows);
  });

  test("are deleted from the fork's copy", async () => {
    const { session, fork, ownerId, parentRows } = await setupCase();
    const removed = await kind.remove(session, fork.id, ownerType, ownerId, parentRows[0].id);
    expect(removed.resolvedEntityId).not.toBe(ownerId);
    expect(await kind.rowsOf(ownerType, removed.resolvedEntityId)).toEqual([]);
    expect(await kind.rowsOf(ownerType, ownerId)).toEqual(parentRows);
  });
});

describe.each(["modifiers", "properties", "requirements"])("the %s of a feat the fork already copied", (kindName) => {
  const kind = KINDS[kindName];

  test("are read and written through the source feat's id", async () => {
    const { session, fork, feat } = await setup();
    const parentRows = await kind.rowsOf("feats", feat.id);
    // The URL keeps the source's id after an edit copied the feat.
    await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: feat.name, description: "Copied" });
    const copyId = (await EntitySnapshots.findBySourceAndRuleset(db, { sourceEntityId: feat.id, rulesetId: fork.id }))!.forkedEntityId;
    const [copied] = await kind.rowsOf("feats", copyId);

    expect((await kind.list(fork.id, "feats", feat.id)).map((r) => r.id)).toEqual([copied.id]);
    expect(await kind.update(session, fork.id, "feats", feat.id, copied.id)).toMatchObject({ id: copied.id, resolvedEntityId: copyId });
    const created = await kind.create(session, fork.id, "feats", feat.id);
    expect(created.resolvedEntityId).toBe(copyId);
    expect(await kind.remove(session, fork.id, "feats", feat.id, copied.id)).toMatchObject({ resolvedEntityId: copyId });

    expect((await kind.rowsOf("feats", copyId)).map((r) => r.id)).toEqual([created.id]);
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id })).toHaveLength(1);
    expect(await kind.rowsOf("feats", feat.id)).toEqual(parentRows);
  });
});

describe("customizing an inherited feat", () => {
  test("lists it among the fork's changes until it's reverted", async () => {
    const { session, fork, feat, owners } = await setup();
    const featChanges = async () => (await RulesetsMethods.getChanges(session, fork.id)).filter((c) => c.entityType === "feats");
    expect(await featChanges()).toEqual([]);

    await ModifiersMethods.updateEntityModifier(session, fork.id, "feats", feat.id, owners.modifiers, dexterityBonus);
    expect(await featChanges()).toMatchObject([{ status: "modified", sourceEntityId: feat.id }]);

    await RulesetsMethods.revertOverride(session, fork.id, "feats", feat.id);
    expect(await featChanges()).toEqual([]);
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id })).toEqual([]);
  });

  test("copies nothing when the ruleset owns the feat", async () => {
    const { user, session } = await createTestUser();
    const ruleset = await createTestRuleset(user.id);
    await insertRows(abilitiesInRules, ["Strength", "Dexterity"].map((name) => ({ name, description: name, rulesetId: ruleset.id })));
    const [feat] = await Feats.create(db, { name: "Owned Feat", rulesetId: ruleset.id });
    const modifier = await ModifiersMethods.createEntityModifier(session, ruleset.id, "feats", feat.id, dexterityBonus);

    expect(await ModifiersMethods.updateEntityModifier(session, ruleset.id, "feats", feat.id, modifier.id, { ...dexterityBonus, value: "3" }))
      .toMatchObject({ id: modifier.id, resolvedEntityId: feat.id });
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: ruleset.id })).toEqual([]);
  });
});
