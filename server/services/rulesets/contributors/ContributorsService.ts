import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Contributors, type Pagination, Users } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { toPublicUser } from "@/server/services/authentication/index.ts";
import {
  checkNewContributor,
  describeInviteAnswers,
  getInviteNames,
  getOwnInvite,
  readRulesetInvitePolicies,
  saveInviteAnswer,
  withInviteRefusal,
} from "@/server/services/invites/index.ts";
import { isAllowed, type RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withContributorsRuleset, withLockedRuleset } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { CONTRIBUTOR_ROLES, type ContributorRole } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

/** What a contributor the session may not read is refused with, as an unknown one is. */
const CONTRIBUTOR_NOT_FOUND = "Contributor not found";
/** What an invite the session's user can't answer, or see, is refused with: it doesn't reveal whether it exists. */
const INVITE_NOT_FOUND = "Contributor invite not found";

class ContributorsService {
  /** The invitee's answer, which its ruleset's managers are told of. */
  private async answerInvite(tx: Db, session: Session, contributorId: string, status: "Active" | "Rejected") {
    return await saveInviteAnswer(tx, session, Contributors, contributorId, status, {
      targetType: TARGET_TYPES.contributors,
      type: status === "Active" ? "acceptContributorInvite" : "rejectContributorInvite",
      data: { contributorId },
    });
  }

  /**
   * A contributor of the ruleset whose policy the session holds (`policy`, which decides what the session may do to
   * it), read under the ruleset's lock: one of a ruleset the session may not read is refused as an unknown one is, so
   * a private ruleset's existence isn't revealed.
   */
  private async getReadableContributor(tx: Db, policy: RulesetsPolicy, contributorId: string) {
    const contributor = await Contributors.findOne(tx, { id: contributorId });
    if (!contributor || !policy.isReadable()) throw new NotFoundError(CONTRIBUTOR_NOT_FOUND);
    return contributor;
  }

  async acceptInvite(session: Session, contributorId: string) {
    return await withContributorsRuleset(
      session,
      contributorId,
      async (tx, policy) => {
        const contributor = await getOwnInvite(tx, session, Contributors, contributorId, INVITE_NOT_FOUND);
        policy.canAcceptInvite(contributor);

        return await this.answerInvite(tx, session, contributor.id, "Active");
      },
      // The invitee's account, locked shared before the ruleset: it waits for that account's deletion
      { account: { userId: session.userId }, notFound: INVITE_NOT_FOUND },
    );
  }

  async getContributors(
    session: Session,
    rulesetId: string,
    where: {
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: Pagination,
  ) {
    const { policy, ruleset } = await getReadableRuleset(db, session, rulesetId);
    policy.canReadContributors();

    const paginated = await Contributors.findPage(db, { rulesetId, ...where }, pagination);
    const ownerUser = ruleset.userId ? await Users.findOne(db, { id: ruleset.userId }) : undefined;
    // Each with what the session may do to it, as the policy decides: remove it, and the roles it may give it
    const items = paginated.items.map((contributor) => {
      const { role: from, status } = contributor;
      return {
        ...contributor,
        canRemove: isAllowed(() => policy.canRevokeContributor({ role: from, status })),
        roles: CONTRIBUTOR_ROLES.filter((to) => isAllowed(() => policy.canUpdateContributorRole({ from, status, to }))),
      };
    });
    return { ...paginated, items, owner: ownerUser ? toPublicUser(ownerUser) : null };
  }

  /**
   * The session's invite, whatever its status, so a stale link still says what became of it, and what it may do with
   * it, as the ruleset's policy answers it (`describeInviteAnswers`: whether it may accept it and why not, and still answer it).
   */
  async getInvite(session: Session, contributorId: string) {
    const invite = await Contributors.findOneWithRuleset(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError(INVITE_NOT_FOUND);

    const policy = (await readRulesetInvitePolicies(db, session, [invite])).get(invite.id);
    return { ...invite, ...describeInviteAnswers(policy, invite) };
  }

  async inviteContributor(session: Session, rulesetId: string, email: string, role: ContributorRole) {
    const { contributor, emailData } = await withLockedRuleset(
      session,
      rulesetId,
      async (tx, policy, ruleset) => {
        const user = await Users.findOne(tx, { emailAddress: email });
        policy.canInviteContributors({ invitee: user, role });

        await checkNewContributor(tx, Contributors, { rulesetId }, user, email);

        const rows = await withInviteRefusal(() =>
          Contributors.create(tx, {
            rulesetId,
            email,
            role,
            invitedBy: session.userId,
            userId: user?.id,
          }),
        );
        const contributor = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: contributor.id,
          targetType: TARGET_TYPES.contributors,
          type: "inviteContributor",
          data: { email, role, rulesetId, rulesetName: ruleset.name },
        });

        const names = await getInviteNames(tx, session, user, email);

        return {
          contributor,
          emailData: {
            email,
            ...names,
            rulesetName: ruleset.name,
            role,
            contributorId: contributor.id,
          },
        };
        // The invitee's account, if the address has one, locked shared before the ruleset: an account's deletion waits
        // for the invite or is seen by it
      },
      { account: { email } },
    );

    emailService.send({
      to: emailData.email,
      subject: `You've been invited to contribute to ${emailData.rulesetName}`,
      template: EmailTemplate.ContributorInvitation,
      props: {
        inviteeName: emailData.inviteeName,
        inviterName: emailData.inviterName,
        rulesetName: emailData.rulesetName,
        role: emailData.role,
        contributorId: emailData.contributorId,
      },
    });

    return contributor;
  }

