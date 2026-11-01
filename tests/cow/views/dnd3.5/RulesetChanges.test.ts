import { describe, expect, test } from "bun:test";

import { RulesetChanges } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import {
  createSeededTestRuleset,
  createTestRuleset,
  ownerSessionOf,
  subscribeTestRuleset,
} from "@/tests/support/rulesets.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** Whether deleting an entity of a ruleset (`id`, of `type`) can be undone, as its read answers it. */
async function restorable(rulesetId: string, type: RulesetEntityType, id: string) {
  return (await EntitiesService.getEntity(await ownerSessionOf(rulesetId), rulesetId, type, id)).restorableDelete;
}

describe("A ruleset's copies of an extension's entities", () => {
  test("are its snapshots of the extension's live entities, a change or a tombstone: none of another's, none gone", async () => {
    const { user, session } = await createTestUser();
    const { rulesetId, featMap } = await getSeedCtx();
    const extension = await createTestRuleset(user.id, { rulesetId });
    const other = await createTestRuleset(user.id, { rulesetId });
    const host = await createTestRuleset(user.id, { rulesetId });
    await subscribeTestRuleset(host.id, [extension.id, other.id]);
    const language = (name: string, bookId = extension.id) =>
      EntitiesService.createEntity(session, bookId, "languages", {
        name,
        fields: { [LANGUAGE_TYPE]: "Standard" },
      });
    const edit = (id: string, name: string) =>
      EntitiesService.updateEntity(session, host.id, "languages", id, {
        name,
        description: "The host's",
        fields: { [LANGUAGE_TYPE]: "Standard" },
      });
    const [kept, tombstoned, gone] = [await language("Kept"), await language("Tombstoned"), await language("Gone")];
    // A change to one, a copy deleted since of another, and a copy whose source the extension deleted
    const keptCopy = await edit(kept.id, "Kept");
    const tombstonedCopy = await edit(tombstoned.id, "Tombstoned");
    await EntitiesService.deleteEntity(session, host.id, "languages", tombstonedCopy.id);
    await edit(gone.id, "Gone");
    await EntitiesService.deleteEntity(session, extension.id, "languages", gone.id);
    // Copies of the other extension's language and of the core rules' feat, which the extension's unsubscribe leaves
    await edit((await language("Other's", other.id)).id, "Other's");
    await EntitiesService.updateEntity(session, host.id, "feats", featMap["Dodge"], {
      name: "Dodge",
      description: "The host's",
    });

    const copies = await RulesetChanges.copiesOf(db, host.id, extension.id);
    expect(copies.toSorted((a, b) => a.sourceEntityId.localeCompare(b.sourceEntityId))).toEqual(
      [
        { entityType: "languages" as const, forkedEntityId: keptCopy.id, sourceEntityId: kept.id },
        { entityType: "languages" as const, forkedEntityId: tombstonedCopy.id, sourceEntityId: tombstoned.id },
      ].toSorted((a, b) => a.sourceEntityId.localeCompare(b.sourceEntityId)),
    );
  });
});

describe("Whether a delete can be undone from Local Changes, as an entity's read answers it", () => {
  test("is so for a fork's inherited entity and its copy of one, not its own, nor a base's, nor a read-only kind's", async () => {
    const { user, session } = await createTestUser();
    const { rulesetId, featMap, abilityMap } = await getSeedCtx();
    const fork = await createSeededTestRuleset(user.id);
    const copy = await EntitiesService.updateEntity(session, fork.id, "feats", featMap["Dodge"], {
      name: "Dodge",
      description: "The fork's",
    });
    const own = await EntitiesService.createEntity(session, fork.id, "languages", {
      name: `Own ${uniqueId()}`,
      fields: { [LANGUAGE_TYPE]: "Standard" },
    });

    expect([
      await restorable(fork.id, "feats", featMap["Toughness"]),
      await restorable(fork.id, "feats", copy.id),
      await restorable(fork.id, "languages", own.id),
      await restorable(rulesetId, "feats", featMap["Toughness"]),
      await restorable(fork.id, "abilities", abilityMap["Strength"]),
    ]).toEqual([true, true, false, false, false]);
  });

  test("is not so for a copy whose source its extension deleted: the fork's own", async () => {
    const { user, session } = await createTestUser();
    const { rulesetId } = await getSeedCtx();
    const extension = await createTestRuleset(user.id, { rulesetId });
    const host = await createTestRuleset(user.id, { rulesetId });
    await subscribeTestRuleset(host.id, [extension.id]);
    const source = await EntitiesService.createEntity(session, extension.id, "languages", {
      name: `Gone ${uniqueId()}`,
      fields: { [LANGUAGE_TYPE]: "Standard" },
    });
    const copy = await EntitiesService.updateEntity(session, host.id, "languages", source.id, {
      name: source.name,
      description: "The host's",
      fields: { [LANGUAGE_TYPE]: "Standard" },
    });
    expect(await restorable(host.id, "languages", copy.id)).toBe(true);

    await EntitiesService.deleteEntity(session, extension.id, "languages", source.id);
    expect(await restorable(host.id, "languages", copy.id)).toBe(false);
  });

  test("is an owned entity's owner's: a level of an inherited class, not of the fork's own", async () => {
    const { user, session } = await createTestUser();
    const { classMap } = await getSeedCtx();
    const fork = await createSeededTestRuleset(user.id);
    const levelOf = async (classId: string) =>
      (await EntitiesService.getOwnedEntities(session, fork.id, "classes", classId))[0].id;
    const owned = async (levelId: string) =>
      (await EntitiesService.getOwnedEntityWithOwner(session, fork.id, "classes", levelId)).restorableDelete;
    const own = await EntitiesService.createEntity(session, fork.id, "classes", { name: `Own ${uniqueId()}` });
    await EntitiesService.createOwnedEntity(session, fork.id, "classes", own.id, { position: 1 });

    expect([await owned(await levelOf(classMap.pc["Fighter"])), await owned(await levelOf(own.id))]).toEqual([
      true,
      false,
    ]);
  });
});
