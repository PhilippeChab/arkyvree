import { afterAll, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import type { Aptitude, Feat, Race } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  Entities,
  EntitySnapshots,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  type RulesetEntityType,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { findPlainItem } from "@/tests/support/dnd3.5/items.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
  subscribeTestRuleset,
} from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  ITEM_COST_GP,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  RACE_BASE_SPEED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A kind a fork renames its own entity in, to the name of one of the core rules' (`taken`). */
interface RenamedKind {
  create: (session: Session, forkId: string, baseId: string, name: string) => Promise<{ id: string }>;
  rename: (session: Session, forkId: string, id: string, name: string) => Promise<unknown>;
  taken: (baseId: string) => Promise<string>;
}

const pool = createTestPool();

/** Each kind a fork renames its own entity in: what it creates, renames, and the name of one of the core rules'. */
const RENAMED_KINDS: Record<"aptitudes" | "feats" | "items" | "spells", RenamedKind> = {
  aptitudes: {
    create: (session, forkId, _baseId, name) => EntitiesService.createEntity(session, forkId, "aptitudes", { name }),
    rename: (session, forkId, id, name) => EntitiesService.updateEntity(session, forkId, "aptitudes", id, { name }),
    taken: async () => "Wizard Spells",
  },
  feats: {
    create: async (session, forkId, baseId, name) => {
      const general = (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: "General",
        rulesetId: baseId,
      }))!;
      return await EntitiesService.createEntity(session, forkId, "feats", {
        name,
        links: { listedIn: [{ toId: general.id }] },
      });
    },
    rename: (session, forkId, id, name) => EntitiesService.updateEntity(session, forkId, "feats", id, { name }),
    taken: async () => "Toughness",
  },
  items: {
    create: (session, forkId, _baseId, name) => EntitiesService.createEntity(session, forkId, "items", { name }),
    rename: (session, forkId, id, name) => EntitiesService.updateEntity(session, forkId, "items", id, { name }),
    taken: async (baseId) => (await findPlainItem(baseId)).name,
  },
  spells: {
    create: async (session, forkId, baseId, name) => {
      const wizard = (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: "Wizard Spells",
        rulesetId: baseId,
      }))!;
      return await EntitiesService.createEntity(session, forkId, "spells", {
        name,
        links: { listedIn: [{ toId: wizard.id, tier: 1 }] },
      });
    },
    rename: (session, forkId, id, name) => EntitiesService.updateEntity(session, forkId, "spells", id, { name }),
    taken: async () => "Magic Missile",
  },
};

/** How many entities of a kind its view shows under a name. */
async function countNamed(rulesetId: string, kind: keyof typeof RENAMED_KINDS | "races", name: string) {
  return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
    const entities: { name: string }[] = Dnd35View.of(rulesetData)[kind];
    return entities.filter((entity) => entity.name === name).length;
  });
}

/** A ruleset made a system extension, which a fork of its base may subscribe to. */
async function publishExtension(rulesetId: string) {
  await Rulesets.update(
    db,
    { kind: "extension", status: "Published", private: false, userId: null },
    { id: rulesetId },
  );
}

/**
 * Runs `run` while another transaction holds the names of these kinds in these rulesets (`held`), which it mustn't wait
 * on: a wait fails the test rather than hang it.
 */
async function runWhileNamesHeld(
  held: { entityTypes: readonly RulesetEntityType[]; rulesetId: string }[],
  run: () => Promise<unknown>,
) {
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    for (const where of held) await RulesetEntities.lockNames(createTestDbFromClient(blocker), where);
    await db.execute(sql`set local lock_timeout = '2s'`);
    await run();
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
}

async function setup() {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const baseId = fork.ancestorRulesetIds[0];
  const general = (await Entities.findOne<Aptitude>(db, {
    entityType: "aptitudes",
    name: "General",
    rulesetId: baseId,
  }))!;
  const baseFeat = async (name: string) =>
    (await Entities.findOne<Feat>(db, { entityType: "feats", name, rulesetId: baseId }))!;
  return { session, fork, baseId, general, baseFeat };
}

afterAll(() => pool.end());

