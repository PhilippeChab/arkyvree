import { DND35_COMPLETE_WARRIOR_NAME, DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { cowFeatIntoExtension } from "@/database/packages/dnd35/seed-utils.ts";
import { entitySnapshotsInRules, levelFeatsInCharacter, levelsInCharacter, powersInRules } from "@/drizzle/schema.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import {
  Aptitudes,
  Characters,
  EntitySnapshots,
  FeatsAptitudes,
  Feats,
  Klasses,
  KlassLevels,
  Modifiers,
  Powers,
  PowersAptitudes,
  Races,
  Requirements,
  RulesetExtensions,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import type { Session } from "@/shared/relations.ts";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "bun:test";

let seedCtx: SeedContext;
async function seed() {
  if (!seedCtx) seedCtx = await getSeedContext(db);
  return seedCtx;
}

describe("subscribeExtension (COW)", () => {
  function createTestSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    return { user: users[0], session: createTestSession(users[0].id) };
  }

  /** Finds the seeded D&D 3.5 base ruleset and the test extension. */
  async function findBaseAndExtension() {
    const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
    if (!base) throw new Error("Base D&D 3.5 ruleset not found — run reset-db");

    const extension = await Rulesets.findOne(db, { name: DND35_COMPLETE_WARRIOR_NAME });
    if (!extension) throw new Error("Test extension not found — run reset-db");

    return { base, extension };
  }

  /** Creates a draft fork of the base ruleset for a test user. */
  async function setupDraftFork() {
    const { user, session } = await createTestUser();
    const { base, extension } = await findBaseAndExtension();

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Test Fork ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    return { user, session, base, extension, draft };
  }

  // ── Happy path ───────────────────────────────────────────────────

  test("subscribe appends to extensionRulesetIds", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(extension.id);
  });

  test("subscribed extension entities are visible via inheritance (not copied)", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // The extension feats should be visible via the inherited query
    const draftFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: draft.id, ancestorRulesetIds: [extension.id, ...draft.ancestorRulesetIds] }, pagination),
    );
    const buckler = draftFeats.find((f) => f.name === "Improved Buckler Defense");
    expect(buckler).toBeDefined();
    // The entity should still belong to the extension ruleset — NOT copied
    expect(buckler!.rulesetId).toBe(extension.id);
  });

  test("subscribe creates tracking row in ruleset_extensions", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const subscribed = await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id });
    expect(subscribed.length).toBe(1);
    expect(subscribed[0].extensionId).toBe(extension.id);
    expect(subscribed[0].extensionName).toBe(DND35_COMPLETE_WARRIOR_NAME);
  });

  // ── Double subscribe ───────────────────────────────────────────

  test("double subscribe throws ConflictError", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]),
    ).rejects.toThrow(ConflictError);
  });

  // ── COW on extension entity ────────────────────────────────────

  test("COW on extension entity creates snapshot + local copy", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Find an extension feat
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;

    // Update it via the service (triggers COW)
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "Modified description" },
    );

    // A snapshot should exist
    const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const mgSnap = snapshots.find((s) => s.sourceEntityId === monkeyGrip.id);
    expect(mgSnap).toBeDefined();
    expect(mgSnap!.entityType).toBe("feats");

    // The COW copy should belong to the draft
    const cowFeat = await Feats.findOne(db, { id: mgSnap!.forkedEntityId });
    expect(cowFeat).toBeDefined();
    expect(cowFeat!.rulesetId).toBe(draft.id);
    expect(cowFeat!.description).toBe("Modified description");
  });

  // ── Unsubscribe ────────────────────────────────────────────────

  test("unsubscribe removes extension from extensionRulesetIds", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).not.toContain(extension.id);
  });

  test("unsubscribe removes visibility of extension entities", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    // Extension feats should no longer be visible
    const draftFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: draft.id, ancestorRulesetIds: draft.ancestorRulesetIds }, pagination),
    );
    expect(draftFeats.find((f) => f.name === "Improved Buckler Defense")).toBeUndefined();
    expect(draftFeats.find((f) => f.name === "Monkey Grip")).toBeUndefined();
    expect(draftFeats.find((f) => f.name === "Shock Trooper")).toBeUndefined();
  });

  test("unsubscribe cleans up COW copies and snapshots", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // COW an extension entity
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "Modified" },
    );

    // Verify COW exists
    const snapsBefore = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    expect(snapsBefore.some((s) => s.sourceEntityId === monkeyGrip.id)).toBe(true);

    // Unsubscribe
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    // COW snapshot should be cleaned up
    const snapsAfter = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    expect(snapsAfter.some((s) => s.sourceEntityId === monkeyGrip.id)).toBe(false);
  });

  test("unsubscribe soft-deletes tracking row", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    const subscribed = await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id });
    expect(subscribed.length).toBe(0);
  });

  // ── Fork inherits extensions ───────────────────────────────────


  // ── getSubscribedExtensions ────────────────────────────────────

  test("getSubscribedExtensions returns subscribed extensions with update flag", async () => {
    const { session, extension, draft } = await setupDraftFork();

    // Initially no extensions subscribed
    const before = await RulesetsMethods.getSubscribedExtensions(session, draft.id);
    expect(before.length).toBe(0);

    // Subscribe
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const after = await RulesetsMethods.getSubscribedExtensions(session, draft.id);
    expect(after.length).toBe(1);
    expect(after[0].extensionName).toBe(DND35_COMPLETE_WARRIOR_NAME);
    expect(after[0].extensionId).toBe(extension.id);
    expect(typeof after[0].updateAvailable).toBe("boolean");
  });

  // ── Validation errors ────────────────────────────────────────────

  test("should reject subscribe into archived ruleset", async () => {
    const { session, extension, base } = await setupDraftFork();

    // Fork, publish, then archive
    const archived = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Archived Fork ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await RulesetsMethods.publishRuleset(session, archived.id);
    await RulesetsMethods.archiveRuleset(session, archived.id);

    await expect(
      RulesetsMethods.subscribeExtension(session, archived.id, [extension.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should accept subscribe of a published public homebrew extension (user-owned fork)", async () => {
    const { session, draft, base } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    const homebrew = await RulesetsMethods.forkRuleset(otherSession, base.id, {
      name: `Homebrew ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await RulesetsMethods.publishRuleset(otherSession, homebrew.id, { kind: "extension" });

    await RulesetsMethods.subscribeExtension(session, draft.id, [homebrew.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(homebrew.id);
  });

  test("should reject subscribe of a private homebrew fork", async () => {
    const { session, draft, base } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    const privateFork = await RulesetsMethods.forkRuleset(otherSession, base.id, {
      name: `Private ${Math.random().toString(36).substr(2, 6)}`,
      private: true,
    });
    await RulesetsMethods.publishRuleset(otherSession, privateFork.id);

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [privateFork.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should reject subscribe of a draft homebrew fork", async () => {
    const { session, draft, base } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    const draftFork = await RulesetsMethods.forkRuleset(otherSession, base.id, {
      name: `Draft ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [draftFork.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should reject subscribe of a homebrew fork that has its own extensions", async () => {
    const { session, draft, extension, base } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    const homebrew = await RulesetsMethods.forkRuleset(otherSession, base.id, {
      name: `Homebrew ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await RulesetsMethods.subscribeExtension(otherSession, homebrew.id, [extension.id]);
    await RulesetsMethods.publishRuleset(otherSession, homebrew.id);

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [homebrew.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should reject subscribe to extensions while ruleset is being used as a homebrew extension", async () => {
    const { session: ownerSession, draft: homebrew, extension, base } = await setupDraftFork();
    const { session: subscriberSession } = await createTestUser();

    // Another user subscribes to this fork as a homebrew extension first
    await RulesetsMethods.publishRuleset(ownerSession, homebrew.id, { kind: "extension" });
    const subscriberFork = await RulesetsMethods.forkRuleset(subscriberSession, base.id, {
      name: `Subscriber ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await RulesetsMethods.subscribeExtension(subscriberSession, subscriberFork.id, [homebrew.id]);

    // Now the homebrew owner shouldn't be able to add their own extensions —
    // that would create transitive deps for subscribers.
    await expect(
      RulesetsMethods.subscribeExtension(ownerSession, homebrew.id, [extension.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should reject subscribing to itself", async () => {
    const { session, draft } = await setupDraftFork();

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [draft.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("archived homebrew extension keeps working for existing subscribers", async () => {
    const { session, draft, base } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    const homebrew = await RulesetsMethods.forkRuleset(otherSession, base.id, {
      name: `Homebrew ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await RulesetsMethods.publishRuleset(otherSession, homebrew.id, { kind: "extension" });

    await RulesetsMethods.subscribeExtension(session, draft.id, [homebrew.id]);
    await RulesetsMethods.archiveRuleset(otherSession, homebrew.id);

    // Existing subscription stays — homebrew id still in array, source chain
    // resolution works regardless of status.
    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(homebrew.id);

    // But new subscribers get rejected (status !== "Published")
    const { session: newSubscriberSession } = await createTestUser();
    const newFork = await RulesetsMethods.forkRuleset(newSubscriberSession, base.id, {
      name: `NewFork ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await expect(
      RulesetsMethods.subscribeExtension(newSubscriberSession, newFork.id, [homebrew.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should reject subscribe of extension from different base", async () => {
    const { session } = await createTestUser();

    // Create a separate base ruleset
    const separateBase = await Rulesets.create(db, {
      name: `Separate Base ${Math.random().toString(36).substr(2, 6)}`,
      description: "A different base",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      status: "Published",
    });

    // Fork from the separate base
    const draft = await RulesetsMethods.forkRuleset(session, separateBase[0].id, {
      name: `Draft from separate ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    // The seeded test extension is based on D&D 3.5 — different parent
    const { extension } = await findBaseAndExtension();

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  test("should reject subscribe when extension and host share a feat name", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Conflict Host ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    const conflictName = `Test Conflict Feat ${Math.random().toString(36).substr(2, 6)}`;
    await Feats.create(db, {
      name: conflictName,
      description: "Local feat in host",
      rulesetId: draft.id,
    });

    const extensionRows = await Rulesets.create(db, {
      name: `Conflict Extension ${Math.random().toString(36).substr(2, 6)}`,
      description: "Homebrew extension",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    });
    const extensionRuleset = extensionRows[0];
    await Feats.create(db, {
      name: conflictName,
      description: "Same-named feat in extension",
      rulesetId: extensionRuleset.id,
    });

    await expect(
      RulesetsMethods.subscribeExtension(session, draft.id, [extensionRuleset.id]),
    ).rejects.toThrow(ConflictError);
  });

  test("should pair same-named feats across two new extensions as siblings", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Two-Ext Host ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    const conflictName = `Cross Ext Feat ${Math.random().toString(36).substr(2, 6)}`;
    const extA = (await Rulesets.create(db, {
      name: `Ext A ${Math.random().toString(36).substr(2, 6)}`,
      description: "Homebrew extension A",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    const extB = (await Rulesets.create(db, {
      name: `Ext B ${Math.random().toString(36).substr(2, 6)}`,
      description: "Homebrew extension B",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    await Feats.create(db, { name: conflictName, description: "feat in A", rulesetId: extA.id });
    await Feats.create(db, { name: conflictName, description: "feat in B", rulesetId: extB.id });

    await RulesetsMethods.subscribeExtension(session, draft.id, [extA.id, extB.id]);

    const refreshed = await Rulesets.findOne(db, { id: draft.id });
    expect(refreshed?.extensionRulesetIds).toContain(extA.id);
    expect(refreshed?.extensionRulesetIds).toContain(extB.id);
  });

  test("should allow subscribe when a pre-existing collision among already-subscribed extensions doesn't involve the new one", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();

    const conflictName = `Pre-Existing Conflict ${Math.random().toString(36).substr(2, 6)}`;
    const extA = (await Rulesets.create(db, {
      name: `Pre-existing Ext A ${Math.random().toString(36).substr(2, 6)}`,
      description: "Already subscribed",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    const extB = (await Rulesets.create(db, {
      name: `Pre-existing Ext B ${Math.random().toString(36).substr(2, 6)}`,
      description: "Already subscribed",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    await Feats.create(db, { name: conflictName, description: "in A", rulesetId: extA.id });
    await Feats.create(db, { name: conflictName, description: "in B", rulesetId: extB.id });

    const draftRows = await Rulesets.create(db, {
      name: `Carry-over Host ${Math.random().toString(36).substr(2, 6)}`,
      description: "Already has the colliding pair installed",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      extensionRulesetIds: [extA.id, extB.id],
      status: "Draft",
    });
    const draft = draftRows[0];

    const cleanExt = (await Rulesets.create(db, {
      name: `Clean Ext ${Math.random().toString(36).substr(2, 6)}`,
      description: "No name collisions",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    await Feats.create(db, { name: `Clean Feat ${Math.random().toString(36).substr(2, 6)}`, description: "Unique", rulesetId: cleanExt.id });

    await RulesetsMethods.subscribeExtension(session, draft.id, [cleanExt.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(cleanExt.id);
  });

  // ── Subscribe convergence: host has its own COW, extension also COW'd same base ──

  test("subscribe converges host's existing COW with new extension's COW (Case B, single ext)", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();

    const baseFeats = await Feats.findAll((p) => Feats.findManyByRulesetId(db, { rulesetId: base.id }, p));
    const baseFeat = baseFeats.find((f) => f.name === "Toughness")!;

    const extension = (await Rulesets.create(db, {
      name: `Conv-Ext ${Math.random().toString(36).substr(2, 6)}`,
      description: "extension that COW'd Toughness",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    await cowFeatIntoExtension(db, baseFeat.id, extension.id);

    // Host COWs Toughness FIRST, then subscribes — the order that previously
    // left two visible "Toughness" rows (no chain set up at COW time).
    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Conv-Host ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, {
      name: baseFeat.name,
      description: "host edit",
    });
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const list = await FeatsMethods.getRulesetFeats(draft.id, { search: "Toughness" }, { limit: 10, page: 1 });
    expect(list.items.filter((f) => f.name === "Toughness").length).toBe(1);
  });

  test("subscribe converges multi-extension overlap with host COW (Case B, two exts)", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();
    const baseFeats = await Feats.findAll((p) => Feats.findManyByRulesetId(db, { rulesetId: base.id }, p));
    const baseFeat = baseFeats.find((f) => f.name === "Toughness")!;

    const makeExt = async (label: string) => {
      const ext = (await Rulesets.create(db, {
        name: `${label} ${Math.random().toString(36).substr(2, 6)}`,
        description: "x", private: false, baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id, rulesetId: base.id, ancestorRulesetIds: [base.id], kind: "extension", status: "Published",
      }))[0];
      await cowFeatIntoExtension(db, baseFeat.id, ext.id);
      return ext;
    };
    const a = await makeExt("Bm-A");
    const b = await makeExt("Bm-B");

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Bm-Host ${Math.random().toString(36).substr(2, 6)}`, private: false,
    });
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, { name: baseFeat.name, description: "host" });
    await RulesetsMethods.subscribeExtension(session, draft.id, [a.id, b.id]);

    const list = await FeatsMethods.getRulesetFeats(draft.id, { search: "Toughness" }, { limit: 10, page: 1 });
    expect(list.items.filter((f) => f.name === "Toughness").length).toBe(1);
  });

  test("Case B sibling-loser ID resolves to host's COW (stale-pick safety)", async () => {
    // The extension's COW shadow shares the base's name and gets hidden by
    // siblingMap. Anyone holding the now-hidden ID (e.g. a character pick stored
    // before subscribe) must still resolve to the host's COW via idResolveMap —
    // and modifiers attached to that hidden id must appear on the host's COW
    // through compose-time sibling-merge.
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();
    const baseFeats = await Feats.findAll((p) => Feats.findManyByRulesetId(db, { rulesetId: base.id }, p));
    const baseFeat = baseFeats.find((f) => f.name === "Toughness")!;

    const extension = (await Rulesets.create(db, {
      name: `StalePick-Ext ${Math.random().toString(36).substr(2, 6)}`,
      description: "x", private: false, baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id, rulesetId: base.id, ancestorRulesetIds: [base.id], kind: "extension", status: "Published",
    }))[0];
    const extCowId = await cowFeatIntoExtension(db, baseFeat.id, extension.id);
    await Modifiers.create(db, {
      sourceType: "feats", sourceId: extCowId!,
      target: "abilities.constitution.total", value: "2", valueType: "number", operator: "add",
    });

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `StalePick-Host ${Math.random().toString(36).substr(2, 6)}`, private: false,
    });
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, { name: baseFeat.name, description: "host" });
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const draftSnaps = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const hostF1 = draftSnaps.find((s) => s.entityType === "feats")!.forkedEntityId;

    // Stale pick: look up the now-hidden extension COW id — should resolve to hostF1.
    const viaStale = await FeatsMethods.getRulesetFeat(draft.id, extCowId!);
    expect(viaStale.id).toBe(hostF1);

    // Compose-time sibling-merge: extension's modifier appears on host's COW.
    const detail = await FeatsMethods.getRulesetFeat(draft.id, hostF1);
    expect(detail.modifiers.some((m) => m.target === "abilities.constitution.total")).toBe(true);
  });

  test("Case A2 stays correct: subscribe both then host COWs → one visible", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();
    const baseFeats = await Feats.findAll((p) => Feats.findManyByRulesetId(db, { rulesetId: base.id }, p));
    const baseFeat = baseFeats.find((f) => f.name === "Toughness")!;

    const makeExt = async (label: string) => {
      const ext = (await Rulesets.create(db, {
        name: `${label} ${Math.random().toString(36).substr(2, 6)}`,
        description: "x", private: false, baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id, rulesetId: base.id, ancestorRulesetIds: [base.id], kind: "extension", status: "Published",
      }))[0];
      await cowFeatIntoExtension(db, baseFeat.id, ext.id);
      return ext;
    };
    const e1 = await makeExt("A2-e1");
    const e2 = await makeExt("A2-e2");

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `A2-Host ${Math.random().toString(36).substr(2, 6)}`, private: false,
    });
    await RulesetsMethods.subscribeExtension(session, draft.id, [e1.id, e2.id]);
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, { name: baseFeat.name, description: "host" });

    const list = await FeatsMethods.getRulesetFeats(draft.id, { search: "Toughness" }, { limit: 10, page: 1 });
    expect(list.items.filter((f) => f.name === "Toughness").length).toBe(1);
  });

  test("should allow subscribe when the extension only override-edits a base entity (COW shadow shares the base's name)", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();

    const baseFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: base.id }, pagination),
    );
    const baseFeat = baseFeats.find((f) => f.name === "Toughness")!;

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Tombstone Host ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    const extension = (await Rulesets.create(db, {
      name: `COW Override Ext ${Math.random().toString(36).substr(2, 6)}`,
      description: "Override-edits base feat",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];

    // The COW shadow has the same name as the base feat — the scan must
    // recognize it as a snapshot row and skip it, otherwise it would
    // false-positive on (base."Toughness", extension."Toughness").
    await cowFeatIntoExtension(db, baseFeat.id, extension.id);

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(extension.id);
  });

  test("should allow subscribe when extensions share an aptitude name (sibling map dedups at compose)", async () => {
    const { user, session } = await createTestUser();
    const { base } = await findBaseAndExtension();

    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Aptitude Host ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    const sharedAptName = `Shared Aptitude ${Math.random().toString(36).substr(2, 6)}`;
    const extA = (await Rulesets.create(db, {
      name: `Apt Ext A ${Math.random().toString(36).substr(2, 6)}`,
      description: "Has shared aptitude name",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    const extB = (await Rulesets.create(db, {
      name: `Apt Ext B ${Math.random().toString(36).substr(2, 6)}`,
      description: "Has shared aptitude name",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      kind: "extension",
      status: "Published",
    }))[0];
    await Aptitudes.create(db, { name: sharedAptName, rulesetId: extA.id });
    await Aptitudes.create(db, { name: sharedAptName, rulesetId: extB.id });

    await RulesetsMethods.subscribeExtension(session, draft.id, [extA.id, extB.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toEqual(expect.arrayContaining([extA.id, extB.id]));
  });

  test("should reject subscribe by non-owner", async () => {
    const { extension, draft } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    await expect(
      RulesetsMethods.subscribeExtension(otherSession, draft.id, [extension.id]),
    ).rejects.toThrow(ForbiddenError);
  });

  test("should reject subscribe into non-forked (base) ruleset", async () => {
    const { session } = await createTestUser();
    const { extension } = await findBaseAndExtension();

    // Create a standalone (non-forked) draft ruleset
    const standalone = await Rulesets.create(db, {
      name: `Standalone ${Math.random().toString(36).substr(2, 6)}`,
      description: "Not a fork",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: session.userId,
      status: "Draft",
    });

    await expect(
      RulesetsMethods.subscribeExtension(session, standalone[0].id, [extension.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  // ── Unsubscribe validation ───────────────────────────────────────

  test("unsubscribe should reject if not subscribed to extension", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await expect(
      RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id),
    ).rejects.toThrow();
  });

  test("unsubscribe should reject by non-owner", async () => {
    const { session, extension, draft } = await setupDraftFork();
    const { session: otherSession } = await createTestUser();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    await expect(
      RulesetsMethods.unsubscribeExtension(otherSession, draft.id, extension.id),
    ).rejects.toThrow(ForbiddenError);
  });

  test("unsubscribe should reject when a character has picked an extension entity", async () => {
    const { user, session, extension, draft } = await setupDraftFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const races = await Races.create(db, {
      name: "Test Race",
      description: "Test",
      rulesetId: draft.id,
      size: "Medium",
      baseSpeed: 30,
    });
    const characters = await Characters.create(db, {
      name: "Test Character",
      userId: user.id,
      rulesetId: draft.id,
      raceId: races[0].id,
      xp: 0,
      alignment: "Neutral Good",
      age: 25,
      gender: "Male",
      height: "180",
      weight: "75",
    });

    // Pick a feat owned by the extension at character level 1
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    const monkeyGripAptitude = monkeyGrip.featsAptitudesInRules[0];
    const klasses = await Klasses.create(db, {
      name: `Class ${Math.random().toString(36).substr(2, 9)}`,
      description: "Test",
      rulesetId: draft.id,
      hd: 10,
    });
    const klassLevels = await KlassLevels.create(db, {
      klassId: klasses[0].id,
      level: 1,
    });
    const characterLevels = await db.insert(levelsInCharacter).values({
      characterId: characters[0].id,
      klassLevelId: klassLevels[0].id,
      hp: 10,
    }).returning();
    await db.insert(levelFeatsInCharacter).values({
      characterLevelId: characterLevels[0].id,
      featId: monkeyGrip.id,
      aptitudeId: monkeyGripAptitude.aptitudeId,
    });

    await expect(
      RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id),
    ).rejects.toThrow(ConflictError);
  });

  test("unsubscribe should reject when a character has picked a COW shadow of an extension entity", async () => {
    // Edge case: host customized an extension feat (creating a host-owned
    // shadow), then a character picked the shadow. Unsubscribe deletes the
    // shadow, so the pick would be orphaned without this check. The shadow's
    // rulesetId is the host's, so a naive "entity belongs to extension" check
    // would miss it — the helper has to walk EntitySnapshots to catch it.
    const { user, session, extension, draft } = await setupDraftFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Customize an extension feat → creates a host-owned shadow
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    const monkeyGripAptitude = monkeyGrip.featsAptitudesInRules[0];
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "Customized" },
    );

    const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const shadowId = snapshots.find((s) => s.sourceEntityId === monkeyGrip.id)!.forkedEntityId;
    const shadow = await Feats.findOne(db, { id: shadowId });
    expect(shadow!.rulesetId).toBe(draft.id);

    // Set up a character that picks the shadow (not the original extension feat)
    const races = await Races.create(db, {
      name: "Test Race",
      description: "Test",
      rulesetId: draft.id,
      size: "Medium",
      baseSpeed: 30,
    });
    const characters = await Characters.create(db, {
      name: "Test Character",
      userId: user.id,
      rulesetId: draft.id,
      raceId: races[0].id,
      xp: 0,
      alignment: "Neutral Good",
      age: 25,
      gender: "Male",
      height: "180",
      weight: "75",
    });
    const klasses = await Klasses.create(db, {
      name: `Class ${Math.random().toString(36).substr(2, 9)}`,
      description: "Test",
      rulesetId: draft.id,
      hd: 10,
    });
    const klassLevels = await KlassLevels.create(db, {
      klassId: klasses[0].id,
      level: 1,
    });
    const characterLevels = await db.insert(levelsInCharacter).values({
      characterId: characters[0].id,
      klassLevelId: klassLevels[0].id,
      hp: 10,
    }).returning();
    await db.insert(levelFeatsInCharacter).values({
      characterLevelId: characterLevels[0].id,
      featId: shadowId,
      aptitudeId: monkeyGripAptitude.aptitudeId,
    });

    await expect(
      RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id),
    ).rejects.toThrow(ConflictError);
  });

  test("unsubscribe should reject when only an archived character has picked an extension entity", async () => {
    // Per project memory: archived characters keep their picks live so
    // unarchive can restore them. The per-extension in-use check must count
    // them, otherwise unsubscribe + unarchive would resurrect a character
    // with picks pointing at a deleted shadow.
    const { user, session, extension, draft } = await setupDraftFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const races = await Races.create(db, {
      name: "Test Race",
      description: "Test",
      rulesetId: draft.id,
      size: "Medium",
      baseSpeed: 30,
    });
    const characters = await Characters.create(db, {
      name: "Archived Character",
      userId: user.id,
      rulesetId: draft.id,
      raceId: races[0].id,
      xp: 0,
      alignment: "Neutral Good",
      age: 25,
      gender: "Male",
      height: "180",
      weight: "75",
    });

    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    const monkeyGripAptitude = monkeyGrip.featsAptitudesInRules[0];
    const klasses = await Klasses.create(db, {
      name: `Class ${Math.random().toString(36).substr(2, 9)}`,
      description: "Test",
      rulesetId: draft.id,
      hd: 10,
    });
    const klassLevels = await KlassLevels.create(db, {
      klassId: klasses[0].id,
      level: 1,
    });
    const characterLevels = await db.insert(levelsInCharacter).values({
      characterId: characters[0].id,
      klassLevelId: klassLevels[0].id,
      hp: 10,
    }).returning();
    await db.insert(levelFeatsInCharacter).values({
      characterLevelId: characterLevels[0].id,
      featId: monkeyGrip.id,
      aptitudeId: monkeyGripAptitude.aptitudeId,
    });

    await Characters.archive(db, { id: characters[0].id });

    await expect(
      RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id),
    ).rejects.toThrow(ConflictError);
  });

  test("unsubscribe should allow when no character has picked anything from the extension", async () => {
    const { user, session, extension, draft } = await setupDraftFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // A character on the host that doesn't reference the extension at all
    const races = await Races.create(db, {
      name: "Test Race",
      description: "Test",
      rulesetId: draft.id,
      size: "Medium",
      baseSpeed: 30,
    });
    await Characters.create(db, {
      name: "Test Character",
      userId: user.id,
      rulesetId: draft.id,
      raceId: races[0].id,
      xp: 0,
      alignment: "Neutral Good",
      age: 25,
      gender: "Male",
      height: "180",
      weight: "75",
    });

    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);
    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).not.toContain(extension.id);
  });


  // ── Re-subscribe after unsubscribe (round-trip) ─────────────────

  test("re-subscribe after unsubscribe works correctly", async () => {
    const { session, extension, draft } = await setupDraftFork();

    // Subscribe → unsubscribe → re-subscribe
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Should be subscribed again
    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(extension.id);

    // Entities should be visible again
    const result = await FeatsMethods.getRulesetFeats(draft.id, { search: "Monkey Grip" }, { limit: 10, page: 1 });
    expect(result.items.find((f) => f.name === "Monkey Grip")).toBeDefined();

    // Tracking row should be re-created
    const subscribed = await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id });
    expect(subscribed.length).toBe(1);
    expect(subscribed[0].extensionId).toBe(extension.id);
  });

  test("re-subscribe after unsubscribe with prior COW works cleanly", async () => {
    const { session, extension, draft } = await setupDraftFork();

    // Subscribe and COW an entity
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "COW before unsubscribe" },
    );

    // Unsubscribe (cleans up COW)
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    // Re-subscribe
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // The original extension entity should be visible (not the old COW copy)
    const result = await FeatsMethods.getRulesetFeats(draft.id, { search: "Monkey Grip" }, { limit: 10, page: 1 });
    const feat = result.items.find((f) => f.name === "Monkey Grip");
    expect(feat).toBeDefined();
    expect(feat!.rulesetId).toBe(extension.id);
    expect(feat!.description).not.toBe("COW before unsubscribe");

    // No orphan snapshots
    const snaps = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    expect(snaps.some((s) => s.sourceEntityId === monkeyGrip.id)).toBe(false);
  });

  // ── Multiple extensions ──────────────────────────────────────────

  /** Creates a second system extension with unique feats for multi-extension tests. */
  async function createSecondExtension() {
    const { base } = await findBaseAndExtension();

    // Create a system extension (userId: null, forked from base, published)
    const ext2 = (await Rulesets.create(db, {
      name: `Test Extension ${Math.random().toString(36).substr(2, 6)}`,
      description: "Second test extension",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      extensionRulesetIds: [],
      kind: "extension",
      status: "Published",
    }))[0];

    // Add unique feats to it
    const feat1 = (await Feats.create(db, {
      name: `ExtB Feat Alpha ${Math.random().toString(36).substr(2, 4)}`,
      description: "A feat from extension B",
      rulesetId: ext2.id,
    }))[0];
    const feat2 = (await Feats.create(db, {
      name: `ExtB Feat Beta ${Math.random().toString(36).substr(2, 4)}`,
      description: "Another feat from extension B",
      rulesetId: ext2.id,
    }))[0];

    return { ext2, feat1, feat2 };
  }

  test("multiple extensions can be subscribed simultaneously", async () => {
    const { session, extension, draft } = await setupDraftFork();
    const { ext2 } = await createSecondExtension();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.subscribeExtension(session, draft.id, [ext2.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(extension.id);
    expect(updated!.extensionRulesetIds).toContain(ext2.id);
    expect(updated!.extensionRulesetIds.length).toBe(2);

    // Both extensions' feats should be visible
    const resultA = await FeatsMethods.getRulesetFeats(draft.id, { search: "Monkey Grip" }, { limit: 10, page: 1 });
    expect(resultA.items.find((f) => f.name === "Monkey Grip")).toBeDefined();

    const resultB = await FeatsMethods.getRulesetFeats(draft.id, { search: "ExtB Feat" }, { limit: 10, page: 1 });
    expect(resultB.items.length).toBeGreaterThanOrEqual(2);

    // Tracking rows
    const subscribed = await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id });
    expect(subscribed.length).toBe(2);
  });

  test("unsubscribe one of multiple extensions only removes that extension", async () => {
    const { session, extension, draft } = await setupDraftFork();
    const { ext2, feat1 } = await createSecondExtension();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.subscribeExtension(session, draft.id, [ext2.id]);

    // COW entities from both extensions
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "COW from ext A" },
    );
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, feat1.id,
      { name: feat1.name, description: "COW from ext B" },
    );

    // Verify both COWs exist
    const snapsBefore = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    expect(snapsBefore.some((s) => s.sourceEntityId === monkeyGrip.id)).toBe(true);
    expect(snapsBefore.some((s) => s.sourceEntityId === feat1.id)).toBe(true);

    // Unsubscribe only extension A (Complete Warrior)
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    // Extension A should be gone
    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).not.toContain(extension.id);
    expect(updated!.extensionRulesetIds).toContain(ext2.id);

    // Extension A's COW should be cleaned up
    const snapsAfter = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    expect(snapsAfter.some((s) => s.sourceEntityId === monkeyGrip.id)).toBe(false);

    // Extension B's COW should still exist
    expect(snapsAfter.some((s) => s.sourceEntityId === feat1.id)).toBe(true);

    // Extension B's feats should still be visible
    const resultB = await FeatsMethods.getRulesetFeats(draft.id, { search: "ExtB Feat" }, { limit: 10, page: 1 });
    expect(resultB.items.length).toBeGreaterThanOrEqual(2);

    // Extension A's feats should no longer be visible
    const resultA = await FeatsMethods.getRulesetFeats(draft.id, { search: "Monkey Grip" }, { limit: 10, page: 1 });
    expect(resultA.items.find((f) => f.name === "Monkey Grip")).toBeUndefined();
  });

  // ── Fork vs parent independence ──────────────────────────────────

  // ── Single entity detail (getRulesetFeat) ────────────────────────

  test("getRulesetFeat returns extension entity with correct rulesetId", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Get extension feats
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const shockTrooper = extFeats.find((f) => f.name === "Shock Trooper")!;

    // Access via the draft's getRulesetFeat — should resolve through source chain
    const result = await FeatsMethods.getRulesetFeat(draft.id, shockTrooper.id);
    expect(result).toBeDefined();
    expect(result.name).toBe("Shock Trooper");
    expect(result.rulesetId).toBe(extension.id);
  });

  test("getRulesetFeat returns COW copy when accessed by COW copy ID", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;

    // COW it
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "Custom description for detail" },
    );

    // Get the COW copy's ID from the snapshot (this is how the UI navigates: list → detail)
    const snaps = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const cowSnap = snaps.find((s) => s.sourceEntityId === monkeyGrip.id)!;

    // getRulesetFeat with the COW copy's ID should return the modified version
    const result = await FeatsMethods.getRulesetFeat(draft.id, cowSnap.forkedEntityId);
    expect(result.description).toBe("Custom description for detail");
    expect(result.rulesetId).toBe(draft.id);
  });

  test("getRulesetFeat rejects extension entity after unsubscribe", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const shockTrooper = extFeats.find((f) => f.name === "Shock Trooper")!;

    // Unsubscribe
    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);

    // Should throw NotFoundError — entity no longer in source chain
    await expect(
      FeatsMethods.getRulesetFeat(draft.id, shockTrooper.id),
    ).rejects.toThrow(NotFoundError);
  });

  // ── Delete extension entity (COW + archive) ─────────────────────

  test("deleteRulesetFeat on extension entity creates COW then archives", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const buckler = extFeats.find((f) => f.name === "Improved Buckler Defense")!;

    // Delete the extension entity from the draft
    await FeatsMethods.deleteRulesetFeat(session, draft.id, buckler.id);

    // The original extension entity should be untouched
    const original = await Feats.findOne(db, { id: buckler.id });
    expect(original).toBeDefined();
    expect(original!.deletedAt).toBeNull();

    // A snapshot should exist (COW was created before archiving)
    const snaps = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const bucklerSnap = snaps.find((s) => s.sourceEntityId === buckler.id);
    expect(bucklerSnap).toBeDefined();

    // The COW copy should be archived (findOne excludes deleted, so undefined = archived)
    const cowCopy = await Feats.findOne(db, { id: bucklerSnap!.forkedEntityId });
    expect(cowCopy).toBeUndefined();

    // The entity should no longer be visible via the service
    const result = await FeatsMethods.getRulesetFeats(draft.id, { search: "Improved Buckler" }, { limit: 10, page: 1 });
    expect(result.items.find((f) => f.name === "Improved Buckler Defense")).toBeUndefined();
  });

  // ── Subscribe into published ruleset ───────────────────────────────

  test("subscribe into published (non-archived) ruleset works", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.publishRuleset(session, draft.id);

    // Subscribe into published ruleset should work (canSubscribeExtension allows non-archived)
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    expect(updated!.extensionRulesetIds).toContain(extension.id);
  });

  // ── Extension entity count in service layer ──────────────────────

  test("extension entities increase the visible feat count", async () => {
    const { session, extension, draft } = await setupDraftFork();

    const beforeFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: draft.id, ancestorRulesetIds: draft.ancestorRulesetIds }, pagination),
    );
    const countBefore = beforeFeats.length;

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const updated = await Rulesets.findOne(db, { id: draft.id });
    const afterFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: draft.id, ancestorRulesetIds: [...updated!.extensionRulesetIds, ...updated!.ancestorRulesetIds] }, pagination),
    );
    const countAfter = afterFeats.length;

    // CW adds 599 feats (Gnome Giant-slayer's locked-type FE + Darkwood Stalker's
    // Ancient Foe stay as their own lore feats, granting the base variant via
    // `feats.<slug>.possessed` modifiers), 21 are COW overrides = 578 net new.
    expect(countAfter).toBe(countBefore + 578);
  });

  // ── Name conflict with extension entity ──────────────────────────

  test("creating a feat with the same name as an extension entity throws ConflictError", async () => {
    const { session, extension, draft } = await setupDraftFork();
    const c = await seed();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Try to create a feat with the same name as an extension feat
    await expect(
      FeatsMethods.createRulesetFeat(session, draft.id, {
        name: "Monkey Grip",
        description: "My own monkey grip",
        aptitudeIds: [c.aptMap["General"]],
      }),
    ).rejects.toThrow(ConflictError);
  });

  test("creating a feat with a unique name succeeds when extension is subscribed", async () => {
    const { session, draft } = await setupDraftFork();
    const c = await seed();

    const feat = await FeatsMethods.createRulesetFeat(session, draft.id, {
      name: `Unique Feat ${Math.random().toString(36).substr(2, 6)}`,
      description: "A totally unique feat",
      aptitudeIds: [c.aptMap["General"]],
    });
    expect(feat).toBeDefined();
    expect(feat.rulesetId).toBe(draft.id);
  });

  test("COW then create with same name as extension entity is rejected by DB constraint", async () => {
    const { session, extension, draft } = await setupDraftFork();
    const c = await seed();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // COW "Monkey Grip" — creates a snapshot + local copy with name "Monkey Grip" in the draft
    const extFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: extension.id }, pagination),
    );
    const monkeyGrip = extFeats.find((f) => f.name === "Monkey Grip")!;
    await FeatsMethods.updateRulesetFeat(
      session, draft.id, monkeyGrip.id,
      { name: "Monkey Grip", description: "COW'd version" },
    );

    // The service-level conflict check passes (snapshot exists), but the DB unique
    // constraint (rulesetId, name) correctly prevents a duplicate — safe guard
    await expect(
      FeatsMethods.createRulesetFeat(session, draft.id, {
        name: "Monkey Grip",
        description: "A second feat with the same name",
        aptitudeIds: [c.aptMap["General"]],
      }),
    ).rejects.toThrow();
  });

  // ── Publish with extensions ──────────────────────────────────────

  test("publish counts extension entities toward validation requirements", async () => {
    const { session, extension, draft } = await setupDraftFork();

    // Subscribe to extension — it adds feats, which are one of the publish requirements
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Publish should succeed (base + extension provide all required entity types)
    const published = await RulesetsMethods.publishRuleset(session, draft.id);
    expect(published.status).toBe("Published");
  });

  // ── Unsubscribe from published ruleset ─────────────────────────────

  test("unsubscribe from published ruleset is allowed (no characters)", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.publishRuleset(session, draft.id);

    // No characters on this published ruleset — unsubscribe should work.
    // The inUse check protects when characters exist; status alone doesn't gate.
    const result = await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);
    expect(result.unsubscribed).toBe(true);
  });

  test("unsubscribe from archived ruleset is rejected", async () => {
    const { session, extension, base } = await setupDraftFork();

    const archived = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Archived Unsubscribe ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });
    await RulesetsMethods.subscribeExtension(session, archived.id, [extension.id]);
    await RulesetsMethods.publishRuleset(session, archived.id);
    await RulesetsMethods.archiveRuleset(session, archived.id);

    await expect(
      RulesetsMethods.unsubscribeExtension(session, archived.id, extension.id),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  // ── Sibling COW aptitude merging (read path) ───────────────────────

  /**
   * Sets up two extensions that both COW the same base feat, each adding
   * a unique aptitude link, a unique requirement, and a unique modifier.
   * Returns everything needed to test the merge across all endpoints.
   */
  async function setupSiblingCowExtensions() {
    const { base } = await findBaseAndExtension();
    const { session } = await createTestUser();

    // Pick a base feat to COW
    const baseFeats = await Feats.findAll((pagination) =>
      Feats.findManyByRulesetId(db, { rulesetId: base.id }, pagination),
    );
    const baseFeat = baseFeats.find((f) => f.name === "Toughness")!;

    // Create two system extensions
    const extA = (await Rulesets.create(db, {
      name: `Ext A ${Math.random().toString(36).substr(2, 6)}`,
      description: "Extension A",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      extensionRulesetIds: [],
      kind: "extension",
      status: "Published",
    }))[0];

    const extB = (await Rulesets.create(db, {
      name: `Ext B ${Math.random().toString(36).substr(2, 6)}`,
      description: "Extension B",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      extensionRulesetIds: [],
      kind: "extension",
      status: "Published",
    }))[0];

    // Create unique aptitudes for each extension
    const aptA = (await Aptitudes.create(db, {
      name: `Ext A Class Feature ${Math.random().toString(36).substr(2, 4)}`,
      rulesetId: extA.id,
    }))[0];

    const aptB = (await Aptitudes.create(db, {
      name: `Ext B Class Feature ${Math.random().toString(36).substr(2, 4)}`,
      rulesetId: extB.id,
    }))[0];

    // COW the base feat into both extensions
    const cowIdA = await cowFeatIntoExtension(db, baseFeat.id, extA.id);
    const cowIdB = await cowFeatIntoExtension(db, baseFeat.id, extB.id);

    // Add the extension-specific aptitude to each COW copy
    await FeatsAptitudes.create(db, { featId: cowIdA!, aptitudeId: aptA.id });
    await FeatsAptitudes.create(db, { featId: cowIdB!, aptitudeId: aptB.id });

    // Add unique requirements to each COW copy
    const reqA = (await Requirements.create(db, {
      entityId: cowIdA!,
      entityType: "feats",
      level: "standard",
      target: "abilities.strength.total",
      value: "15",
      valueType: "number",
      operator: "greater_than_or_equal",
    }))[0];

    const reqB = (await Requirements.create(db, {
      entityId: cowIdB!,
      entityType: "feats",
      level: "standard",
      target: "abilities.wisdom.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    }))[0];

    // Add unique modifiers to each COW copy
    const modA = (await Modifiers.create(db, {
      sourceId: cowIdA!,
      sourceType: "feats",
      target: "abilities.strength.misc",
      value: "2",
      valueType: "number",
      operator: "add",
    }))[0];

    const modB = (await Modifiers.create(db, {
      sourceId: cowIdB!,
      sourceType: "feats",
      target: "abilities.wisdom.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    }))[0];

    // Create a draft fork and subscribe to both
    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Fork Sibling Merge ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    await RulesetsMethods.subscribeExtension(session, draft.id, [extA.id]);
    await RulesetsMethods.subscribeExtension(session, draft.id, [extB.id]);

    return { base, extA, extB, aptA, aptB, cowIdA, cowIdB, baseFeat, draft, session, reqA, reqB, modA, modB };
  }

  // ── Feat detail: aptitude merge ────────────────────────────────────

  test("getRulesetFeat merges aptitudes from sibling COW copies", async () => {
    const { baseFeat, aptA, aptB, draft } = await setupSiblingCowExtensions();

    const detail = await FeatsMethods.getRulesetFeat(draft.id, baseFeat.id);

    const aptitudeIds = detail.featsAptitudesInRules.map((fa) => fa.aptitudeId);
    expect(aptitudeIds).toContain(aptA.id);
    expect(aptitudeIds).toContain(aptB.id);
  });

  test("getRulesetFeat does not duplicate aptitudes shared across siblings", async () => {
    const { baseFeat, draft } = await setupSiblingCowExtensions();

    const detail = await FeatsMethods.getRulesetFeat(draft.id, baseFeat.id);

    const aptitudeIds = detail.featsAptitudesInRules.map((fa) => fa.aptitudeId);
    const uniqueIds = new Set(aptitudeIds);
    expect(uniqueIds.size).toBe(aptitudeIds.length);
  });

  // ── Feat list: sibling merge ────────────────────────────────────

  test("getRulesetFeats list hides sibling losers and merges aptitudes on winner", async () => {
    const { baseFeat, aptA, aptB, cowIdA, cowIdB, draft } = await setupSiblingCowExtensions();

    const result = await FeatsMethods.getRulesetFeats(draft.id, { search: baseFeat.name }, { limit: 10, page: 1 });
    const matches = result.items.filter((f) => f.name === baseFeat.name);

    // Only one copy visible (losers hidden)
    expect(matches.length).toBe(1);

    // The visible winner should have aptitudes from both extensions
    const aptitudeIds = matches[0].featsAptitudesInRules.map((fa) => fa.aptitudeId);
    expect(aptitudeIds).toContain(aptA.id);
    expect(aptitudeIds).toContain(aptB.id);

    // The list should not contain both COW IDs
    const cowIds = [cowIdA!, cowIdB!];
    const visibleCowIds = cowIds.filter((id) => matches.some((m) => m.id === id));
    expect(visibleCowIds.length).toBeLessThanOrEqual(1);
  });

  // ── Feat detail: requirements + modifiers merge ─────────────────

  test("getRulesetFeat merges requirements from sibling COW copies", async () => {
    const { baseFeat, reqA, reqB, draft } = await setupSiblingCowExtensions();

    const detail = await FeatsMethods.getRulesetFeat(draft.id, baseFeat.id);

    // Should contain requirements from both extensions
    const reqTargets = detail.requirements.map((r) => r.target);
    expect(reqTargets).toContain(reqA.target);
    expect(reqTargets).toContain(reqB.target);
  });

  test("getRulesetFeat merges modifiers from sibling COW copies", async () => {
    const { baseFeat, modA, modB, draft } = await setupSiblingCowExtensions();

    const detail = await FeatsMethods.getRulesetFeat(draft.id, baseFeat.id);

    // Should contain modifiers from both extensions
    const modTargets = detail.modifiers.map((m) => m.target);
    expect(modTargets).toContain(modA.target);
    expect(modTargets).toContain(modB.target);
  });

  // ── Customization endpoints: requirements merge ──────────────────

  test("getEntityRequirements merges requirements from sibling COW copies", async () => {
    const { baseFeat, reqA, reqB, draft } = await setupSiblingCowExtensions();

    const requirements = await RequirementsMethods.getEntityRequirements(draft.id, "feats", baseFeat.id);

    const reqTargets = requirements.map((r) => r.target);
    expect(reqTargets).toContain(reqA.target);
    expect(reqTargets).toContain(reqB.target);
  });

  test("getEntityRequirements does not duplicate requirements shared across siblings", async () => {
    const { baseFeat, draft } = await setupSiblingCowExtensions();

    const requirements = await RequirementsMethods.getEntityRequirements(draft.id, "feats", baseFeat.id);

    // Each requirement key (target|operator|value) should appear at most once
    const keys = requirements
      .filter((r) => r.target)
      .map((r) => `${r.target}|${r.operator}|${r.value}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // ── Customization endpoints: modifiers merge ──────────────────

  test("getEntityModifiers merges modifiers from sibling COW copies", async () => {
    const { baseFeat, modA, modB, draft } = await setupSiblingCowExtensions();

    const modifiers = await ModifiersMethods.getEntityModifiers(draft.id, "feats", baseFeat.id);

    const modTargets = modifiers.map((m) => m.target);
    expect(modTargets).toContain(modA.target);
    expect(modTargets).toContain(modB.target);
  });

  test("getEntityModifiers does not duplicate modifiers shared across siblings", async () => {
    const { baseFeat, draft } = await setupSiblingCowExtensions();

    const modifiers = await ModifiersMethods.getEntityModifiers(draft.id, "feats", baseFeat.id);

    const keys = modifiers.map((m: { target: string; value: string; operator: string; valueType: string }) => `${m.target}|${m.value}|${m.operator}|${m.valueType}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  // ── Write-time sibling bake-in ─────────────────────────────────
  // Regression: FeatsService.updateRulesetFeat must pass extensionRulesetIds
  // to cowEntity so sibling data is merged into the new local COW. Without it,
  // the user's edited feat silently loses every sibling extension's
  // contribution.

  test("updateRulesetFeat bakes in sibling extensions' data on COW", async () => {
    const { baseFeat, aptA, aptB, reqA, reqB, modA, modB, draft, session } = await setupSiblingCowExtensions();

    // Trigger a COW by editing the inherited feat's description. The compose
    // step's siblingMap picks one extension's COW as the "winner" and that's
    // what FeatsService sees as the inherited feat — so the snapshot created
    // here references that winner's COW id, not the base feat id directly.
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, {
      name: baseFeat.name,
      description: "user-edited",
    });

    // Locate the new COW row created by the update — exactly one snapshot
    // for entityType="feats" should exist in the draft.
    const draftSnapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const featSnapshots = draftSnapshots.filter((s) => s.entityType === "feats");
    expect(featSnapshots.length).toBe(1);
    const cowFeatId = featSnapshots[0].forkedEntityId;

    // Aptitude links from BOTH extensions must be present on the new COW
    // (read directly via the repo so we're not seeing the compose-step merge).
    const aptitudeLinks = await FeatsAptitudes.findMany(db, { featId: cowFeatId });
    const aptitudeIds = aptitudeLinks.map((fa) => fa.aptitudeId);
    expect(aptitudeIds).toContain(aptA.id);
    expect(aptitudeIds).toContain(aptB.id);

    // Modifiers from both extensions must be baked in.
    const mods = await Modifiers.findManyBySource(db, { sourceIds: [cowFeatId], sourceType: "feats" });
    const modTargets = mods.map((m) => m.target);
    expect(modTargets).toContain(modA.target);
    expect(modTargets).toContain(modB.target);

    // Standalone (non-OR-chain) sibling requirements must also be baked in.
    const reqs = await Requirements.findManyByEntity(db, { entityIds: [cowFeatId], entityType: "feats" });
    const reqTargets = reqs.map((r) => r.target);
    expect(reqTargets).toContain(reqA.target);
    expect(reqTargets).toContain(reqB.target);
  });

  test("updateRulesetFeat preserves sibling OR-chain structure (not lifted into AND)", async () => {
    // Regression: a sibling extension's OR-chain prereq (e.g. CON≥13 OR INT≥13)
    // used to be either lifted into the target's AND (silently turning "any of"
    // into "all of") or merged into the target's existing OR (conflating two
    // distinct OR groups into one). Now the sibling's OR chain is appended as
    // its OWN OR group at a fresh top-level position — top-level AND combines
    // it with whatever else was on the target.
    //
    // The chain has to live on the LOSER sibling (the one that goes through
    // mergeSiblingData) — the winner is direct-copied including its tree.
    const { baseFeat, cowIdA, cowIdB, draft, session } = await setupSiblingCowExtensions();

    // Determine the winner ahead of time by triggering a no-op COW first.
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, {
      name: baseFeat.name,
      description: "warm-up",
    });
    const probeSnapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const probeSnap = probeSnapshots.find((s) => s.entityType === "feats")!;
    const winner = probeSnap.sourceEntityId === cowIdA ? "A" : "B";
    const loserCowId = winner === "A" ? cowIdB! : cowIdA!;
    await Feats.delete(db, { id: probeSnap.forkedEntityId });
    await EntitySnapshots.deleteBySourceAndRuleset(db, {
      sourceEntityId: probeSnap.sourceEntityId,
      rulesetId: draft.id,
    });

    // Add an OR chain to the loser: root at level "5" plus two leaves
    await Requirements.create(db, {
      entityId: loserCowId,
      entityType: "feats",
      level: "5",
      chainingOperator: "or",
    });
    await Requirements.create(db, {
      entityId: loserCowId,
      entityType: "feats",
      level: "5.1",
      target: "abilities.constitution.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });
    await Requirements.create(db, {
      entityId: loserCowId,
      entityType: "feats",
      level: "5.2",
      target: "abilities.intelligence.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });

    // Trigger the real COW
    await FeatsMethods.updateRulesetFeat(session, draft.id, baseFeat.id, {
      name: baseFeat.name,
      description: "user-edited",
    });

    const draftSnapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const featSnap = draftSnapshots.find((s) => s.entityType === "feats")!;
    const cowFeatId = featSnap.forkedEntityId;

    const reqs = await Requirements.findManyByEntity(db, { entityIds: [cowFeatId], entityType: "feats" });

    // The OR chain IS preserved on the host's COW: there's an OR root with
    // chainingOperator='or' and its two leaves grouped under it. They are
    // NOT lifted into AND (which would happen if we appended them at the
    // top level as standalone reqs).
    const orRoots = reqs.filter((r) => r.chainingOperator === "or" && /^\d+$/.test(r.level));
    expect(orRoots.length).toBe(1);
    const rootLevel = orRoots[0].level;
    const orLeaves = reqs.filter((r) => r.level.startsWith(`${rootLevel}.`) && r.target);
    const orLeafTargets = orLeaves.map((l) => l.target).sort();
    expect(orLeafTargets).toEqual(["abilities.constitution.total", "abilities.intelligence.total"]);

    // No standalone (non-OR-chain) req on the COW with the OR-leaf targets.
    const standalonesWithOrTarget = reqs.filter(
      (r) => !r.chainingOperator
        && !r.level.startsWith(`${rootLevel}.`)
        && (r.target === "abilities.constitution.total" || r.target === "abilities.intelligence.total"),
    );
    expect(standalonesWithOrTarget.length).toBe(0);
  });

  // ── Powers (spells) sibling merge ──────────────────────────────

  /**
   * Sets up two extensions that both COW the same base power (spell), each
   * adding a unique aptitude, requirement, and modifier.
   */
  async function setupSiblingCowPowerExtensions() {
    const { base } = await findBaseAndExtension();
    const { session } = await createTestUser();

    // Pick a base power to COW
    const basePowers = await Powers.findAll((pagination) =>
      Powers.findManyByRulesetId(db, { rulesetId: base.id }, pagination),
    );
    const basePower = basePowers.find((p) => p.name === "Cure Light Wounds")!;

    // Create two system extensions
    const extA = (await Rulesets.create(db, {
      name: `Pwr Ext A ${Math.random().toString(36).substr(2, 6)}`,
      description: "Power Extension A",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      extensionRulesetIds: [],
      kind: "extension",
      status: "Published",
    }))[0];

    const extB = (await Rulesets.create(db, {
      name: `Pwr Ext B ${Math.random().toString(36).substr(2, 6)}`,
      description: "Power Extension B",
      private: false,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      rulesetId: base.id,
      ancestorRulesetIds: [base.id],
      extensionRulesetIds: [],
      kind: "extension",
      status: "Published",
    }))[0];

    // Create unique aptitudes for each extension
    const aptA = (await Aptitudes.create(db, {
      name: `Pwr Ext A Apt ${Math.random().toString(36).substr(2, 4)}`,
      rulesetId: extA.id,
    }))[0];

    const aptB = (await Aptitudes.create(db, {
      name: `Pwr Ext B Apt ${Math.random().toString(36).substr(2, 4)}`,
      rulesetId: extB.id,
    }))[0];

    // COW the base power into both extensions (manual, no cowPowerIntoExtension helper)
    async function cowPowerIntoExtension(powerId: string, extId: string) {
      const [original] = await db.select().from(powersInRules).where(eq(powersInRules.id, powerId));
      const [newPower] = await Powers.create(db, {
        rulesetId: extId,
        name: original.name,
        description: original.description,
        saveId: original.saveId,
        saveEffect: original.saveEffect,
      });
      // Copy aptitude links
      const baseApts = await PowersAptitudes.findMany(db, { powerId });
      if (baseApts.length > 0) {
        await Promise.all(baseApts.map((pa) =>
          PowersAptitudes.create(db, { powerId: newPower.id, aptitudeId: pa.aptitudeId, level: pa.level }),
        ));
      }
      // Create snapshot
      await db.insert(entitySnapshotsInRules).values({
        rulesetId: extId,
        entityType: "powers",
        sourceEntityId: powerId,
        forkedEntityId: newPower.id,
        contentHash: "seed",
      });
      return newPower.id;
    }

    const cowIdA = await cowPowerIntoExtension(basePower.id, extA.id);
    const cowIdB = await cowPowerIntoExtension(basePower.id, extB.id);

    // Add extension-specific aptitude to each COW copy
    await PowersAptitudes.create(db, { powerId: cowIdA, aptitudeId: aptA.id, level: 1 });
    await PowersAptitudes.create(db, { powerId: cowIdB, aptitudeId: aptB.id, level: 1 });

    // Add unique requirements to each COW copy
    const reqA = (await Requirements.create(db, {
      entityId: cowIdA,
      entityType: "powers",
      level: "standard",
      target: "abilities.charisma.total",
      value: "12",
      valueType: "number",
      operator: "greater_than_or_equal",
    }))[0];

    const reqB = (await Requirements.create(db, {
      entityId: cowIdB,
      entityType: "powers",
      level: "standard",
      target: "abilities.intelligence.total",
      value: "14",
      valueType: "number",
      operator: "greater_than_or_equal",
    }))[0];

    // Add unique modifiers to each COW copy
    const modA = (await Modifiers.create(db, {
      sourceId: cowIdA,
      sourceType: "powers",
      target: "abilities.charisma.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    }))[0];

    const modB = (await Modifiers.create(db, {
      sourceId: cowIdB,
      sourceType: "powers",
      target: "abilities.intelligence.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    }))[0];

    // Create a draft fork and subscribe to both
    const draft = await RulesetsMethods.forkRuleset(session, base.id, {
      name: `Fork Power Merge ${Math.random().toString(36).substr(2, 6)}`,
      private: false,
    });

    await RulesetsMethods.subscribeExtension(session, draft.id, [extA.id]);
    await RulesetsMethods.subscribeExtension(session, draft.id, [extB.id]);

    return { base, extA, extB, aptA, aptB, cowIdA, cowIdB, basePower, draft, session, reqA, reqB, modA, modB };
  }

  test("getRulesetPower merges aptitudes from sibling COW copies", async () => {
    const { basePower, aptA, aptB, draft } = await setupSiblingCowPowerExtensions();

    const detail = await PowersMethods.getRulesetPower(draft.id, basePower.id);

    const aptitudeIds = detail.powersAptitudesInRules.map((pa: { aptitudeId: string }) => pa.aptitudeId);
    expect(aptitudeIds).toContain(aptA.id);
    expect(aptitudeIds).toContain(aptB.id);
  });

  test("getRulesetPower merges requirements from sibling COW copies", async () => {
    const { basePower, reqA, reqB, draft } = await setupSiblingCowPowerExtensions();

    const detail = await PowersMethods.getRulesetPower(draft.id, basePower.id);

    const reqTargets = detail.requirements.map((r) => r.target);
    expect(reqTargets).toContain(reqA.target);
    expect(reqTargets).toContain(reqB.target);
  });

  test("getRulesetPower merges modifiers from sibling COW copies", async () => {
    const { basePower, modA, modB, draft } = await setupSiblingCowPowerExtensions();

    const detail = await PowersMethods.getRulesetPower(draft.id, basePower.id);

    const modTargets = detail.modifiers.map((m) => m.target);
    expect(modTargets).toContain(modA.target);
    expect(modTargets).toContain(modB.target);
  });

  test("getRulesetPowers list hides sibling losers and merges aptitudes on winner", async () => {
    const { basePower, aptA, aptB, draft } = await setupSiblingCowPowerExtensions();

    const result = await PowersMethods.getRulesetPowers(draft.id, { search: basePower.name }, { limit: 10, page: 1 });
    const matches = result.items.filter((p: { name: string }) => p.name === basePower.name);

    // Only one copy visible
    expect(matches.length).toBe(1);

    // Winner should have aptitudes from both extensions
    const aptitudeIds = matches[0].powersAptitudesInRules.map((pa: { aptitudeId: string }) => pa.aptitudeId);
    expect(aptitudeIds).toContain(aptA.id);
    expect(aptitudeIds).toContain(aptB.id);
  });

  test("getEntityRequirements for powers merges requirements from sibling COW copies", async () => {
    const { basePower, reqA, reqB, draft } = await setupSiblingCowPowerExtensions();

    const requirements = await RequirementsMethods.getEntityRequirements(draft.id, "powers", basePower.id);

    const reqTargets = requirements.map((r) => r.target);
    expect(reqTargets).toContain(reqA.target);
    expect(reqTargets).toContain(reqB.target);
  });

  test("getEntityModifiers for powers merges modifiers from sibling COW copies", async () => {
    const { basePower, modA, modB, draft } = await setupSiblingCowPowerExtensions();

    const modifiers = await ModifiersMethods.getEntityModifiers(draft.id, "powers", basePower.id);

    const modTargets = modifiers.map((m) => m.target);
    expect(modTargets).toContain(modA.target);
    expect(modTargets).toContain(modB.target);
  });

  // ── Domain aptitude links on COW copies ────────────────────────────

  test("domain spells are visible when filtering by domain aptitude in fork with extension", async () => {
    const { session, extension, draft } = await setupDraftFork();
    const c = await seed();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // "Death Domain Spells" has SRD spells that CW COW'd (e.g. Death Ward).
    // Without domain links on the COW copies, filtering by this aptitude in
    // a fork with CW would return empty results.
    const deathDomainAptId = c.aptMap["Death Domain Spells"];
    expect(deathDomainAptId).toBeDefined();

    const result = await PowersMethods.getRulesetPowers(
      draft.id,
      { aptitudeId: deathDomainAptId },
      { limit: 50, page: 1 },
    );

    expect(result.items.length).toBeGreaterThanOrEqual(9);
    expect(result.items.find((p) => p.name === "Cause Fear")).toBeDefined();
    expect(result.items.find((p) => p.name === "Death Knell")).toBeDefined();
    expect(result.items.find((p) => p.name === "Animate Dead")).toBeDefined();
    expect(result.items.find((p) => p.name === "Wail of the Banshee")).toBeDefined();
  });

  test("domain spells show domain aptitude badge when browsing all spells in fork with extension", async () => {
    const { session, extension, draft } = await setupDraftFork();

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    // Search for a spell that is both in a domain and COW'd by CW.
    // "Animate Dead" is on Death Domain Spells and COW'd by CW.
    const result = await PowersMethods.getRulesetPowers(
      draft.id,
      { search: "Animate Dead" },
      { limit: 10, page: 1 },
    );

    const animateDead = result.items.find((p) => p.name === "Animate Dead");
    expect(animateDead).toBeDefined();

    // The spell should have its domain aptitude link (badge) intact
    const domainLink = animateDead!.powersAptitudesInRules.find(
      (pa) => pa.aptitudesInRule?.name === "Death Domain Spells",
    );
    expect(domainLink).toBeDefined();
  });
});
