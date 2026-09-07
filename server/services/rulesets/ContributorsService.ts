import { contributorsInRules } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService } from "@/server/emails";
import { EmailTemplate } from "@/server/emails/templates.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/errors/index.ts";
import { Contributors, Notifications, Rulesets, Users } from "@/server/repositories/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const ContributorsMethods = {
  async getUserContributorInvites(userId: string) {
    return await Contributors.findManyByUserId(
      db,
      { userId, status: "Pending" },
      { limit: 10 },
    );
  },

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getContributorInvite(session: Session, contributorId: string) {
    const invite = await Contributors.findOneForUser(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) {
      throw new NotFoundError("Contributor invite not found");
    }
    return invite;
  },

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

    // Must be owner or contributor to list contributors
    const isOwner = ruleset.userId === session.userId;
    if (!isOwner) {
      const role = await Contributors.findActiveRole(db, {
        userId: session.userId,
        rulesetId,
      });
      if (!role) {
        throw new ForbiddenError("You are not a contributor of this ruleset");
      }
    }

    const paginated = await Contributors.findMany(db, { rulesetId, ...where }, pagination);
    const ownerUser = ruleset.userId
      ? await Users.findOne(db, { id: ruleset.userId })
      : null;
    const owner = ownerUser
      ? { id: ownerUser.id, username: ownerUser.username, emailAddress: ownerUser.emailAddress }
      : null;
    return { ...paginated, owner };
  },

  async inviteContributor(
    session: Session,
    rulesetId: string,
    email: string,
    role: "Admin" | "Editor" | "Viewer",
  ) {
    const { contributor, emailData } = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      const policy = await getRulesetPolicy(tx, session, ruleset);
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
        throw new ConflictError(
          "Cannot invite the ruleset owner as a contributor",
        );
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
          inviterName:
            inviterUser?.username ||
            inviterUser?.emailAddress.split("@")[0] ||
            "Someone",
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
  },

  async acceptContributorInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await Contributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.userId !== session.userId) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.status !== "Pending") {
        throw new ConflictError("Invite is no longer pending");
      }

      const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }
      if (ruleset.status === "Archived") {
        throw new ConflictError("This ruleset has been archived");
      }

      const rows = await Contributors.update(
        tx,
        { status: "Active" },
        { id: contributorId },
      );
      const updated = rows[0];

      await Notifications.markReadByTarget(tx, { recipientId: session.userId, targetId: contributorId });

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInRules),
        type: "acceptContributorInvite",
        data: { contributorId },
      });

      return updated;
    });
  },

  async rejectContributorInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await Contributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.userId !== session.userId) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.status !== "Pending") {
        throw new ConflictError("Invite is no longer pending");
      }

      const rows = await Contributors.update(
        tx,
        { status: "Rejected" },
        { id: contributorId },
      );
      const updated = rows[0];

      await Notifications.markReadByTarget(tx, { recipientId: session.userId, targetId: contributorId });

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInRules),
        type: "rejectContributorInvite",
        data: { contributorId },
      });

      return updated;
    });
  },

  async revokeContributor(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await Contributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor not found");
      }

      const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      const policy = await getRulesetPolicy(tx, session, ruleset);
      policy.canManageContributors();

      if (contributor.role === "Admin") {
        policy.canManageAdminContributors();
      }

      if (contributor.status !== "Active" && contributor.status !== "Pending") {
        throw new ConflictError("Contributor is not active or pending");
      }

      const prevStatus = contributor.status;
      const rows = await Contributors.update(
        tx,
        { status: "Revoked" },
        { id: contributorId },
      );
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
  },

  async updateContributorRole(
    session: Session,
    contributorId: string,
    role: "Admin" | "Editor" | "Viewer",
  ) {
    return await withTransaction(async (tx) => {
      const contributor = await Contributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor not found");
      }

      const ruleset = await Rulesets.findOne(tx, { id: contributor.rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      const policy = await getRulesetPolicy(tx, session, ruleset);
      policy.canManageContributors();

      if (ruleset.status === "Archived") {
        throw new ConflictError("Cannot modify roles on an archived ruleset");
      }

      if (role === "Admin" || contributor.role === "Admin") {
        policy.canManageAdminContributors();
      }

      if (contributor.status !== "Active") {
        throw new ConflictError("Can only update role of active contributors");
      }

      const rows = await Contributors.update(
        tx,
        { role },
        { id: contributorId },
      );
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
  },

  async leaveRuleset(session: Session, rulesetId: string) {
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId }, Visibility.All);
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      const role = await Contributors.findActiveRole(tx, {
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

      const rows = await Contributors.update(
        tx,
        { status: "Revoked" },
        { id: contributor.id },
      );
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
  },

} as const;

class ContributorsService extends BaseService<typeof ContributorsMethods> {
  static initialize() {
    return new ContributorsService(ContributorsMethods);
  }
}

export default ContributorsService;
