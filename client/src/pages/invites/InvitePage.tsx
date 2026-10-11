import { Avatar, Box, Button, Container, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PageError, PageLoader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { ContributorRoleChip } from "@/client/src/components/contributors/index.ts";
import { CheckIcon } from "@/client/src/components/icons/index.ts";
import {
  acceptedPath,
  INVITE_KINDS,
  InviteActionButtons,
  type InviteKind,
  InviteStatusChip,
  useAnswerInvite,
} from "@/client/src/components/invites/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";

import { inviteQuery } from "./inviteQueries.ts";

interface InvitePageProps {
  /** What the invite is to, which its route says: its page's facts and its answers (`INVITE_KINDS`). */
  kind: InviteKind;
}

interface InviteStateCardProps {
  action: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}

/** Where an invite that can't be answered sends the user back to: the dashboard. */
const BACK_TO_DASHBOARD = (
  <Button variant="contained" component={Link} to="/dashboard">
    Back to Dashboard
  </Button>
);

/** An invite's column: its card stands alone, centred, deeper under the app bar than a page's content */
const COLUMN_SX = { py: { xs: 4, sm: 8 } } as const;

function InviteStateCard({ icon, title, children, action }: InviteStateCardProps) {
  return (
    <PageTransition>
      <Container maxWidth="sm" sx={COLUMN_SX}>
        <Panel sx={{ textAlign: "center" }}>
          <Stack spacing={2}>
            <Box>{icon}</Box>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h5" component="h1" gutterBottom>
                  {title}
                </Typography>
                <Typography variant="body1" sx={{ color: "text.secondary" }}>
                  {children}
                </Typography>
              </Box>
              {action && <Box>{action}</Box>}
            </Stack>
          </Stack>
        </Panel>
      </Container>
    </PageTransition>
  );
}

/**
 * The page an invite email links to, whatever the invite's kind (its route's `kind`): shows the invite and lets the user
 * accept or reject it, or explains why it can no longer be answered.
 */
export default function InvitePage({ kind }: InvitePageProps) {
  const { pageTitle, icon: Icon, entityLabel, entityPath, verb, acceptedStatus } = INVITE_KINDS[kind];
  usePageTitle(pageTitle);
  const { inviteId = "" } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  // An invite answered or revoked elsewhere refreshes, and the page shows why it can't be answered anymore
  const { accept: acceptMutation, reject: rejectMutation } = useAnswerInvite();
  const answer = { kind, inviteId };

  // Once answered, the page is on its way out: don't refetch the invite and
  // flash its new status before the navigation lands.
  const isAnswering =
    acceptMutation.isPending || rejectMutation.isPending || acceptMutation.isSuccess || rejectMutation.isSuccess;

  const { data: invite, isLoading, error } = useQuery({ ...inviteQuery(kind, inviteId), enabled: !isAnswering });

  const stateIcon = <Icon sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary" }} />;

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={COLUMN_SX}>
        <PageLoader />
      </Container>
    );
  }

  if (error && !invite) {
    return (
      <Container maxWidth="sm" sx={COLUMN_SX}>
        <PageError message={loadFailureMessage("Invite", error)} backLabel="Back to Dashboard" backTo="/dashboard" />
      </Container>
    );
  }

  if (!invite) {
    return (
      <InviteStateCard icon={stateIcon} title="Invite Not Found" action={BACK_TO_DASHBOARD}>
        This invite may have been revoked or doesn't belong to your account.
      </InviteStateCard>
    );
  }

  const name = invite.entityName || entityLabel;
  const entityId = invite.entityId;

  if (!isAnswering && invite.status === acceptedStatus) {
    return (
      <InviteStateCard
        icon={<CheckIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: "success.main" }} />}
        title="Already Accepted"
        action={
          entityId && (
            <Button variant="contained" component={Link} to={entityPath(entityId)}>
              Go to {entityLabel}
            </Button>
          )
        }
      >
        You've already accepted the invite to {verb} <strong>{name}</strong>.
      </InviteStateCard>
    );
  }

  if (!isAnswering && invite.status === "Pending" && invite.isArchived) {
    return (
      <InviteStateCard icon={stateIcon} title={`${entityLabel} Archived`} action={BACK_TO_DASHBOARD}>
        <strong>{name}</strong> has been archived. This invite can no longer be accepted.
      </InviteStateCard>
    );
  }

  if (!isAnswering && invite.status !== "Pending") {
    return (
      <InviteStateCard
        icon={<InviteStatusChip status={invite.status} />}
        title={`Invite ${invite.status}`}
        action={BACK_TO_DASHBOARD}
      >
        This invite to {verb} <strong>{name}</strong> is no longer pending.
      </InviteStateCard>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="sm" sx={COLUMN_SX}>
        <Panel>
          <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Avatar sx={{ width: 56, height: 56 }}>
                <Icon />
              </Avatar>
              <Stack>
                <Stack spacing={0.5}>
                  <Typography variant="h5" component="h1">
                    {name}
                  </Typography>
                  {invite.role && (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Invited as
                      </Typography>
                      <ContributorRoleChip role={invite.role} />
                    </Stack>
                  )}
                </Stack>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Invited on {formatDate(invite.invitedAt)}
                </Typography>
              </Stack>
            </Stack>

            <Stack spacing={4}>
              <Typography variant="body1">
                You've been invited to {verb} this {entityLabel.toLowerCase()}. Would you like to accept or reject this
                invite?
              </Typography>

              <InviteActionButtons
                prominent
                onAccept={() =>
                  acceptMutation.mutate(answer, {
                    onSuccess: () => navigate(acceptedPath(kind, entityId)),
                  })
                }
                onReject={() => rejectMutation.mutate(answer, { onSuccess: () => navigate("/dashboard") })}
                pending={acceptMutation.isPending ? "accept" : rejectMutation.isPending ? "reject" : null}
              />
            </Stack>
          </Stack>
        </Panel>
      </Container>
    </PageTransition>
  );
}