// A renamed local copy is still the override: inherited picks of the source
// must keep resolving to it, and its snapshot must not move to a new entity
// that reuses the original name.
test("creating a feat with a renamed override's original name keeps the override", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Alertness");
  const renamed = await EntitiesService.updateEntity(session, fork.id, "feats", source.id, {
    name: "Alertness (Local)",
  });

  const created = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Alertness",
    links: { listedIn: [{ toId: general.id }] },
  });

  const snapshot = await EntitySnapshots.findOne(db, { sourceEntityId: source.id, rulesetId: fork.id });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  const names = await withRulesetScope(db, fork.id, async ({ rulesetData }) => ({
    source: Dnd35View.of(rulesetData).featsById.get(source.id)?.name,
    created: Dnd35View.of(rulesetData).featsById.get(created.id)?.name,
  }));
  expect(names).toEqual({ source: "Alertness (Local)", created: "Alertness" });
});

test("bulk item variants with a renamed override's original name keep the override", async () => {
  const { session, fork, baseId } = await setup();
  const source = await findPlainItem(baseId);
  const renamed = await EntitiesService.updateEntity(session, fork.id, "items", source.id, {
    name: `${source.name} (Local)`,
    description: source.description,
    fields: {
      [ITEM_TYPE]: source.fields[ITEM_TYPE],
      [ITEM_SLOT]: source.fields[ITEM_SLOT],
      [ITEM_WEIGHT]: source.fields[ITEM_WEIGHT],
      [ITEM_COST_GP]: source.fields[ITEM_COST_GP],
    },
  });

  const [created] = await EntitiesService.createVariants(session, fork.id, "items", renamed.id, [
    { name: source.name },
  ]);

  const snapshot = await EntitySnapshots.findOne(db, { sourceEntityId: source.id, rulesetId: fork.id });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  expect(created.name).toBe(source.name);
});

// The base feat is hidden by the extension's copy, and the extension's copy by
// the fork's renamed copy. Neither is visible, so the name is free and no
// snapshot moves.
test("the original name of a renamed extension copy is available", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Toughness");
  const extension = await createSeededTestRuleset(session.userId);
  const extensionCopy = await copyEntity(db, "feats", source.id, extension);
  await publishExtension(extension.id);
  await RulesetExtensionsService.subscribeExtension(session, fork.id, [extension.id]);
  const renamed = await EntitiesService.updateEntity(session, fork.id, "feats", extensionCopy.id, {
    name: "Toughness (Local)",
  });

  const created = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Toughness",
    links: { listedIn: [{ toId: general.id }] },
  });

  const snapshot = await EntitySnapshots.findOne(db, {
    sourceEntityId: extensionCopy.id,
    rulesetId: fork.id,
  });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  expect(
    await withRulesetScope(
      db,
      fork.id,
      async ({ rulesetData }) => Dnd35View.of(rulesetData).featsById.get(source.id)?.name,
    ),
  ).toBe("Toughness (Local)");
  expect(created.name).toBe("Toughness");
});

test("a visible inherited feat still blocks its name", async () => {
  const { session, fork, general } = await setup();
  expect(
    EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Alertness",
      links: { listedIn: [{ toId: general.id }] },
    }),
  ).rejects.toThrow("Name already exists in the source chain");
});

// A rename takes a name as a create does: one its view shows (the ruleset's own, or a visible inherited entity's) is
// refused, so the view never shows two of a name.
test.each(["aptitudes", "feats", "items", "spells"] as const)(
  "a fork's own %s renamed to a name its view shows is refused, as its create is",
  async (kind) => {
    const { session, fork, baseId } = await setup();
    const { create, rename, taken } = RENAMED_KINDS[kind];
    const name = await taken(baseId);
    const own = await create(session, fork.id, baseId, "Probe Entity");
    const other = await create(session, fork.id, baseId, "Other Probe Entity");

    expect(rename(session, fork.id, own.id, name)).rejects.toThrow(
      `Name already exists in the source chain (an ancestor or subscribed extension): ${name}`,
    );
    expect(rename(session, fork.id, own.id, "Other Probe Entity")).rejects.toThrow(
      "Name already exists in this ruleset: Other Probe Entity",
    );
    await expectRefusedWith(rename(session, fork.id, other.id, name), 409);
    await expectRefusedWith(create(session, fork.id, baseId, name), 409);
    expect(await countNamed(fork.id, kind, name)).toBe(1);
    expect(await countNamed(fork.id, kind, "Probe Entity")).toBe(1);
  },
);

test("a fork taking extensions can't rename its list to a list its books show", async () => {
  const session = makeSession();
  const fork = await createSeededTestRulesetWithExtensions(session.userId);
  const own = await EntitiesService.createEntity(session, fork.id, "aptitudes", { name: "Probe List" });

  await expectRefusedWith(
    EntitiesService.updateEntity(session, fork.id, "aptitudes", own.id, { name: "Assassin Spells" }),
    409,
  );
  expect(await countNamed(fork.id, "aptitudes", "Assassin Spells")).toBe(1);
});

