import { describe, expect, test } from "bun:test";

import { type Feat, type KlassLevel, type Mechanic } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Campaigns,
  CharacterContributors,
  Contributors,
  Entities,
  Invites,
  Modifiers,
  Players,
  Requirements,
} from "@/server/repositories/index.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

function resolve(targetType: string, targetId: string, session: Session = makeSession()) {
  return ActivitiesService.getActivityUrl(session, targetType, targetId);
}

async function resolveAll(targets: string[][], session?: Session) {
  const urls = [];
  for (const [targetType, id] of targets) urls.push(await resolve(targetType, id, session));
  return urls;
}

describe("ActivitiesService.getActivityUrl", () => {
  test("links rulesets, characters and campaigns to their page, archived or not, and accounts nowhere", async () => {
    const { user, session } = await createTestUser();
    const ruleset = await createTestRuleset(user.id, { private: false });
    const character = await createTestCharacter(user.id, { deletedAt: new Date().toISOString() });
    const { campaign } = await createTestCampaign(user.id);
    await Campaigns.archive(db, { id: campaign.id });
    expect(
      await resolveAll(
        [
          ["rulesets", ruleset.id],
          ["characters", character.id],
          ["campaigns", campaign.id],
          ["users", user.id],
          ["sessions", NIL_UUID],
          ["oauth-accounts", NIL_UUID],
        ],
        session,
      ),
    ).toEqual([
      `/rulesets/${ruleset.id}`,
      `/characters/${character.id}`,
      `/campaigns/${campaign.id}`,
      null,
      null,
      null,
    ]);
  });

  test("links a private ruleset to its page for who may read it, and nowhere for anyone else", async () => {
    const { user, session } = await createTestUser();
    const ruleset = await createTestRuleset(user.id);
    expect(await resolve("rulesets", ruleset.id, session)).toBe(`/rulesets/${ruleset.id}`);
    expect(await resolve("rulesets", ruleset.id)).toBeNull();
  });

  test("links a private ruleset's content, customizations and contributors nowhere for who may not read it", async () => {
    const { user, session } = await createTestUser();
    const ruleset = await createTestRuleset(user.id);
    const [feat] = await Entities.create<Feat>(db, "feats", { name: "Secret Feat", rulesetId: ruleset.id });
    const customized = { sourceId: feat.id, sourceType: "feats", target: "combat.bab", value: "1" };
    const [modifier] = await Modifiers.create(db, { ...customized, valueType: "number", operator: "add" });
    const [requirement] = await Requirements.create(db, {
      entityId: feat.id,
      entityType: "feats",
      level: "1",
      target: "abilities.strength.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });
    const [contributor] = await Contributors.create(db, {
      rulesetId: ruleset.id,
      email: "invitee@example.com",
      role: "Editor",
      invitedBy: user.id,
    });

    for (const [targetType, id] of [
      ["feats", feat.id],
      ["modifiers", modifier.id],
      ["requirements", requirement.id],
      ["contributors", contributor.id],
    ]) {
      expect(await resolve(targetType, id, session)).toStartWith(`/rulesets/${ruleset.id}`);
      expect(await resolve(targetType, id)).toBeNull();
    }
  });

  test("links a ruleset's entities to their page, or their customization when they have one", async () => {
    const {
      rulesetId: r,
      featMap,
      spellMap,
      itemMap,
      raceMap,
      skillMap,
      aptMap,
      classMap,
      abilityMap,
    } = await getSeedCtx();
    const fighter = classMap.pc["Fighter"];
    const [mechanic] = await Entities.create<Mechanic>(db, "mechanics", { name: "Linked Mechanic", rulesetId: r });
    const [level] = await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [fighter] });
    for (const [targetType, id, url] of [
      ["feats", featMap["Toughness"], `/rulesets/${r}/feats/${featMap["Toughness"]}/customization`],
      ["spells", spellMap["Magic Missile"], `/rulesets/${r}/spells/${spellMap["Magic Missile"]}/customization`],
      ["items", itemMap["Longsword"], `/rulesets/${r}/items/${itemMap["Longsword"]}/customization`],
      ["races", raceMap.pc["Human"], `/rulesets/${r}/races/${raceMap.pc["Human"]}/customization`],
      ["skills", skillMap["Climb"], `/rulesets/${r}/skills/${skillMap["Climb"]}`],
      ["aptitudes", aptMap["General"], `/rulesets/${r}/aptitudes/${aptMap["General"]}`],
      ["abilities", abilityMap["Strength"], `/rulesets/${r}/abilities/${abilityMap["Strength"]}`],
      ["mechanics", mechanic.id, `/rulesets/${r}/mechanics/${mechanic.id}`],
      ["classes", fighter, `/rulesets/${r}/classes/${fighter}`],
      ["class-levels", level.id, `/rulesets/${r}/classes/${fighter}`],
      // A class skill's activity targets the class.
      ["classSkill", fighter, `/rulesets/${r}/classes/${fighter}/skills`],
    ])
      expect({ targetType, url: await resolve(targetType, id) }).toEqual({ targetType, url });
  });

  test("links a customization to its entity's customization page, on its tab", async () => {
    const { rulesetId: r, featMap, classMap } = await getSeedCtx();
    const [clericLevel] = await Entities.findMany<KlassLevel>(db, {
      entityType: "class-levels",
      ownerIds: [classMap.pc["Cleric"]],
    });
    const [featModifier] = await Modifiers.findMany(db, {
      sourceIds: [featMap["Toughness"]],
      sourceType: "feats",
    });
    const [levelModifier] = await Modifiers.create(db, {
      sourceId: clericLevel.id,
      sourceType: "class-levels",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });
    const [requirement] = await Requirements.findMany(db, {
      entityIds: [featMap["Weapon Focus: Longsword"]],
      entityType: "feats",
    });

    expect(await resolve("modifiers", featModifier.id)).toBe(
      `/rulesets/${r}/feats/${featMap["Toughness"]}/customization/modifiers`,
    );
    expect(await resolve("modifiers", levelModifier.id)).toBe(
      `/rulesets/${r}/class-levels/${clericLevel.id}/customization/modifiers`,
    );
    expect(await resolve("requirements", requirement.id)).toBe(
      `/rulesets/${r}/feats/${featMap["Weapon Focus: Longsword"]}/customization/requirements`,
    );
  });

  test("links a class's customizations to its class page's tab, and a modifier's requirements to the modifier's page", async () => {
    const { rulesetId: r, featMap, classMap } = await getSeedCtx();
    const fighter = classMap.pc["Fighter"];
    const [featModifier] = await Modifiers.findMany(db, { sourceIds: [featMap["Toughness"]], sourceType: "feats" });
    const [classModifier] = await Modifiers.create(db, {
      sourceId: fighter,
      sourceType: "classes",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });
    const requirementOf = async (entityId: string, entityType: string) => {
      const [row] = await Requirements.create(db, {
        entityId,
        entityType,
        level: "1",
        target: "abilities.strength.misc",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      return row;
    };
    const classRequirement = await requirementOf(fighter, "classes");
    const modifierRequirement = await requirementOf(featModifier.id, "modifiers");

    expect(
      await resolveAll([
        ["modifiers", classModifier.id],
        ["requirements", classRequirement.id],
        ["requirements", modifierRequirement.id],
      ]),
    ).toEqual([
      `/rulesets/${r}/classes/${fighter}/modifiers`,
      `/rulesets/${r}/classes/${fighter}/requirements`,
      `/rulesets/${r}/modifiers/${featModifier.id}/customization/requirements`,
    ]);
  });

  test("links nowhere a modifier of a modifier, or a requirement of one, as its notifications reach no ruleset", async () => {
    const { featMap } = await getSeedCtx();
    const [featModifier] = await Modifiers.findMany(db, { sourceIds: [featMap["Toughness"]], sourceType: "feats" });
    // A modifier is an entity's, never another modifier's: a row saying so belongs to none
    const [modifierModifier] = await Modifiers.create(db, {
      sourceId: featModifier.id,
      sourceType: "modifiers",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });
    const [requirement] = await Requirements.create(db, {
      entityId: modifierModifier.id,
      entityType: "modifiers",
      level: "1",
      target: "abilities.strength.misc",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });

    expect(
      await resolveAll([
        ["modifiers", modifierModifier.id],
        ["requirements", requirement.id],
      ]),
    ).toEqual([null, null]);
  });

  test("links a character's inventory and levels to the character, and a campaign's players, invites and characters to the campaign", async () => {
    const { user, session } = await createTestUser();
    const { campaign, player } = await createTestCampaign(user.id);
    const character = await createTestCharacter(user.id);
    await CampaignCharactersService.linkCharacter(session, campaign.id, character.id, "Public");
    const [invite] = await Invites.create(db, { playerId: player.id, email: "invited@example.com" });

    expect(
      await resolveAll(
        [
          ["inventory", character.id],
          ["advancements", character.id],
          ["players", player.id],
          ["invites", invite.id],
          ["player-characters", character.id],
        ],
        session,
      ),
    ).toEqual([
      `/characters/${character.id}`,
      `/characters/${character.id}`,
      `/campaigns/${campaign.id}`,
      `/campaigns/${campaign.id}`,
      `/campaigns/${campaign.id}/characters/${character.id}`,
    ]);
  });

  test("links a campaign, its players, invites and characters nowhere for who isn't in it", async () => {
    const { user, session } = await createTestUser();
    const { campaign, player } = await createTestCampaign(user.id);
    const character = await createTestCharacter(user.id);
    await CampaignCharactersService.linkCharacter(session, campaign.id, character.id, "Public");
    const [invite] = await Invites.create(db, { playerId: player.id, email: "invited@example.com" });
    const { user: removed, session: removedSession } = await createTestUser();
    const [seat] = await Players.create(db, { campaignId: campaign.id, userId: removed.id, role: "Player Character" });
    await Players.delete(db, { id: seat.id });
    const targets = [
      ["campaigns", campaign.id],
      ["players", player.id],
      ["invites", invite.id],
      ["player-characters", character.id],
    ];

    expect(await resolveAll(targets, (await createTestUser()).session)).toEqual([null, null, null, null]);
    expect(await resolveAll(targets, removedSession)).toEqual([null, null, null, null]);
  });

  test("links a campaign invite's pending invitee to the invite, and once they've answered to the campaign they may read", async () => {
    const [gm, invitee] = [await createTestUser(), await createTestUser()];
    const { campaign } = await createTestCampaign(gm.user.id);
    const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
    const [invite] = await Invites.create(db, { playerId: slot.id, userId: invitee.user.id, email: "i@example.com" });

    expect(await resolve("invites", invite.id, invitee.session)).toBe(`/campaign-invite/${invite.id}`);
    expect(await resolve("invites", invite.id, gm.session)).toBe(`/campaigns/${campaign.id}`);
    await Invites.update(db, { status: "Rejected" }, { id: invite.id });
    expect(await resolve("invites", invite.id, invitee.session)).toBeNull();
    await Invites.update(db, { status: "Accepted" }, { id: invite.id });
    await Players.update(db, { userId: invitee.user.id }, { id: slot.id });
    expect(await resolve("invites", invite.id, invitee.session)).toBe(`/campaigns/${campaign.id}`);
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
      "character-contributors",
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
  ] as const)("links a %s contributor", (entityType, targetType, invitePage, create) => {
    test.each([
      ["a pending invitee to their invite", "Pending", "invitee", "invite"],
      ["an active contributor to its page", "Active", "invitee", "page"],
      ["anyone else to its page", "Pending", "owner", "page"],
    ] as const)("%s", async (_, status, viewer, target) => {
      const [owner, invitee] = [await createTestUser(), await createTestUser()];
      const { contributorId, page } = await create(owner.user.id, invitee.user.id, status);
      const session = viewer === "owner" ? owner.session : invitee.session;
      expect(await resolve(targetType, contributorId, session)).toBe(
        target === "invite" ? `${invitePage}/${contributorId}` : page,
      );
    });

    test("to no page once the invitee's access is gone", async () => {
      const [owner, invitee] = [await createTestUser(), await createTestUser()];
      const { contributorId } = await create(owner.user.id, invitee.user.id, "Rejected");
      expect(await resolve(targetType, contributorId, invitee.session)).toEqual({ noAccess: true, entityType });
    });
  });

  test("links nothing for a missing target or a type without pages", async () => {
    for (const targetType of [
      // A character or campaign deleted for good
      "rulesets",
      "characters",
      "inventory",
      "advancements",
      "campaigns",
      "feats",
      "class-levels",
      "classSkill",
      "players",
      "invites",
      "player-characters",
      "contributors",
      "character-contributors",
      "modifiers",
      "requirements",
      "entity-fields",
      "notifications",
    ])
      expect({ targetType, url: await resolve(targetType, NIL_UUID) }).toEqual({ targetType, url: null });
  });

  test("links nothing for a role no entity edits link by link, whose changes no activity records", async () => {
    const { featMap, classMap } = await getSeedCtx();
    const fighter = classMap.pc["Fighter"];
    const [level] = await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [fighter] });
    for (const [targetType, id] of [
      ["listedIn", featMap["Toughness"]],
      ["grants", level.id],
    ])
      expect({ targetType, url: await resolve(targetType, id) }).toEqual({ targetType, url: null });
  });
});
