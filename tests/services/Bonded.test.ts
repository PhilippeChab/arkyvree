import { db } from "@/server/database/index.ts";
import { CharacterContributors, Characters, Players, Users } from "@/server/repositories/index.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { CharacterContributorsMethods } from "@/server/services/CharacterContributorsService.ts";
import { PlayerCharactersMethods } from "@/server/services/campaigns/CharactersService.ts";
import { CampaignsMethods } from "@/server/services/CampaignsService.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { makeSession, makeWizard, makeWizardWithFamiliar } from "@/tests/bondedFixtures.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { describe, expect, test } from "bun:test";

const session = makeSession;

async function makeUser(prefix: string) {
  const uniq = Math.random().toString(36).slice(2, 11);
  const [user] = await Users.create(db, {
    username: `${prefix}-${uniq}`,
    emailAddress: `${prefix}-${uniq}@example.com`,
    password: "password1234",
  });
  return { user, session: session(user.id) };
}

async function addActiveContributor(characterId: string, ownerId: string, contributorUserId: string) {
  const user = (await Users.findOne(db, { id: contributorUserId }))!;
  const [row] = await CharacterContributors.create(db, {
    characterId, email: user.emailAddress, role: "Editor", invitedBy: ownerId, userId: contributorUserId,
  });
  await CharacterContributors.update(db, { status: "Active" }, { id: row.id });
}

describe("Bonded — createCharacter race-kind guard", () => {
  test("rejects a familiar race for PC creation", async () => {
    const ctx = await getSeedContext(db);
    const { session } = await makeUser("racekind");
    await expect(
      CharactersMethods.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.familiar["Cat"],
        name: "Cat PC",
        xp: 0, alignment: "True Neutral", abilities: {},
        age: 1, gender: "Other", height: "0.3 m", weight: "5 kg",
      }),
    ).rejects.toThrow(BadRequestError);
  });
});

describe("Bonded — level-up class-kind guard", () => {
  test("rejects the Familiar class on a PC level-up", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makeWizard("Klasskind PC", ctx);
    await expect(
      addOneLevel(
        session(SEED_USER_ID), masterId, ctx.klassMap.familiar["Familiar"], 1, 4, null,
        {}, {}, {},
      ),
    ).rejects.toThrow(BadRequestError);
  });
});

describe("Bonded — getCharacter", () => {
  test("PC fetch returns bondedByKind.familiar when a familiar is picked", async () => {
    const { masterId } = await makeWizardWithFamiliar("Get Wizard W/Fam");
    const result = await CharactersMethods.getCharacter(session(SEED_USER_ID), masterId);
    expect(result.bondedByKind.familiar).toBeDefined();
    expect(result.bondedByKind.familiar!.record.kind).toBe("familiar");
  });

  test("PC fetch returns empty bondedByKind when no familiar", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makeWizard("Get Wizard Plain", ctx);
    const result = await CharactersMethods.getCharacter(session(SEED_USER_ID), masterId);
    expect(result.bondedByKind.familiar).toBeUndefined();
  });

  test("bonded id fetch returns the bonded as the character with empty bondedByKind", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Get Bonded Direct");
    const result = await CharactersMethods.getCharacter(session(SEED_USER_ID), familiarId);
    expect(result.character.id).toBe(familiarId);
    expect(result.character.kind).toBe("familiar");
    expect(Object.keys(result.bondedByKind)).toHaveLength(0);
  });

  test("bonded id fetch by a non-member 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Get Bonded NonOwner");
    const { session: outsider } = await makeUser("outsider");
    await expect(
      CharactersMethods.getCharacter(outsider, familiarId),
    ).rejects.toThrow(NotFoundError);
  });

  test("bonded id fetch by an active contributor succeeds", async () => {
    const { masterId, familiarId } = await makeWizardWithFamiliar("Get Bonded Contributor");
    const { user, session: contribSession } = await makeUser("contributor");
    await addActiveContributor(masterId, SEED_USER_ID, user.id);
    const result = await CharactersMethods.getCharacter(contribSession, familiarId);
    expect(result.character.id).toBe(familiarId);
  });

  test("PC fetch composes its familiar when the master is archived", async () => {
    const { masterId } = await makeWizardWithFamiliar("Get Archived Master");
    await CharactersMethods.archiveCharacter(session(SEED_USER_ID), masterId);
    const result = await CharactersMethods.getCharacter(session(SEED_USER_ID), masterId);
    expect(result.bondedByKind.familiar).toBeDefined();
  });

  test("bonded fetch composes when its master is archived", async () => {
    const { masterId, familiarId } = await makeWizardWithFamiliar("Get Bonded Archived Master");
    await CharactersMethods.archiveCharacter(session(SEED_USER_ID), masterId);
    const result = await CharactersMethods.getCharacter(session(SEED_USER_ID), familiarId);
    expect(result.character.id).toBe(familiarId);
  });
});

