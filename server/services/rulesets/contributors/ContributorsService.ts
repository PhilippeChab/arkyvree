import type { Db } from "@/drizzle/database.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Contributors, type Pagination, Rulesets, Users } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { toPublicUser } from "@/server/services/authentication/index.ts";
import {
  checkNewContributor,
  getInviteNames,
  getPendingInvite,
  saveInviteAnswer,
} from "@/server/services/invites/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

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

  /** A contributor the session's user may manage, with its ruleset and the policy that allowed it. */
  private async getManagedContributor(tx: Db, session: Session, contributorId: string) {
    const contributor = await Contributors.findOne(tx, { id: contributorId });
    if (!contributor) throw new NotFoundError("Contributor not found");

    const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId });
    if (!ruleset) throw new NotFoundError("Ruleset not found");

    const policy = await RulesetsPolicy.for(tx, session, ruleset);
    policy.canManageContributors();
    return { contributor, ruleset, policy };
  }

  async acceptInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await getPendingInvite(tx, session, Contributors, contributorId, INVITE_NOT_FOUND);

      const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId });
      if (!ruleset) throw new NotFoundError("Ruleset not found");

      if (ruleset.status === "Archived") throw new ConflictError("This ruleset has been archived");

      return await this.answerInvite(tx, session, contributor.id, "Active");
    });
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
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });
    if (!ruleset) throw new NotFoundError("Ruleset not found");

    (await RulesetsPolicy.for(db, session, ruleset)).canReadContributors();

    const paginated = await Contributors.findPage(db, { rulesetId, ...where }, pagination);
    const ownerUser = ruleset.userId ? await Users.findOne(db, { id: ruleset.userId }) : undefined;
    return { ...paginated, owner: ownerUser ? toPublicUser(ownerUser) : null };
  }

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getInvite(session: Session, contributorId: string) {
    const invite = await Contributors.findOneWithRuleset(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError(INVITE_NOT_FOUND);

    return invite;
  }

  async inviteContributor(session: Session, rulesetId: string, email: string, role: ContributorRole) {
    const { contributor, emailData } = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) throw new NotFoundError("Ruleset not found");

      const policy = await RulesetsPolicy.for(tx, session, ruleset);
      policy.canInviteContributors();

      if (role === "Admin") policy.canManageAdminContributors();

      const user = await Users.findOne(tx, { emailAddress: email });

      // Cannot invite the owner
      if (user && user.id === ruleset.userId)
        throw new ConflictError("Cannot invite the ruleset owner as a contributor");

      await checkNewContributor(tx, Contributors, { rulesetId }, user, email);

      const rows = await Contributors.create(tx, {
        rulesetId,
        email,
        role,
        invitedBy: session.userId,
        userId: user?.id,
      });
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
    });

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
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) throw new NotFoundError("Ruleset not found");

      const role = await Contributors.findRole(tx, {
        userId: session.userId,
        rulesetId,
      });
      if (!role) throw new NotFoundError("You are not a contributor of this ruleset");

      const contributor = await Contributors.findOne(tx, {
        rulesetId,
        userId: session.userId,
        status: "Active",
      });
      if (!contributor) throw new NotFoundError("Contributor record not found");

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
    return await withTransaction(async (tx) => {
      const contributor = await getPendingInvite(tx, session, Contributors, contributorId, INVITE_NOT_FOUND);

      return await this.answerInvite(tx, session, contributor.id, "Rejected");
    });
  }

  async revokeContributor(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const { contributor, ruleset, policy } = await this.getManagedContributor(tx, session, contributorId);

      if (contributor.role === "Admin") policy.canManageAdminContributors();

      if (contributor.status !== "Active" && contributor.status !== "Pending")
        throw new ConflictError("Contributor is not active or pending");

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
    });
  }

  async updateContributorRole(session: Session, contributorId: string, role: ContributorRole) {
    return await withTransaction(async (tx) => {
      const { contributor, ruleset, policy } = await this.getManagedContributor(tx, session, contributorId);

      if (ruleset.status === "Archived") throw new ConflictError("Cannot modify roles on an archived ruleset");

      if (role === "Admin" || contributor.role === "Admin") policy.canManageAdminContributors();

      if (contributor.status !== "Active") throw new ConflictError("Can only update role of active contributors");

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
    });
  }
}

export default new ContributorsService();
