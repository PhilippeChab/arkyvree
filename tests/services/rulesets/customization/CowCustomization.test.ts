/**
 * Customizing an entity a fork inherits copies the entity into the fork and changes the copy: the parent's rows never
 * move.
 */

import { describe, expect, test } from "bun:test";

import { abilitiesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  EntitySnapshots,
  Feats,
  Klasses,
  KlassLevels,
  Modifiers,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

type Row = { id: string };

type Written = Row & { resolvedEntityId: string };

type Kind = {
  rowsOf: (ownerType: string, ownerId: string) => Promise<Row[]>;
  list: (rulesetId: string, ownerType: string, ownerId: string) => Promise<Row[]>;
  create: (session: Session, rulesetId: string, ownerType: string, ownerId: string) => Promise<Written>;
  update: (session: Session, rulesetId: string, ownerType: string, ownerId: string, id: string) => Promise<Written>;
  remove: (session: Session, rulesetId: string, ownerType: string, ownerId: string, id: string) => Promise<Written>;
};

const requirement = { valueType: "number", operator: "greater_than_or_equal" } as const;

const dexterityBonus = { target: "abilities.dexterity.misc", value: "5", operator: "add" };
const dexterityAtLeast = {
  level: "2",
  target: "abilities.dexterity.misc",
  value: "10",
  operator: "greater_than_or_equal",
};

const KINDS: Record<string, Kind> = {
  modifiers: {
    rowsOf: (sourceType, sourceId) => Modifiers.findMany(db, { sourceIds: [sourceId], sourceType }),
    list: ModifiersService.getModifiers.bind(ModifiersService),
    create: (s, rulesetId, type, ownerId) =>
      ModifiersService.createModifier(s, rulesetId, type, ownerId, dexterityBonus),
    update: (s, rulesetId, type, ownerId, id) =>
      ModifiersService.updateModifier(s, rulesetId, type, ownerId, id, dexterityBonus),
    remove: ModifiersService.deleteModifier.bind(ModifiersService),
  },
  properties: {
    rowsOf: (entityType, entityId) => Properties.findMany(db, { entityIds: [entityId], entityType }),
    list: PropertiesService.getProperties.bind(PropertiesService),
    create: (s, rulesetId, type, ownerId) =>
      PropertiesService.createProperty(s, rulesetId, type, ownerId, { type: "tag", value: "fork" }),
    update: (s, rulesetId, type, ownerId, id) =>
      PropertiesService.updateProperty(s, rulesetId, type, ownerId, id, { type: "tag", value: "changed" }),
    remove: PropertiesService.deleteProperty.bind(PropertiesService),
  },
  requirements: {
    rowsOf: (entityType, entityId) => Requirements.findMany(db, { entityIds: [entityId], entityType }),
    list: RequirementsService.getRequirements.bind(RequirementsService),
    create: (s, rulesetId, type, ownerId) =>
      RequirementsService.createRequirement(s, rulesetId, type, ownerId, dexterityAtLeast),
    update: (s, rulesetId, type, ownerId, id) =>
      RequirementsService.updateRequirement(s, rulesetId, type, ownerId, id, { ...dexterityAtLeast, level: "1" }),
    remove: RequirementsService.deleteRequirement.bind(RequirementsService),
  },
};

/** A class level is copied with its whole class, and a modifier with the entity it modifies. */
const CASES = [
  ["feats", "modifiers"],
  ["feats", "properties"],
  ["feats", "requirements"],
  ["klasses", "modifiers"],
  ["klasses", "properties"],
  ["klasses", "requirements"],
  ["klass_levels", "modifiers"],
  ["modifiers", "requirements"],
] as const;

/**
 * A published ruleset whose feat has a modifier (with a requirement of its
 * own), a property and a requirement, whose class has a modifier, a property
 * and a requirement, and whose class level has a modifier; and another user's
 * fork of it.
 */
async function setup() {
  const { user: owner } = await createTestUser();
  const { session } = await createTestUser();
  const parent = await createTestRuleset(owner.id, { private: false, status: "Published" });
  const rulesetId = parent.id;
  await insertRows(
    abilitiesInRules,
    ["Strength", "Dexterity"].map((name) => ({ name, description: name, rulesetId })),
  );

  const [feat] = await Feats.create(db, { name: "Power Attack", description: "Parent feat", rulesetId });
  const [modifier] = await Modifiers.create(db, {
    sourceId: feat.id,
    sourceType: "feats",
    target: "abilities.strength.misc",
    value: "2",
    valueType: "number",
    operator: "add",
  });
  await Requirements.create(db, {
    ...requirement,
    entityId: modifier.id,
    entityType: "modifiers",
    level: "1",
    target: "abilities.strength.misc",
    value: "15",
  });
  await Properties.create(db, { entityId: feat.id, entityType: "feats", type: "tag", value: "combat" });
  await Requirements.create(db, {
    ...requirement,
    entityId: feat.id,
    entityType: "feats",
    level: "1",
    target: "abilities.strength.misc",
    value: "13",
  });

  const [klass] = await Klasses.create(db, { name: "Fighter", rulesetId, hd: 10 });
  const [level] = await KlassLevels.create(db, { klassId: klass.id, level: 1 });
  for (const [sourceId, sourceType] of [
    [level.id, "klass_levels"],
    [klass.id, "klasses"],
  ]) {
    await Modifiers.create(db, {
      sourceId,
      sourceType,
      target: "abilities.strength.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    });
  }
  await Properties.create(db, { entityId: klass.id, entityType: "klasses", type: "tag", value: "martial" });
  await Requirements.create(db, {
    ...requirement,
    entityId: klass.id,
    entityType: "klasses",
    level: "1",
    target: "abilities.strength.misc",
    value: "13",
  });

  const fork = await RulesetsService.forkRuleset(session, rulesetId, { name: "Fork", private: false });
  return {
    session,
    parent,
    fork,
    feat,
    klass,
    owners: { feats: feat.id, klasses: klass.id, klass_levels: level.id, modifiers: modifier.id },
  };
}

/** `setup()`, with the parent's rows of this kind before the fork touches them. */
async function setupCase(ownerType: (typeof CASES)[number][0], kind: Kind) {
  const context = await setup();
  const ownerId = context.owners[ownerType];
  return { ...context, ownerId, parentRows: await kind.rowsOf(ownerType, ownerId) };
}

describe.each(CASES)("an inherited %s's %s", (ownerType, kindName) => {
  const kind = KINDS[kindName];

  test("get a new one on the fork's copy of the entity", async () => {
    const { session, fork, feat, klass, ownerId, parentRows } = await setupCase(ownerType, kind);
    const created = await kind.create(session, fork.id, ownerType, ownerId);

    expect(created.resolvedEntityId).not.toBe(ownerId);
    expect((await kind.rowsOf(ownerType, created.resolvedEntityId)).map((r) => r.id)).toContain(created.id);
    const copied =
      ownerType === "klasses" || ownerType === "klass_levels"
        ? { entityType: "klasses", sourceEntityId: klass.id }
        : { entityType: "feats", sourceEntityId: feat.id };
    expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toMatchObject([copied]);
    expect(await kind.rowsOf(ownerType, ownerId)).toEqual(parentRows);
  });

  test("are edited on the fork's copy", async () => {
    const { session, fork, ownerId, parentRows } = await setupCase(ownerType, kind);
    const updated = await kind.update(session, fork.id, ownerType, ownerId, parentRows[0].id);
    expect(updated.resolvedEntityId).not.toBe(ownerId);
    expect(updated.id).not.toBe(parentRows[0].id);
    expect((await kind.rowsOf(ownerType, updated.resolvedEntityId)).map((r) => r.id)).toEqual([updated.id]);
    expect(await kind.rowsOf(ownerType, ownerId)).toEqual(parentRows);
  });

  test("are deleted from the fork's copy", async () => {
    const { session, fork, ownerId, parentRows } = await setupCase(ownerType, kind);
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
    await FeatsService.updateFeat(session, fork.id, feat.id, { name: feat.name, description: "Copied" });
    const copyId = (await EntitySnapshots.findOne(db, { sourceEntityId: feat.id, rulesetId: fork.id }))!.forkedEntityId;
    const [copied] = await kind.rowsOf("feats", copyId);

    expect((await kind.list(fork.id, "feats", feat.id)).map((r) => r.id)).toEqual([copied.id]);
    expect(await kind.update(session, fork.id, "feats", feat.id, copied.id)).toMatchObject({
      id: copied.id,
      resolvedEntityId: copyId,
    });
    const created = await kind.create(session, fork.id, "feats", feat.id);
    expect(created.resolvedEntityId).toBe(copyId);
    expect(await kind.remove(session, fork.id, "feats", feat.id, copied.id)).toMatchObject({
      resolvedEntityId: copyId,
    });

    expect((await kind.rowsOf("feats", copyId)).map((r) => r.id)).toEqual([created.id]);
    expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toHaveLength(1);
    expect(await kind.rowsOf("feats", feat.id)).toEqual(parentRows);
  });
});

describe("customizing an inherited feat", () => {
  test("lists it among the fork's changes until it's reverted", async () => {
    const { session, fork, feat, owners } = await setup();
    const featChanges = async () =>
      (await RulesetChangesService.getChanges(session, fork.id)).filter((c) => c.entityType === "feats");
    expect(await featChanges()).toEqual([]);

    await ModifiersService.updateModifier(session, fork.id, "feats", feat.id, owners.modifiers, dexterityBonus);
    expect(await featChanges()).toMatchObject([{ status: "modified", sourceEntityId: feat.id }]);

    await RulesetChangesService.revertOverride(session, fork.id, "feats", feat.id);
    expect(await featChanges()).toEqual([]);
    expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toEqual([]);
  });

  test("copies nothing when the ruleset owns the feat", async () => {
    const { user, session } = await createTestUser();
    const ruleset = await createTestRuleset(user.id);
    await insertRows(
      abilitiesInRules,
      ["Strength", "Dexterity"].map((name) => ({ name, description: name, rulesetId: ruleset.id })),
    );
    const [feat] = await Feats.create(db, { name: "Owned Feat", rulesetId: ruleset.id });
    const modifier = await ModifiersService.createModifier(session, ruleset.id, "feats", feat.id, dexterityBonus);

    expect(
      await ModifiersService.updateModifier(session, ruleset.id, "feats", feat.id, modifier.id, {
        ...dexterityBonus,
        value: "3",
      }),
    ).toMatchObject({ id: modifier.id, resolvedEntityId: feat.id });
    expect(await EntitySnapshots.findMany(db, { rulesetId: ruleset.id })).toEqual([]);
  });
});
