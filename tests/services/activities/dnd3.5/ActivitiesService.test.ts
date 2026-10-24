import { describe, expect, test } from "bun:test";

import { type KlassLevel, type Mechanic } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import {
  CharacterContributors,
  Contributors,
  Entities,
  Invites,
  Modifiers,
  Properties,
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

function resolve(targetTable: string, targetId: string, session: Session = makeSession()) {
  return ActivitiesService.getActivityUrl(session, targetTable, targetId);
}

async function resolveAll(targets: string[][]) {
  const urls = [];
  for (const [table, id] of targets) urls.push(await resolve(table, id));
  return urls;
}

describe("ActivitiesService.getActivityUrl", () => {
  test("links rulesets, characters and campaigns to their page, archived or not, and accounts nowhere", async () => {
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
        ["oauth_accounts", NIL_UUID],
      ]),
    ).toEqual([
      `/rulesets/${ruleset.id}`,
      `/characters/${character.id}`,
      `/campaigns/${campaign.id}`,
      null,
      null,
      null,
    ]);
  });

  test("links a ruleset's entities to their page, or their customization when they have one", async () => {
    const {
      rulesetId: r,
      featMap,
      powerMap,
      itemMap,
      raceMap,
      skillMap,
      aptMap,
      klassMap,
      abilityMap,
    } = await getSeedCtx();
    const fighter = klassMap.pc["Fighter"];
    const [mechanic] = await Entities.create<Mechanic>(db, "mechanics", { name: "Linked Mechanic", rulesetId: r });
    const [level] = await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [fighter] });
    for (const [table, id, url] of [
      ["feats", featMap["Toughness"], `/rulesets/${r}/feats/${featMap["Toughness"]}/customization`],
      ["powers", powerMap["Magic Missile"], `/rulesets/${r}/powers/${powerMap["Magic Missile"]}/customization`],
      ["items", itemMap["Longsword"], `/rulesets/${r}/items/${itemMap["Longsword"]}/customization`],
      ["races", raceMap.pc["Human"], `/rulesets/${r}/races/${raceMap.pc["Human"]}/customization`],
      ["skills", skillMap["Climb"], `/rulesets/${r}/skills/${skillMap["Climb"]}`],
      ["aptitudes", aptMap["General"], `/rulesets/${r}/aptitudes/${aptMap["General"]}`],
      ["abilities", abilityMap["Strength"], `/rulesets/${r}/abilities/${abilityMap["Strength"]}`],
      ["mechanics", mechanic.id, `/rulesets/${r}/mechanics/${mechanic.id}`],
      ["klasses", fighter, `/rulesets/${r}/classes/${fighter}`],
      ["klass_levels", level.id, `/rulesets/${r}/classes/${fighter}`],
      // A class skill's activity targets the class.
      ["klass_skills", fighter, `/rulesets/${r}/classes/${fighter}/skills`],
    ])
      expect({ table, url: await resolve(table, id) }).toEqual({ table, url });
  });

  test("links a customization to its entity's customization page, on its tab", async () => {
    const { rulesetId: r, featMap, itemMap, klassMap } = await getSeedCtx();
    const [clericLevel] = await Entities.findMany<KlassLevel>(db, {
      entityType: "klass_levels",
      ownerIds: [klassMap.pc["Cleric"]],
    });
    const [featModifier] = await Modifiers.findMany(db, {
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
    const [requirement] = await Requirements.findMany(db, {
      entityIds: [featMap["Weapon Focus: Longsword"]],
      entityType: "feats",
    });
    const [property] = await Properties.findMany(db, {
      entityIds: [itemMap["Longsword"]],
      entityType: "items",
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
    // A property is its entity's field, no row of its own: an old activity of one names a row that's gone
    expect(await resolve("properties", property.id)).toBeNull();
  });

  test("links a class's customizations to its class page's tab, and a modifier's requirements to the modifier's page", async () => {
    const { rulesetId: r, featMap, klassMap } = await getSeedCtx();
    const fighter = klassMap.pc["Fighter"];
    const [featModifier] = await Modifiers.findMany(db, { sourceIds: [featMap["Toughness"]], sourceType: "feats" });
    const [classModifier] = await Modifiers.create(db, {
      sourceId: fighter,
      sourceType: "klasses",
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
    const classRequirement = await requirementOf(fighter, "klasses");
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
    ])
      expect({ table, url: await resolve(table, NIL_UUID) }).toEqual({ table, url: null });
  });

  test("links nothing for a join no entity edits link by link, whose changes no activity records", async () => {
    const { featMap, klassMap } = await getSeedCtx();
    const fighter = klassMap.pc["Fighter"];
    const [level] = await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [fighter] });
    for (const [table, id] of [
      ["feats_aptitudes", featMap["Toughness"]],
      ["klass_level_feats", level.id],
    ])
      expect({ table, url: await resolve(table, id) }).toEqual({ table, url: null });
  });
});
