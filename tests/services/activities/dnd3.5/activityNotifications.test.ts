import { describe, expect, test } from "bun:test";

import type { Aptitude, Klass, RulesetAbility, Skill } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Activities, Characters, Entities, Notifications, Players, Rulesets } from "@/server/repositories/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { collectNotified } from "@/server/websockets/index.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

type User = Awaited<ReturnType<typeof createTestUser>>;

/** A notification of `type`, from `actor`. */
function note(type: string, actor: User) {
  return `${type} from ${actor.user.id}`;
}

/** What `recipient` was notified of. */
async function inbox(recipient: User) {
  const { items } = await Notifications.findPage(db, { recipientId: recipient.user.id }, { limit: 50, page: 1 });
  return items.map((n) => `${n.type} from ${n.actorId}`).sort();
}

/** A Game Master's campaign with an empty slot, and someone to invite into it. */
async function setup() {
  const [gm, invitee] = await users(2);
  const { campaign } = await createTestCampaign(gm.user.id);
  const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
  const invite = () => inviteToSlot(gm.session, slot, invitee.user.emailAddress);
  return { invitee, invite };
}

async function users(count: number) {
  const created = [];
  for (let i = 0; i < count; i++) created.push(await createTestUser());
  return created;
}

describe("activity notifications", () => {
  describe("of campaign invites", () => {
    test("go to the invitee, and the Game Masters get the answer", async () => {
      const [gm, accepting, rejecting] = await users(3);
      const { campaign } = await createTestCampaign(gm.user.id);
      const invites: Awaited<ReturnType<typeof inviteToSlot>>[] = [];
      for (const invitee of [accepting, rejecting]) {
        const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
        invites.push(await inviteToSlot(gm.session, slot, invitee.user.emailAddress));
        expect(await inbox(invitee)).toEqual([note("createCampaignInvite", gm)]);
      }
      await CampaignInvitesService.acceptInvite(accepting.session, invites[0].id);
      await CampaignInvitesService.rejectInvite(rejecting.session, invites[1].id);

      expect(await inbox(gm)).toEqual([
        note("acceptCampaignInvite", accepting),
        note("rejectCampaignInvite", rejecting),
      ]);
    });

    test("go to nobody for an email without an account, the actor least of all", async () => {
      const [gm] = await users(1);
      const { campaign } = await createTestCampaign(gm.user.id);
      const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
      await inviteToSlot(gm.session, slot, "unknown@nowhere.com");
      expect(await inbox(gm)).toEqual([]);
    });
  });

  // Rulesets and characters take contributors alike: the owner hears of the answers, the contributor of the rest.
  describe.each([
    [
      "ruleset",
      {
        create: async (owner: User) => (await createTestRuleset(owner.user.id)).id,
        invite: (owner: User, rulesetId: string, invitee: User) =>
          ContributorsService.inviteContributor(owner.session, rulesetId, invitee.user.emailAddress, "Editor"),
        accept: ContributorsService.acceptInvite.bind(ContributorsService),
        reject: ContributorsService.rejectInvite.bind(ContributorsService),
        revoke: ContributorsService.revokeContributor.bind(ContributorsService),
        leave: ContributorsService.leaveRuleset.bind(ContributorsService),
        archive: (id: string) => Rulesets.archive(db, { id }),
        prefix: "",
        noun: "ContributorInvite",
        left: "leaveRuleset",
      },
    ],
    [
      "character",
      {
        create: async (owner: User) => (await createTestCharacter(owner.user.id)).id,
        invite: (owner: User, characterId: string, invitee: User) =>
          CharacterContributorsService.inviteContributor(owner.session, characterId, invitee.user.emailAddress),
        accept: CharacterContributorsService.acceptInvite.bind(CharacterContributorsService),
        reject: CharacterContributorsService.rejectInvite.bind(CharacterContributorsService),
        revoke: CharacterContributorsService.revokeContributor.bind(CharacterContributorsService),
        leave: CharacterContributorsService.leaveCharacter.bind(CharacterContributorsService),
        archive: (id: string) => Characters.archive(db, { id }),
        prefix: "Character",
        noun: "CharacterContributorInvite",
        left: "leaveCharacter",
      },
    ],
  ])("of %s contributors", (_, kind) => {
    const invite = `invite${kind.prefix}Contributor`;
    const revoke = `revoke${kind.prefix}Contributor`;

    test("go to the invitee of an invite and a revocation, and to the owner of the answer", async () => {
      const [owner, contributor] = await users(2);
      const id = await kind.create(owner);
      const { id: contributorId } = await kind.invite(owner, id, contributor);
      await kind.accept(contributor.session, contributorId);
      await kind.revoke(owner.session, contributorId);

      expect(await inbox(contributor)).toEqual([note(invite, owner), note(revoke, owner)]);
      expect(await inbox(owner)).toEqual([note(`accept${kind.noun}`, contributor)]);
    });

    test("go to nobody for a revoked invite that was never accepted", async () => {
      const [owner, invitee] = await users(2);
      const id = await kind.create(owner);
      await kind.revoke(owner.session, (await kind.invite(owner, id, invitee)).id);
      expect(await inbox(invitee)).toEqual([note(invite, owner)]);
    });

    // The owner used to be looked up among unarchived rows only, and went unnotified once theirs was archived.
    test.each(["rejects", "leaves"] as const)(
      "go to the owner when a contributor %s, even after archiving",
      async (answer) => {
        const [owner, contributor] = await users(2);
        const id = await kind.create(owner);
        const { id: contributorId } = await kind.invite(owner, id, contributor);
        if (answer === "leaves") await kind.accept(contributor.session, contributorId);
        await kind.archive(id);
        if (answer === "rejects") await kind.reject(contributor.session, contributorId);
        else await kind.leave(contributor.session, id);

        expect(await inbox(owner)).toContain(
          note(answer === "rejects" ? `reject${kind.noun}` : kind.left, contributor),
        );
      },
    );
  });

  test("of a ruleset contributor's role change go to them", async () => {
    const [owner, contributor] = await users(2);
    const ruleset = await createTestRuleset(owner.user.id);
    const { id } = await addRulesetContributor(ruleset.id, contributor.user, owner.user.id);
    await ContributorsService.updateContributorRole(owner.session, id, "Viewer");
    expect(await inbox(contributor)).toEqual([note("updateContributorRole", owner)]);
  });

  test("of a ruleset's content go to its owner and contributors, but not whoever made the change", async () => {
    const [owner, author, other] = await users(3);
    const ruleset = await createTestRuleset(owner.user.id);
    for (const contributor of [author, other]) await addRulesetContributor(ruleset.id, contributor.user, owner.user.id);
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
      name: "General",
      description: "",
      rulesetId: ruleset.id,
    });
    const feat = await EntitiesService.createEntity(author.session, ruleset.id, "feats", {
      name: "Notified Feat",
      description: "",
      aptitudeIds: [aptitude.id],
    });
    await EntitiesService.updateEntity(author.session, ruleset.id, "feats", feat.id, {
      name: "Notified Feat",
      fields: { families: ["Luck"] },
    });
    await EntitiesService.deleteEntity(author.session, ruleset.id, "feats", feat.id);

    const changes = [note("createFeat", author), note("deleteFeat", author), note("updateFeat", author)];
    expect(await inbox(owner)).toEqual(changes);
    expect(await inbox(other)).toEqual(changes);
    expect(await inbox(author)).toEqual([]);
  });

  // A mechanic's create and update used to reach nobody: its ruleset was looked up among the other kinds' tables only.
  test("of a mechanic go to its ruleset's owner", async () => {
    const [owner, author] = await users(2);
    const ruleset = await createTestRuleset(owner.user.id);
    await addRulesetContributor(ruleset.id, author.user, owner.user.id);
    const { id } = await EntitiesService.createEntity(author.session, ruleset.id, "mechanics", {
      name: "Notified Mechanic",
    });
    await EntitiesService.updateEntity(author.session, ruleset.id, "mechanics", id, { name: "Renamed Mechanic" });
    await EntitiesService.deleteEntity(author.session, ruleset.id, "mechanics", id);

    expect(await inbox(owner)).toEqual([
      note("createMechanic", author),
      note("deleteMechanic", author),
      note("updateMechanic", author),
    ]);
  });

  // A class skill's add and remove used to reach nobody: only a create, an update or a delete counted as a change.
  test("of a class skill go to its ruleset's owner", async () => {
    const [owner, author] = await users(2);
    const { id: rulesetId, baseRules } = await createTestRuleset(owner.user.id);
    await addRulesetContributor(rulesetId, author.user, owner.user.id);
    const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Strength",
      description: "",
      rulesetId,
    });
    const [fighter] = await Entities.create<Klass>(db, "classes", {
      name: "Fighter",
      rulesetId,
      fields: { [CLASS_HD]: 10 },
    });
    const [climb] = await Entities.create<Skill>(db, "skills", {
      name: "Climb",
      rulesetId,
      links: { keyAbility: ability.id },
    });
    await EntitiesService.addEntityLink(author.session, rulesetId, "classes", fighter.id, climb.id);
    await EntitiesService.removeEntityLink(author.session, rulesetId, "classes", fighter.id, climb.id);

    expect(await inbox(owner)).toEqual([note("addClassSkill", author), note("removeClassSkill", author)]);
    const { items } = await Activities.findPage(db, { userId: author.user.id }, { limit: 10, page: 1 });
    const recorded = new Map(items.map((activity) => [activity.type, JSON.stringify(activity.data)]));
    expect(Object.fromEntries(recorded)).toEqual({
      addClassSkill: JSON.stringify({ skillId: climb.id, entityName: "Fighter", skillName: "Climb", baseRules }),
      removeClassSkill: JSON.stringify({
        skillId: climb.id,
        rulesetId,
        entityName: "Fighter",
        skillName: "Climb",
        baseRules,
      }),
    });
  });

  test("of a class's levels and its progression go to its ruleset's owner, each its own activity", async () => {
    const [owner, author] = await users(2);
    const { id: rulesetId, baseRules } = await createTestRuleset(owner.user.id);
    await addRulesetContributor(rulesetId, author.user, owner.user.id);
    const [fighter] = await Entities.create<Klass>(db, "classes", {
      name: "Fighter",
      rulesetId,
      fields: { [CLASS_HD]: 10 },
    });
    const level = await EntitiesService.createOwnedEntity(author.session, rulesetId, "classes", fighter.id, {
      level: 1,
      fields: { bab: 1, skills: 2 },
    });
    await EntitiesService.updateOwnedEntity(author.session, rulesetId, "classes", fighter.id, level.id, {
      fields: { bab: 1, skills: 4 },
    });
    await EntitiesService.updateProgression(author.session, rulesetId, "classes", fighter.id, {
      levels: [{ levelId: level.id, fields: { bab: 1, skills: 6 } }],
    });
    await EntitiesService.deleteOwnedEntity(author.session, rulesetId, "classes", fighter.id, level.id);

    expect(await inbox(owner)).toEqual([
      note("createClassLevel", author),
      note("deleteClassLevel", author),
      note("updateClassLevel", author),
      note("updateClassProgression", author),
    ]);
    // What each records, in the order its keys are written: the activity feed reads them
    const { items } = await Activities.findPage(db, { userId: author.user.id }, { limit: 10, page: 1 });
    const recorded = new Map(items.map((activity) => [activity.type, JSON.stringify(activity.data)]));
    expect(Object.fromEntries(recorded)).toEqual({
      createClassLevel: JSON.stringify({ entityName: "Fighter", level: 1, baseRules }),
      updateClassLevel: JSON.stringify({ entityName: "Fighter", level: 1, baseRules }),
      updateClassProgression: JSON.stringify({ entityName: "Fighter", levels: 1, baseRules }),
      deleteClassLevel: JSON.stringify({ rulesetId, entityName: "Fighter", level: 1, baseRules }),
    });
  });

  // The client names a change in its ruleset's words (3.5's `class_levels` a class level), which its base rules pick:
  // every change to a ruleset's content records them, an entity's and what belongs to one alike
  test("of a ruleset's content carry its base rules, as their activities do", async () => {
    const [owner, author] = await users(2);
    const ruleset = await createTestRuleset(owner.user.id);
    await addRulesetContributor(ruleset.id, author.user, owner.user.id);
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
      name: "General",
      description: "",
      rulesetId: ruleset.id,
    });
    const feat = await EntitiesService.createEntity(author.session, ruleset.id, "feats", {
      name: "Worded Feat",
      description: "",
      aptitudeIds: [aptitude.id],
    });
    await EntitiesService.updateEntity(author.session, ruleset.id, "feats", feat.id, {
      name: "Worded Feat",
      fields: { families: ["Luck"] },
    });
    const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Strength",
      description: "",
      rulesetId: ruleset.id,
    });
    const [fighter] = await Entities.create<Klass>(db, "classes", {
      name: "Fighter",
      rulesetId: ruleset.id,
      fields: { [CLASS_HD]: 10 },
    });
    const [climb] = await Entities.create<Skill>(db, "skills", {
      name: "Climb",
      rulesetId: ruleset.id,
      links: { keyAbility: ability.id },
    });
    // Written past the services, after the feat's update read the ruleset's view
    RulesetViews.invalidate(ruleset.id);
    await EntitiesService.addEntityLink(author.session, ruleset.id, "classes", fighter.id, climb.id);
    await EntitiesService.deleteEntity(author.session, ruleset.id, "feats", feat.id);

    const page = { limit: 50, page: 1 };
    const activities = (await Activities.findPage(db, { userId: author.user.id }, page)).items;
    const notifications = (await Notifications.findPage(db, { recipientId: owner.user.id }, page)).items;
    for (const rows of [activities, notifications]) {
      expect(rows.map(({ type, data }) => [type, isRecord(data) && data.baseRules]).sort()).toEqual(
        ["addClassSkill", "createFeat", "deleteFeat", "updateFeat"].map((type) => [type, ruleset.baseRules]),
      );
    }
  });

  test("of a ruleset's content go to nobody when its owner works alone", async () => {
    const [owner] = await users(1);
    const ruleset = await createTestRuleset(owner.user.id);
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
      name: "General",
      description: "",
      rulesetId: ruleset.id,
    });
    await EntitiesService.createEntity(owner.session, ruleset.id, "feats", {
      name: "Unnoticed Feat",
      description: "",
      aptitudeIds: [aptitude.id],
    });
    expect(await inbox(owner)).toEqual([]);
  });
});

// Who the server pushes a new notification to once a request is answered (server/websockets/notifiedUsers.ts)
describe("the users a request notified", () => {
  test("are collected while it runs, through its transaction", async () => {
    const { invitee, invite } = await setup();
    const notified = await collectNotified(async () => {
      await invite();
    });
    expect([...notified]).toEqual([invitee.user.id]);
  });

  test("aren't collected outside a request: another request's are its own", async () => {
    const { invite } = await setup();
    await invite();
    expect([...(await collectNotified(async () => {}))]).toEqual([]);
  });
});
