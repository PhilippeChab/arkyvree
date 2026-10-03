import { getTableName } from "drizzle-orm";

import { contributorsInRules } from "@/drizzle/schema.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { emailService } from "@/server/emails/index.ts";
import { EmailTemplate } from "@/server/emails/templates.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Contributors, Notifications, Rulesets, Users } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

class ContributorsService {
  /** A contributor the session's user may manage, with its ruleset and the policy that allowed it. */
  private async getManagedContributor(tx: Db, session: Session, contributorId: string) {
    const contributor = await Contributors.findOne(tx, { id: contributorId });
    if (!contributor) {
      throw new NotFoundError("Contributor not found");
    }
    const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId }, Visibility.All);
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }
    const policy = await RulesetsPolicy.for(tx, session, ruleset);
    policy.canManageContributors();
    return { contributor, ruleset, policy };
  }

  /**
   * The pending invite addressed to the session's user. Anyone else's is a 404: it doesn't reveal the invite exists.
   */
  private async getPendingInviteFor(tx: Db, session: Session, contributorId: string) {
    const contributor = await Contributors.findOne(tx, { id: contributorId });
    if (!contributor || contributor.userId !== session.userId) {
      throw new NotFoundError("Contributor invite not found");
    }
    if (contributor.status !== "Pending") {
      throw new ConflictError("Invite is no longer pending");
    }
    return contributor;
  }

  /**
   * The invitee's answer: the invite's status, its notification read,
   * and the activity its ruleset's managers are told of.
   */
  private async answerInvite(tx: Db, session: Session, contributorId: string, status: "Active" | "Rejected") {
    const [updated] = await Contributors.update(tx, { status }, { id: contributorId });
    await Notifications.markRead(tx, { recipientId: session.userId, targetId: contributorId });
    await createActivityWithNotifications(tx, {
      userId: session.userId,
      targetId: updated.id,
      targetTable: getTableName(contributorsInRules),
      type: status === "Active" ? "acceptContributorInvite" : "rejectContributorInvite",
      data: { contributorId },
    });
    return updated;
  }

  async getContributors(
    session: Session,
    rulesetId: string,
    where: {
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId }, Visibility.All);
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    (await RulesetsPolicy.for(db, session, ruleset)).canReadContributors();

    const paginated = await Contributors.findPage(db, { rulesetId, ...where }, pagination);
    const ownerUser = ruleset.userId ? await Users.findOne(db, { id: ruleset.userId }) : null;
    const owner = ownerUser
      ? { id: ownerUser.id, username: ownerUser.username, emailAddress: ownerUser.emailAddress }
      : null;
    return { ...paginated, owner };
  }

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getInvite(session: Session, contributorId: string) {
    const invite = await Contributors.findOneWithRuleset(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) {
      throw new NotFoundError("Contributor invite not found");
    }
    return invite;
  }

  async getUserInvites(userId: string) {
    return await Contributors.findManyWithRuleset(db, { userId, status: "Pending" }, { limit: 10 });
  }

  async updateContributorRole(session: Session, contributorId: string, role: ContributorRole) {
    return await withTransaction(async (tx) => {
      const { contributor, ruleset, policy } = await this.getManagedContributor(tx, session, contributorId);

      if (ruleset.status === "Archived") {
        throw new ConflictError("Cannot modify roles on an archived ruleset");
      }

      if (role === "Admin" || contributor.role === "Admin") {
        policy.canManageAdminContributors();
      }

      if (contributor.status !== "Active") {
        throw new ConflictError("Can only update role of active contributors");
      }

      const rows = await Contributors.update(tx, { role }, { id: contributorId });
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInRules),
        type: "updateContributorRole",
        data: { contributorId, role },
      });

      return updated;
    });
  }

  async acceptInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await this.getPendingInviteFor(tx, session, contributorId);

      const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }
      if (ruleset.status === "Archived") {
        throw new ConflictError("This ruleset has been archived");
      }

      return await this.answerInvite(tx, session, contributor.id, "Active");
    });
  }

  async inviteContributor(session: Session, rulesetId: string, email: string, role: ContributorRole) {
    const { contributor, emailData } = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      const policy = await RulesetsPolicy.for(tx, session, ruleset);
      policy.canManageContributors();

      if (ruleset.status === "Archived") {
        throw new ConflictError("Cannot invite a contributor to an archived ruleset");
      }

      if (role === "Admin") {
        policy.canManageAdminContributors();
      }

      // Look up user by email
      const user = await Users.findOne(tx, { emailAddress: email });

      // Cannot invite the owner
      if (user && user.id === ruleset.userId) {
        throw new ConflictError("Cannot invite the ruleset owner as a contributor");
      }

      // Check for existing active/pending contributor
      if (user) {
        const existing = await Contributors.findOne(tx, {
          rulesetId,
          userId: user.id,
          status: "Active",
        });
        if (existing) {
          throw new ConflictError("User is already a contributor");
        }
        const pending = await Contributors.findOne(tx, {
          rulesetId,
          userId: user.id,
          status: "Pending",
        });
        if (pending) {
          throw new ConflictError("User already has a pending invite");
        }
      } else {
        const pending = await Contributors.findOne(tx, {
          rulesetId,
          email,
          status: "Pending",
        });
        if (pending) {
          throw new ConflictError("This email already has a pending invite");
        }
      }

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
        targetTable: getTableName(contributorsInRules),
        type: "inviteContributor",
        data: { email, role, rulesetId, rulesetName: ruleset.name },
      });

      const inviterUser = await Users.findOne(tx, { id: session.userId });

      return {
        contributor,
        emailData: {
          email,
          inviteeName: user?.username || email.split("@")[0],
          inviterName: inviterUser?.username || inviterUser?.emailAddress.split("@")[0] || "Someone",
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
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      const role = await Contributors.findRole(tx, {
        userId: session.userId,
        rulesetId,
      });
      if (!role) {
        throw new NotFoundError("You are not a contributor of this ruleset");
      }

      // Find the active contributor record
      const contributor = await Contributors.findOne(tx, {
        rulesetId,
        userId: session.userId,
        status: "Active",
      });
      if (!contributor) {
        throw new NotFoundError("Contributor record not found");
      }

      const rows = await Contributors.update(tx, { status: "Revoked" }, { id: contributor.id });
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInRules),
        type: "leaveRuleset",
        data: { rulesetId },
      });

      return updated;
    });
  }

  async rejectInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await this.getPendingInviteFor(tx, session, contributorId);

      return await this.answerInvite(tx, session, contributor.id, "Rejected");
    });
  }

  async revokeContributor(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const { contributor, policy } = await this.getManagedContributor(tx, session, contributorId);

      if (contributor.role === "Admin") {
        policy.canManageAdminContributors();
      }

      if (contributor.status !== "Active" && contributor.status !== "Pending") {
        throw new ConflictError("Contributor is not active or pending");
      }

      const prevStatus = contributor.status;
      const rows = await Contributors.update(tx, { status: "Revoked" }, { id: contributorId });
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInRules),
        type: "revokeContributor",
        data: { contributorId, prevStatus },
      });

      return updated;
    });
  }
}

export default new ContributorsService();