describe("Bonded — updateCharacter fallback", () => {
  test("owner can rename a familiar", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Update Owner");
    await CharactersMethods.updateCharacter(session(SEED_USER_ID), familiarId, { name: "Whiskers" });
    const after = (await Characters.findOne(db, { id: familiarId }))!;
    expect(after.name).toBe("Whiskers");
  });

  test("contributor can rename a familiar", async () => {
    const { masterId, familiarId } = await makeWizardWithFamiliar("Update Contributor");
    const { user, session: contribSession } = await makeUser("contrib2");
    await addActiveContributor(masterId, SEED_USER_ID, user.id);
    await CharactersMethods.updateCharacter(contribSession, familiarId, { name: "Mittens" });
    const after = (await Characters.findOne(db, { id: familiarId }))!;
    expect(after.name).toBe("Mittens");
  });

  test("non-member update 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Update Outsider");
    const { session: outsider } = await makeUser("outsider2");
    await expect(
      CharactersMethods.updateCharacter(outsider, familiarId, { name: "Nope" }),
    ).rejects.toThrow(NotFoundError);
  });

  test("update on familiar of archived master 404s", async () => {
    const { masterId, familiarId } = await makeWizardWithFamiliar("Update Archived");
    await CharactersMethods.archiveCharacter(session(SEED_USER_ID), masterId);
    await expect(
      CharactersMethods.updateCharacter(session(SEED_USER_ID), familiarId, { name: "Ghost" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("Bonded — enqueuePdf fallback", () => {
  test("owner can queue a PDF for a familiar", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Pdf Owner");
    await CharactersMethods.enqueuePdf(session(SEED_USER_ID), familiarId);
  });

  test("PDF on familiar of archived master 404s", async () => {
    const { masterId, familiarId } = await makeWizardWithFamiliar("Pdf Archived");
    await CharactersMethods.archiveCharacter(session(SEED_USER_ID), masterId);
    await expect(
      CharactersMethods.enqueuePdf(session(SEED_USER_ID), familiarId),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("Bonded — getSharedCharacter exposes bonded entries", () => {
  test("shared payload includes bondedByKind.familiar", async () => {
    const { masterId } = await makeWizardWithFamiliar("Shared Bonded");
    const updated = await CharactersMethods.generateShareToken(session(SEED_USER_ID), masterId);
    const result = await CharactersMethods.getSharedCharacter(updated.shareToken!);
    expect(result.bondedByKind.familiar).toBeDefined();
  });
});

describe("Bonded — direct API guards reject bonded ids", () => {
  test("archiveCharacter on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Archive");
    await expect(
      CharactersMethods.archiveCharacter(session(SEED_USER_ID), familiarId),
    ).rejects.toThrow(NotFoundError);
  });

  test("unarchiveCharacter on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Unarchive");
    await expect(
      CharactersMethods.unarchiveCharacter(session(SEED_USER_ID), familiarId),
    ).rejects.toThrow(NotFoundError);
  });

  test("generateShareToken on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Share Gen");
    await expect(
      CharactersMethods.generateShareToken(session(SEED_USER_ID), familiarId),
    ).rejects.toThrow(NotFoundError);
  });

  test("revokeShareToken on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Share Revoke");
    await expect(
      CharactersMethods.revokeShareToken(session(SEED_USER_ID), familiarId),
    ).rejects.toThrow(NotFoundError);
  });

  test("CharacterContributors.getContributors on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Contributors Get");
    await expect(
      CharacterContributorsMethods.getContributors(
        session(SEED_USER_ID), familiarId, {}, { limit: 10, page: 1 },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  test("CharacterContributors.inviteContributor on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Contributors Invite");
    await expect(
      CharacterContributorsMethods.inviteContributor(
        session(SEED_USER_ID), familiarId, "anyone@example.com",
      ),
    ).rejects.toThrow(NotFoundError);
  });

  test("CharacterContributors.leaveCharacter on a bonded id 404s", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Guard Contributors Leave");
    await expect(
      CharacterContributorsMethods.leaveCharacter(session(SEED_USER_ID), familiarId),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("Bonded — race skill totals match SRD verbatim", () => {
  test("Cat familiar on-sheet skills match the SRD Cat stat block", async () => {
    const { familiarId } = await makeWizardWithFamiliar("Cat SRD Skills", "Cat Familiar");
    const DetailedCharacterFamiliar = (
      await import("@/server/rulesets/dnd3.5/DetailedCharacterFamiliar.ts")
    ).default;
    const cat = (await Characters.findOne(db, { id: familiarId }))!;
    const detailed = new DetailedCharacterFamiliar(cat);
    await detailed.build();
    const skills = detailed.getDetailedCharacterSkills().getSkills();
    // SRD Cat: Balance +10, Climb +6, Hide +12, Jump +10, Listen +3, Move Silently +8, Spot +3
    expect(skills["balance"]?.total).toBe(10);
    expect(skills["climb"]?.total).toBe(6);
    expect(skills["hide"]?.total).toBe(12);
    expect(skills["jump"]?.total).toBe(10);
    expect(skills["listen"]?.total).toBe(3);
    expect(skills["movesilently"]?.total).toBe(8);
    expect(skills["spot"]?.total).toBe(3);
    expect(skills["hide"]?.size).toBe(8); // Tiny size mod baked into the SRD total above

    // Compose-side size adjustments for Cat (Tiny): AC +2, weapon +2, no -1.
    const combat = detailed.getDetailedCharacterCombat().getCombat();
    expect(combat.ac.size).toBe(2);
    expect(combat.ac.total).toBe(combat.ac.base + combat.ac.armor + combat.ac.shield + combat.ac.dexterity + combat.ac.natural + combat.ac.deflection + combat.ac.size + combat.ac.misc);
    const claws = combat.weaponsets["0"]?.mainhand ?? combat.weaponsets["0"]?.offhand;
    if (claws) expect(claws.tohit.size).toBe(2);
  });
});

describe("Bonded — campaign character GET emits bonded", () => {
  test("owner sees bonded.familiar on a Public link", async () => {
    const ctx = await getSeedContext(db);
    const { masterId } = await makeWizardWithFamiliar("Campaign Bonded");
    const ownerSession = session(SEED_USER_ID);
    const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
      name: `Bonded Campaign ${Math.random().toString(36).slice(2, 8)}`,
      description: "test",
      rulesetId: ctx.rulesetId,
    });
    await PlayerCharactersMethods.linkCharacter(ownerSession, campaign.id, masterId, "Public");
    const result = await PlayerCharactersMethods.getCampaignCharacter(ownerSession, campaign.id, masterId);
    expect(result.bondedByKind?.familiar).toBeDefined();
  });

  test("Partial visibility for an incidental viewer hides bonded", async () => {
    const ctx = await getSeedContext(db);
    const { masterId } = await makeWizardWithFamiliar("Campaign Partial");
    const ownerSession = session(SEED_USER_ID);
    const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
      name: `Partial Campaign ${Math.random().toString(36).slice(2, 8)}`,
      description: "test",
      rulesetId: ctx.rulesetId,
    });
    await PlayerCharactersMethods.linkCharacter(ownerSession, campaign.id, masterId, "Partial");

    const { user: viewer, session: viewerSession } = await makeUser("viewer");
    await Players.create(db, { userId: viewer.id, campaignId: campaign.id, role: "Player Character" });

    const result = await PlayerCharactersMethods.getCampaignCharacter(viewerSession, campaign.id, masterId);
    expect(Object.keys(result.bondedByKind ?? {})).toHaveLength(0);
  });
});
