import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Players } from "@/server/repositories/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { findExportableCharacter } from "@/server/services/characters/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

describe("findExportableCharacter", () => {
  test("answers how the export reads the character's private notes, as its policy says: shown to its exporters", async () => {
    // Its owner, and a bonded creature's master's owner
    const rowan = await findSeededCharacter("Rowan Thornwalker");
    const wolf = await Characters.findOne(db, { parentCharacterId: rowan.id, kind: "animalcompanion" });
    const owner = makeSession(SEED_USER_ID);
    for (const { id } of [rowan, wolf!])
      expect(await findExportableCharacter(owner, id)).toMatchObject({ character: { id }, notes: "show" });

    // A campaign's Game Master and its player, from the campaign
    const { user: gm } = await createTestUser();
    const { user: player } = await createTestUser();
    const { campaign } = await createTestCampaign(gm.id);
    await Players.create(db, { userId: player.id, campaignId: campaign.id, role: "Player Character" });
    const character = await createTestCharacter(player.id);
    await CampaignCharactersService.linkCharacter(makeSession(player.id), campaign.id, character.id, "Private");
    for (const userId of [gm.id, player.id]) {
      expect(await findExportableCharacter(makeSession(userId), character.id, campaign.id)).toMatchObject({
        character: { id: character.id },
        notes: "show",
      });
    }
    // Its Game Master edits it, so exports it from its own sheet too; anyone else exports none of it
    expect(await findExportableCharacter(makeSession(gm.id), character.id)).toMatchObject({ notes: "show" });
    const { user: stranger } = await createTestUser();
    expect(await findExportableCharacter(makeSession(stranger.id), character.id)).toBeNull();
    expect(await findExportableCharacter(makeSession(stranger.id), character.id, campaign.id)).toBeNull();
  });
});