test("an edit keeping its entity's name, or giving an inherited one's copy its source's back, is no clash", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Toughness");

  // The first edit copies it under its name, which its source, hidden, no longer shows
  const copy = await EntitiesService.updateEntity(session, fork.id, "feats", source.id, {
    name: source.name,
    description: "Local",
  });
  expect(copy.id).not.toBe(source.id);
  await EntitiesService.updateEntity(session, fork.id, "feats", source.id, { name: "Toughness (Local)" });
  expect(await EntitiesService.updateEntity(session, fork.id, "feats", source.id, { name: source.name })).toMatchObject(
    {
      id: copy.id,
      name: source.name,
    },
  );

  // Names compare as written: a case-only change is a name of its own
  const own = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Probe Feat",
    links: { listedIn: [{ toId: general.id }] },
  });
  expect(await EntitiesService.updateEntity(session, fork.id, "feats", own.id, { name: "probe feat" })).toMatchObject({
    name: "probe feat",
  });
  expect(await countNamed(fork.id, "feats", source.name)).toBe(1);
});

test("a duplicate stored before the rule stays editable under its name, and leaves it for a free one", async () => {
  const { session, fork } = await setup();
  const [duplicate] = await Entities.create<Feat>(db, "feats", { name: "Toughness", rulesetId: fork.id });
  RulesetViews.invalidate(fork.id);

  expect(
    await EntitiesService.updateEntity(session, fork.id, "feats", duplicate.id, {
      name: "Toughness",
      description: "Kept",
    }),
  ).toMatchObject({ id: duplicate.id, name: "Toughness", description: "Kept" });
  await expectRefusedWith(
    EntitiesService.updateEntity(session, fork.id, "feats", duplicate.id, { name: "Alertness" }),
    409,
  );
  expect(
    await EntitiesService.updateEntity(session, fork.id, "feats", duplicate.id, { name: "Probe Hardiness" }),
  ).toMatchObject({
    name: "Probe Hardiness",
  });
});

// A restore shows its source again, under the source's name: refused while the fork shows another entity of it, as a
// rename to that name would be.
test("restoring a renamed copy whose source's name the fork has given another feat since is refused", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Alertness");
  const copy = await EntitiesService.updateEntity(session, fork.id, "feats", source.id, { name: "Alertness (Local)" });
  const own = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Alertness",
    links: { listedIn: [{ toId: general.id }] },
  });

  expect(RulesetChangesService.revertOverride(session, fork.id, "feats", source.id)).rejects.toThrow(
    "Name already exists in this ruleset: Alertness",
  );
  expect(await countNamed(fork.id, "feats", "Alertness")).toBe(1);
  expect(await EntitySnapshots.findOne(db, { sourceEntityId: source.id, rulesetId: fork.id })).toMatchObject({
    forkedEntityId: copy.id,
  });

  await EntitiesService.updateEntity(session, fork.id, "feats", own.id, { name: "Probe Alertness" });
  await RulesetChangesService.revertOverride(session, fork.id, "feats", source.id);
  expect(await countNamed(fork.id, "feats", "Alertness")).toBe(1);
});

test("restoring a deleted feat whose name a renamed one has taken since is refused", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Dodge");
  await EntitiesService.deleteEntity(session, fork.id, "feats", source.id);
  const own = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Probe Feat",
    links: { listedIn: [{ toId: general.id }] },
  });
  await EntitiesService.updateEntity(session, fork.id, "feats", own.id, { name: "Dodge" });

  await expectRefusedWith(RulesetChangesService.revertOverride(session, fork.id, "feats", source.id), 409);
  expect(await countNamed(fork.id, "feats", "Dodge")).toBe(1);
});

test("restoring a copy that kept its source's name, or a deleted feat whose name is free, is no clash", async () => {
  const { session, fork, baseFeat } = await setup();
  const [alertness, dodge] = [await baseFeat("Alertness"), await baseFeat("Dodge")];
  await EntitiesService.updateEntity(session, fork.id, "feats", alertness.id, {
    name: "Alertness",
    description: "Local",
  });
  await EntitiesService.deleteEntity(session, fork.id, "feats", dodge.id);

  await RulesetChangesService.revertOverride(session, fork.id, "feats", alertness.id);
  await RulesetChangesService.revertOverride(session, fork.id, "feats", dodge.id);
  expect(await countNamed(fork.id, "feats", "Alertness")).toBe(1);
  expect(await countNamed(fork.id, "feats", "Dodge")).toBe(1);
});

