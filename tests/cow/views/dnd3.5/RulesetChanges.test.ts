import { describe, expect, test } from "bun:test";

import { RulesetChanges } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestRuleset, subscribeTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

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
