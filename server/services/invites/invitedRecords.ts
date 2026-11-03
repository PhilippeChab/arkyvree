/**
 * The records invites are to (a campaign, a character, a ruleset), as their invitee answers them: the session's policy
 * on each invite's record, a page's at once, which an invite's page reads, and what the invitee may do with each of
 * their invites a page of notifications names (`describeInviteAnswers`).
 */

import type { Db } from "@/drizzle/database.ts";
import {
  CharacterContributors,
  Characters,
  Contributors,
  Invites,
  Rulesets,
  Visibility,
} from "@/server/repositories/index.ts";
import { CampaignsPolicy, CharactersPolicy, RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Campaign, Session } from "@/shared/relations.ts";

import { describeInviteAnswers, type InviteAnswers } from "./inviteAnswers.ts";

/** A campaign invite as its read loads it: with its seat's campaign, the seat archived or not. */
interface CampaignInvite {
  id: string;
  playersInCampaign?: { campaignsInCampaign: Campaign } | null;
}

/** The policy of an invite's record, as `describeInviteAnswers` asks it: none for a record gone. */
type RecordPolicy = Parameters<typeof describeInviteAnswers>[0];

/** What the session may do with each invite (`invites`), by id, as its record's policy (`policies`, by invite) says. */
function describeEach(invites: { id: string; status: string }[], policies: Map<string, RecordPolicy>) {
  return new Map<string, InviteAnswers>(
    invites.map((invite) => [invite.id, describeInviteAnswers(policies.get(invite.id), invite)]),
  );
}

/** What the session may do with each of its campaign invites `inviteIds` names, by id: one gone isn't there. */
export async function readCampaignInviteAnswers(db: Db, session: Session, inviteIds: string[]) {
  const invites = await Invites.findManyWithCampaign(db, { ids: inviteIds, userId: session.userId });
  return describeEach(invites, await readCampaignInvitePolicies(db, session, invites));
}

/**
 * The session's policy on each campaign invite's campaign (`invites`, each with its campaign as its read loaded it, its
 * seat archived or not: an answered invite outlives a seat archived since), by invite.
 */
export async function readCampaignInvitePolicies(db: Db, session: Session, invites: CampaignInvite[]) {
  const campaigns = invites.flatMap(({ playersInCampaign }) => playersInCampaign?.campaignsInCampaign ?? []);
  const policies = await CampaignsPolicy.forMany(db, session, campaigns);
  return new Map<string, CampaignsPolicy | undefined>(
    invites.map((invite) => {
      const campaign = invite.playersInCampaign?.campaignsInCampaign;
      return [invite.id, campaign && policies.get(campaign.id)];
    }),
  );
}

/** What the session may do with each of its character invites `contributorIds` names, by id: one gone isn't there. */
export async function readCharacterInviteAnswers(db: Db, session: Session, contributorIds: string[]) {
  const invites = await CharacterContributors.findMany(db, { ids: contributorIds, userId: session.userId });
  return describeEach(invites, await readCharacterInvitePolicies(db, session, invites));
}

/** The session's policy on each character invite's character, archived or not (`invites`), by invite. */
export async function readCharacterInvitePolicies(
  db: Db,
  session: Session,
  invites: { characterId: string; id: string }[],
) {
  const characterIds = invites.map(({ characterId }) => characterId);
  const characters = await Characters.findMany(db, { ids: characterIds }, Visibility.All);
  const policies = await CharactersPolicy.forMany(db, session, characters);
  return new Map<string, CharactersPolicy | undefined>(
    invites.map((invite) => [invite.id, policies.get(invite.characterId)]),
  );
}

/** What the session may do with each of its ruleset invites `contributorIds` names, by id: one gone isn't there. */
export async function readRulesetInviteAnswers(db: Db, session: Session, contributorIds: string[]) {
  const invites = await Contributors.findMany(db, { ids: contributorIds, userId: session.userId });
  return describeEach(invites, await readRulesetInvitePolicies(db, session, invites));
}

/** The session's policy on each ruleset invite's ruleset (`invites`), by invite. */
export async function readRulesetInvitePolicies(
  db: Db,
  session: Session,
  invites: { id: string; rulesetId: string }[],
) {
  const rulesets = await Rulesets.findMany(db, { ids: invites.map(({ rulesetId }) => rulesetId) });
  const policies = await RulesetsPolicy.forMany(db, session, rulesets);
  return new Map<string, RulesetsPolicy | undefined>(
    invites.map((invite) => [invite.id, policies.get(invite.rulesetId)]),
  );
}
