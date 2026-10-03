import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import {
  CharacterContributors,
  Contributors,
  Invites,
  KlassLevels,
  Modifiers,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import type { Session } from "@/shared/relations.ts";
import {
  createTestCampaign,
  createTestCharacter,
  createTestRuleset,
  createTestUser,
  getSeedCtx,
  makeSession,
  NIL_UUID,
} from "@/tests/helpers.ts";

const resolve = (targetTable: string, targetId: string, session: Session = makeSession()) =>
  ActivitiesService.resolveActivityUrl(session, targetTable, targetId);

const resolveAll = (targets: string[][]) => Promise.all(targets.map(([table, id]) => resolve(table, id)));

describe("ActivitiesService.resolveActivityUrl", () => {
  test("links rulesets, characters and campaigns to their page, archived or not, and users and sessions nowhere", async () => {
    const { user } = await createTestUser();
    const ruleset = await createTestRuleset(user.id);
    const character = await createTestCharacter(user.id, { deletedAt: new Date().toISOString() });
    const { campaign } = await createTestCampaign(user.id);
    expect(
      await resolveAll([
        ["rulesets", ruleset.id],
        ["characters", character.id],
        ["campaigns", campaign.id],
        ["users", user.id],
        ["sessions", NIL_UUID],
      ]),
    ).toEqual([`/rulesets/${ruleset.id}`, `/characters/${character.id}`, `/campaigns/${campaign.id}`, null, null]);
  });

  test("links a ruleset's entities to their page, or their customization when they have one", async () => {
    const { rulesetId: r, featMap, powerMap, itemMap, raceMap, skillMap, aptMap, klassMap } = await getSeedCtx();
    const fighter = klassMap.pc["Fighter"];
    const [level] = await KlassLevels.findManyByKlass(db, { klassId: fighter });
    for (const [table, id, url] of [
      ["feats", featMap["Toughness"], `/rulesets/${r}/feats/${featMap["Toughness"]}/customization`],
      ["powers", powerMap["Magic Missile"], `/rulesets/${r}/powers/${powerMap["Magic Missile"]}/customization`],
      ["items", itemMap["Longsword"], `/rulesets/${r}/items/${itemMap["Longsword"]}/customization`],
      ["races", raceMap.pc["Human"], `/rulesets/${r}/races/${raceMap.pc["Human"]}/customization`],
      ["skills", skillMap["Climb"], `/rulesets/${r}/skills/${skillMap["Climb"]}`],
      ["aptitudes", aptMap["General"], `/rulesets/${r}/aptitudes/${aptMap["General"]}`],
      ["klasses", fighter, `/rulesets/${r}/classes/${fighter}`],
      ["klass_levels", level.id, `/rulesets/${r}/classes/${fighter}/levels`],
      // A class skill's activity targets the class.
      ["klass_skills", fighter, `/rulesets/${r}/classes/${fighter}/skills`],
    ])
      expect({ table, url: await resolve(table, id) }).toEqual({ table, url });
  });

  test("links a customization to its entity's customization page", async () => {
    const { rulesetId: r, featMap, itemMap, klassMap } = await getSeedCtx();
    const [clericLevel] = await KlassLevels.findManyByKlass(db, { klassId: klassMap.pc["Cleric"] });
    const [featModifier] = await Modifiers.findManyBySource(db, {
      sourceIds: [featMap["Toughness"]],
      sourceType: "feats",
    });
    const [levelModifier] = await Modifiers.create(db, {
      sourceId: clericLevel.id,
      sourceType: "klass_levels",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });
    const [requirement] = await Requirements.findManyByEntity(db, {
      entityIds: [featMap["Weapon Focus: Longsword"]],
      entityType: "feats",
    });
    const [property] = await Properties.findManyByEntity(db, {
      entityIds: [itemMap["Longsword"]],
      entityType: "items",
    });

    expect(await resolve("modifiers", featModifier.id)).toBe(
      `/rulesets/${r}/feats/${featMap["Toughness"]}/customization`,
    );
    expect(await resolve("modifiers", levelModifier.id)).toBe(
      `/rulesets/${r}/klass_levels/${clericLevel.id}/customization`,
    );
    expect(await resolve("requirements", requirement.id)).toBe(
      `/rulesets/${r}/feats/${featMap["Weapon Focus: Longsword"]}/customization`,
    );
    expect(await resolve("properties", property.id)).toBe(`/rulesets/${r}/items/${itemMap["Longsword"]}/customization`);
  });

  test("links a character's inventory and levels to the character, and a campaign's players, invites and characters to the campaign", async () => {
    const { user, session } = await createTestUser();
    const { campaign, player } = await createTestCampaign(user.id);
    const character = await createTestCharacter(user.id);
    await CampaignCharactersService.linkCharacter(session, campaign.id, character.id, "Public");
    const [invite] = await Invites.create(db, { playerId: player.id, email: "invited@example.com" });

    expect(
      await resolveAll([
        ["inventory", character.id],
        ["levels", character.id],
        ["players", player.id],
        ["invites", invite.id],
        ["player_characters", character.id],
      ]),
    ).toEqual([
      `/characters/${character.id}`,
      `/characters/${character.id}`,
      `/campaigns/${campaign.id}`,
      `/campaigns/${campaign.id}`,
      `/campaigns/${campaign.id}/characters/${character.id}`,
    ]);
  });

  describe.each([
    [
      "ruleset",
      "contributors",
      "/ruleset-contributor-invite",
      async (ownerId: string, userId: string, status: string) => {
        const ruleset = await createTestRuleset(ownerId);
        const [contributor] = await Contributors.create(db, {
          rulesetId: ruleset.id,
          userId,
          email: "invitee@example.com",
          role: "Editor",
          invitedBy: ownerId,
        });
        await Contributors.update(db, { status }, { id: contributor.id });
        return { contributorId: contributor.id, page: `/rulesets/${ruleset.id}` };
      },
    ],
    [
      "character",
      "character_contributors",
      "/character-contributor-invite",
      async (ownerId: string, userId: string, status: string) => {
        const character = await createTestCharacter(ownerId);
        const [contributor] = await CharacterContributors.create(db, {
          characterId: character.id,
          userId,
          email: "invitee@example.com",
          role: "Editor",
          invitedBy: ownerId,
        });
        await CharacterContributors.update(db, { status }, { id: contributor.id });
        return { contributorId: contributor.id, page: `/characters/${character.id}` };
      },
    ],
  ] as const)("links a %s contributor", (entityType, table, invitePage, create) => {
    test.each([
      ["a pending invitee to their invite", "Pending", "invitee", "invite"],
      ["an active contributor to its page", "Active", "invitee", "page"],
      ["anyone else to its page", "Pending", "owner", "page"],
    ] as const)("%s", async (_, status, viewer, target) => {
      const [owner, invitee] = [await createTestUser(), await createTestUser()];
      const { contributorId, page } = await create(owner.user.id, invitee.user.id, status);
      const session = viewer === "owner" ? owner.session : invitee.session;
      expect(await resolve(table, contributorId, session)).toBe(
        target === "invite" ? `${invitePage}/${contributorId}` : page,
      );
    });

    test("to no page once the invitee's access is gone", async () => {
      const [owner, invitee] = [await createTestUser(), await createTestUser()];
      const { contributorId } = await create(owner.user.id, invitee.user.id, "Rejected");
      expect(await resolve(table, contributorId, invitee.session)).toEqual({ noAccess: true, entityType });
    });
  });

  test("links nothing for a missing entity or a table without pages", async () => {
    for (const table of [
      // A character or campaign deleted for good
      "rulesets",
      "characters",
      "inventory",
      "levels",
      "campaigns",
      "feats",
      "klass_levels",
      "klass_skills",
      "players",
      "invites",
      "player_characters",
      "contributors",
      "character_contributors",
      "modifiers",
      "requirements",
      "properties",
      "notifications",
    ]) {
      expect({ table, url: await resolve(table, NIL_UUID) }).toEqual({ table, url: null });
    }
  });
});