// A subscribe refuses what its view would then show twice, by the names its entities have, a renamed copy's included:
// the fork's (#697), and the extension's.
test("subscribing to an extension with an entity of a renamed copy's name is refused", async () => {
  const { session, fork: host, baseId, general, baseFeat } = await setup();
  const extension = await createSeededTestRuleset(session.userId);
  await EntitiesService.createEntity(session, extension.id, "feats", {
    name: "Probe Ext Feat",
    links: { listedIn: [{ toId: general.id }] },
  });
  await publishExtension(extension.id);
  await EntitiesService.updateEntity(session, host.id, "feats", (await baseFeat("Alertness")).id, {
    name: "Probe Ext Feat",
  });

  await expectRefusedWith(RulesetExtensionsService.subscribeExtension(session, host.id, [extension.id]), 409);
  expect(await countNamed(host.id, "feats", "Probe Ext Feat")).toBe(1);

  // The extension's copy of a core item, renamed as the fork's own item is named
  const other = await createSeededTestRuleset(session.userId);
  const item = await findPlainItem(baseId);
  await EntitiesService.updateEntity(session, other.id, "items", item.id, { name: "Probe Ext Item" });
  await publishExtension(other.id);
  await EntitiesService.createEntity(session, host.id, "items", { name: "Probe Ext Item" });
  await expectRefusedWith(RulesetExtensionsService.subscribeExtension(session, host.id, [other.id]), 409);
  expect(await countNamed(host.id, "items", "Probe Ext Item")).toBe(1);
});

// An unsubscribe shows again what the extension stood in for (a core entity it copied), under its name: refused while
// the fork shows another entity of it, as a subscribe is (#699)
test("unsubscribing from an extension whose copy of a core feat the fork renamed, once it named a feat as the core one, is refused", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const extension = await createSeededTestRuleset(session.userId);
  const bookCopy = await copyEntity(db, "feats", (await baseFeat("Dodge")).id, extension);
  await publishExtension(extension.id);
  await RulesetExtensionsService.subscribeExtension(session, fork.id, [extension.id]);
  await EntitiesService.updateEntity(session, fork.id, "feats", bookCopy.id as string, { name: "Dodge (Local)" });
  const own = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Dodge",
    links: { listedIn: [{ toId: general.id }] },
  });

  expect(RulesetExtensionsService.unsubscribeExtension(session, fork.id, extension.id)).rejects.toThrow(
    'Cannot unsubscribe: feats "Dodge", which this extension replaces, would show again beside another of its name',
  );
  await expectRefusedWith(RulesetExtensionsService.unsubscribeExtension(session, fork.id, extension.id), 409);
  expect((await Rulesets.findOne(db, { id: fork.id }))!.extensionIds).toEqual([extension.id]);
  expect(await countNamed(fork.id, "feats", "Dodge")).toBe(1);

  // Once the fork renamed its own, the core feat comes back alone
  await EntitiesService.updateEntity(session, fork.id, "feats", own.id, { name: "Probe Dodge" });
  await RulesetExtensionsService.unsubscribeExtension(session, fork.id, extension.id);
  expect(await countNamed(fork.id, "feats", "Dodge")).toBe(1);
  expect(await countNamed(fork.id, "feats", "Dodge (Local)")).toBe(0);
});

test("subscribing to an extension that shows a name its view shows twice no more often, or unsubscribing, is no clash", async () => {
  const session = makeSession();
  const base = await createTestRuleset(null);
  const fork = { rulesetId: base.id, ancestorRulesetIds: [base.id] };
  // A familiar's race and an animal companion's of one name, as the core rules' Hawk
  const [twin] = await Entities.create<Race>(db, "races", {
    name: "Twin",
    rulesetId: base.id,
    partition: "familiar",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 10 },
  });
  await Entities.create<Race>(db, "races", {
    name: "Twin",
    rulesetId: base.id,
    partition: "animalcompanion",
    fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 10 },
  });
  const host = await createTestRuleset(session.userId, fork);
  const extension = await createTestRuleset(session.userId, fork);
  await copyEntity(db, "races", twin.id, extension);
  await publishExtension(extension.id);

  await RulesetExtensionsService.subscribeExtension(session, host.id, [extension.id]);
  expect(await countNamed(host.id, "races", "Twin")).toBe(2);
  await RulesetExtensionsService.unsubscribeExtension(session, host.id, extension.id);
  expect(await countNamed(host.id, "races", "Twin")).toBe(2);
});