  async leaveRuleset(session: Session, rulesetId: string) {
    return await withLockedRuleset(session, rulesetId, async (tx, policy) => {
      policy.canLeave();

      // Its active row, which its policy read under the ruleset's lock
      const contributor = await Contributors.findOne(tx, { rulesetId, userId: session.userId, status: "Active" });
      if (!contributor) throw new NotFoundError("You are not a contributor of this ruleset");

      const rows = await Contributors.update(tx, { status: "Revoked" }, { id: contributor.id });
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetType: TARGET_TYPES.contributors,
        type: "leaveRuleset",
        data: { rulesetId },
      });

      return updated;
    });
  }

  async rejectInvite(session: Session, contributorId: string) {
    return await withContributorsRuleset(
      session,
      contributorId,
      async (tx, policy) => {
        const contributor = await getOwnInvite(tx, session, Contributors, contributorId, INVITE_NOT_FOUND);
        policy.canAnswerInvite(contributor);

        return await this.answerInvite(tx, session, contributor.id, "Rejected");
      },
      { notFound: INVITE_NOT_FOUND },
    );
  }

  async revokeContributor(session: Session, rulesetId: string, contributorId: string) {
    return await withContributorsRuleset(
      session,
      contributorId,
      async (tx, policy, ruleset) => {
        const contributor = await this.getReadableContributor(tx, policy, contributorId);
        policy.canRevokeContributor({ role: contributor.role, status: contributor.status });

        const prevStatus = contributor.status;
        const rows = await Contributors.update(tx, { status: "Revoked" }, { id: contributorId });
        const updated = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: updated.id,
          targetType: TARGET_TYPES.contributors,
          type: "revokeContributor",
          // Its notification names the ruleset it no longer contributes to
          data: { contributorId, prevStatus, rulesetName: ruleset.name },
        });

        return updated;
      },
      { notFound: CONTRIBUTOR_NOT_FOUND, rulesetId },
    );
  }

  async updateContributorRole(session: Session, rulesetId: string, contributorId: string, role: ContributorRole) {
    return await withContributorsRuleset(
      session,
      contributorId,
      async (tx, policy) => {
        const contributor = await this.getReadableContributor(tx, policy, contributorId);
        policy.canUpdateContributorRole({ from: contributor.role, status: contributor.status, to: role });

        const rows = await Contributors.update(tx, { role }, { id: contributorId });
        const updated = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: updated.id,
          targetType: TARGET_TYPES.contributors,
          type: "updateContributorRole",
          data: { contributorId, role },
        });

        return updated;
      },
      { notFound: CONTRIBUTOR_NOT_FOUND, rulesetId },
    );
  }
}

export default new ContributorsService();
