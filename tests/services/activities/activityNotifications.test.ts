import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Activities,
  Aptitudes,
  Characters,
  Klasses,
  Notifications,
  Players,
  Rulesets,
  Skills,
} from "@/server/repositories/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";
import { collectNotified } from "@/server/websockets/index.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

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
      for (const invitee of [accepting, rejecting]) {
        const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
        await inviteToSlot(gm.session, slot, invitee.user.emailAddress);
        expect(await inbox(invitee)).toEqual([note("createCampaignInvite", gm)]);
      }
      const [accepted] = await CampaignInvitesService.getUserInvites(accepting.user.id);
      await CampaignInvitesService.acceptInvite(accepting.session, accepted.id);
      const [rejected] = await CampaignInvitesService.getUserInvites(rejecting.user.id);
      await CampaignInvitesService.rejectInvite(rejecting.session, rejected.id);

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
    const [aptitude] = await Aptitudes.create(db, { name: "General", description: "", rulesetId: ruleset.id });
    const feat = await FeatsService.createFeat(author.session, ruleset.id, {
      name: "Notified Feat",
      description: "",
      aptitudeIds: [aptitude.id],
    });
    await PropertiesService.createProperty(author.session, ruleset.id, "feats", feat.id, {
      type: "NOTE",
      value: "A note",
    });
    await FeatsService.deleteFeat(author.session, ruleset.id, feat.id);

    const changes = [note("createFeat", author), note("createProperty", author), note("deleteFeat", author)];
    expect(await inbox(owner)).toEqual(changes);
    expect(await inbox(other)).toEqual(changes);
    expect(await inbox(author)).toEqual([]);
  });

  // A mechanic's create and update used to reach nobody: its ruleset was looked up among the other kinds' tables only.
  test("of a mechanic go to its ruleset's owner", async () => {
    const [owner, author] = await users(2);
    const ruleset = await createTestRuleset(owner.user.id);
    await addRulesetContributor(ruleset.id, author.user, owner.user.id);
    const { id } = await MechanicsService.createMechanic(author.session, ruleset.id, { name: "Notified Mechanic" });
    await MechanicsService.updateMechanic(author.session, ruleset.id, id, { name: "Renamed Mechanic" });
    await MechanicsService.deleteMechanic(author.session, ruleset.id, id);

    expect(await inbox(owner)).toEqual([
      note("createMechanic", author),
      note("deleteMechanic", author),
      note("updateMechanic", author),
    ]);
  });

  // A class skill's add and remove used to reach nobody: only a create, an update or a delete counted as a change.
  test("of a class skill go to its ruleset's owner", async () => {
    const [owner, author] = await users(2);
    const { id: rulesetId } = await createTestRuleset(owner.user.id);
    await addRulesetContributor(rulesetId, author.user, owner.user.id);
    const [ability] = await Abilities.create(db, { name: "Strength", description: "", rulesetId });
    const [fighter] = await Klasses.create(db, { name: "Fighter", rulesetId, hd: 10 });
    const [climb] = await Skills.create(db, { name: "Climb", rulesetId, primaryAbilityId: ability.id });
    await ClassSkillsService.addClassSkill(author.session, rulesetId, fighter.id, climb.id);
    await ClassSkillsService.removeClassSkill(author.session, rulesetId, fighter.id, climb.id);

    expect(await inbox(owner)).toEqual([note("addKlassSkill", author), note("removeKlassSkill", author)]);
  });

  // The client names a change in its ruleset's words (a 3.5 power is a spell), which its base rules pick: every change to
  // a ruleset's content records them, an entity's and what belongs to one alike
  test("of a ruleset's content carry its base rules, as their activities do", async () => {
    const [owner, author] = await users(2);
    const ruleset = await createTestRuleset(owner.user.id);
    await addRulesetContributor(ruleset.id, author.user, owner.user.id);
    const [aptitude] = await Aptitudes.create(db, { name: "General", description: "", rulesetId: ruleset.id });
    const feat = await FeatsService.createFeat(author.session, ruleset.id, {
      name: "Worded Feat",
      description: "",
      aptitudeIds: [aptitude.id],
    });
    await PropertiesService.createProperty(author.session, ruleset.id, "feats", feat.id, { type: "NOTE", value: "" });
    const [ability] = await Abilities.create(db, { name: "Strength", description: "", rulesetId: ruleset.id });
    const [fighter] = await Klasses.create(db, { name: "Fighter", rulesetId: ruleset.id, hd: 10 });
    const [climb] = await Skills.create(db, { name: "Climb", rulesetId: ruleset.id, primaryAbilityId: ability.id });
    await ClassSkillsService.addClassSkill(author.session, ruleset.id, fighter.id, climb.id);
    await FeatsService.deleteFeat(author.session, ruleset.id, feat.id);

    const page = { limit: 50, page: 1 };
    const activities = (await Activities.findPage(db, { userId: author.user.id }, page)).items;
    const notifications = (await Notifications.findPage(db, { recipientId: owner.user.id }, page)).items;
    for (const rows of [activities, notifications]) {
      expect(rows.map(({ type, data }) => [type, isRecord(data) && data.baseRules]).sort()).toEqual(
        ["addKlassSkill", "createFeat", "createProperty", "deleteFeat"].map((type) => [type, ruleset.baseRules]),
      );
    }
  });

  test("of a ruleset's content go to nobody when its owner works alone", async () => {
    const [owner] = await users(1);
    const ruleset = await createTestRuleset(owner.user.id);
    const [aptitude] = await Aptitudes.create(db, { name: "General", description: "", rulesetId: ruleset.id });
    await FeatsService.createFeat(owner.session, ruleset.id, {
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