test("a name another save took since the check, which meets the index, is refused as the check refuses it", async () => {
  // Two saves that take one name at once both pass the check: the second one's write meets the index.
  const { id: rulesetId } = await createTestRuleset(null);
  const name = `Taken ${uniqueId()}`;
  await Entities.create(db, "aptitudes", { rulesetId, name });

  expect(
    withTransaction((tx) =>
      EntityNames.withNameRefusal(name, () => Entities.create(tx, "aptitudes", { rulesetId, name })),
    ),
  ).rejects.toEqual(new ConflictError(`Name already exists in this ruleset: ${name}`));
  const unrelated = new Error("not the index's");
  expect(EntityNames.withNameRefusal(name, () => Promise.reject(unrelated))).rejects.toBe(unrelated);
  expect(await Entities.findMany(db, { entityType: "aptitudes", rulesetIds: [rulesetId] })).toHaveLength(1);
});

// No index refuses a name the view shows of an inherited entity, whose row is its source ruleset's: two writes checking
// at once (a restore and a create of its source's name) both passed, and the view showed the name twice. Each write
// that takes a name waits on its kind's names in the ruleset (`EntityNames.lock`), then reads the view; the race itself
// needs two of the app's connections, which a test's one transaction doesn't have. A test's lock lasts as long as its
// transaction, so each sets up without taking the one its write waits on.
test.each([
  [
    "create",
    "feats",
    async () => {
      const { session, fork, general } = await setup();
      const body = { name: "Probe Feat", links: { listedIn: [{ toId: general.id }] } };
      return { fork, write: () => EntitiesService.createEntity(session, fork.id, "feats", body) };
    },
  ],
  [
    "variants' create",
    "items",
    async () => {
      const { session, fork, baseId } = await setup();
      const item = await findPlainItem(baseId);
      const variants = [{ name: "Probe Variant" }];
      return { fork, write: () => EntitiesService.createVariants(session, fork.id, "items", item.id, variants) };
    },
  ],
  [
    "rename",
    "feats",
    async () => {
      const { session, fork, baseFeat } = await setup();
      const { id } = await baseFeat("Alertness");
      return { fork, write: () => EntitiesService.updateEntity(session, fork.id, "feats", id, { name: "Probe Feat" }) };
    },
  ],
  [
    "restore",
    "feats",
    async () => {
      const { session, fork, baseFeat } = await setup();
      const { id } = await baseFeat("Alertness");
      await copyEntity(db, "feats", id, fork);
      return { fork, write: () => RulesetChangesService.revertOverride(session, fork.id, "feats", id) };
    },
  ],
  [
    "subscribe",
    "races",
    async () => {
      const { session, fork } = await setup();
      const extension = await createSeededTestRuleset(session.userId);
      await publishExtension(extension.id);
      return { fork, write: () => RulesetExtensionsService.subscribeExtension(session, fork.id, [extension.id]) };
    },
  ],
  [
    "unsubscribe",
    "races",
    async () => {
      const { session, fork } = await setup();
      const extension = await createSeededTestRuleset(session.userId);
      await publishExtension(extension.id);
      await subscribeTestRuleset(fork.id, [extension.id]);
      return { fork, write: () => RulesetExtensionsService.unsubscribeExtension(session, fork.id, extension.id) };
    },
  ],
] as const)(
  "a %s waits on the ruleset's names of its kind (%s) another transaction holds",
  async (_, kind, prepare) => {
    const { fork, write } = await prepare();
    await runWhileLocked<unknown>(
      pool,
      (blockerDb) => RulesetEntities.lockNames(blockerDb, { entityTypes: [kind], rulesetId: fork.id }),
      write,
    );
  },
);

test("an edit keeping its name waits on no names, and a create on no other kind's, nor another ruleset's", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const { id } = await baseFeat("Toughness");
  await runWhileNamesHeld([{ entityTypes: ["feats"], rulesetId: fork.id }], () =>
    EntitiesService.updateEntity(session, fork.id, "feats", id, { name: "Toughness", description: "Local" }),
  );

  const others = RULESET_ENTITY_TYPES.filter((type) => type !== "feats");
  const elsewhere = { entityTypes: ["feats"] as const, rulesetId: (await createTestRuleset(null)).id };
  await runWhileNamesHeld([{ entityTypes: others, rulesetId: fork.id }, elsewhere], () =>
    EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Probe Feat",
      links: { listedIn: [{ toId: general.id }] },
    }),
  );
  expect(await countNamed(fork.id, "feats", "Probe Feat")).toBe(1);
  expect(await countNamed(fork.id, "feats", "Toughness")).toBe(1);
});
