import { Avatar, Box, Button, Container, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  PageError,
  PageLoader,
  PageTransition,
  Panel,
  RoleChip,
  StatusChip,
} from "@/client/src/components/common/index.ts";
import { CheckIcon } from "@/client/src/components/icons/index.ts";
import { useAnswerInvite, usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { acceptedPath, INVITE_KINDS, type InviteKind } from "@/client/src/lib/invites.ts";

import { InviteActionButtons } from "./InviteActionButtons.tsx";
import { inviteQuery } from "./inviteQueries.ts";

interface InviteLandingPageProps {
  /** The invite's id, from its page's URL. */
  inviteId: string;
  /** What the invite is to: its page's facts and its answers (`INVITE_KINDS`). */
  kind: InviteKind;
}

interface InviteStateCardProps {
  action: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}

/** An invite's column: its card stands alone, centred, deeper under the app bar than a page's content */
const COLUMN_SX = { py: { xs: 4, sm: 8 } } as const;

function InviteStateCard({ icon, title, children, action }: InviteStateCardProps) {
  return (
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
  );
}

/**
 * Page reached from an invitation email: shows the invite and lets the user
 * accept or reject it, or explains why it can no longer be answered.
 */
export function InviteLandingPage({ kind, inviteId }: InviteLandingPageProps) {
  const { pageTitle, icon: Icon, entityLabel, entityPath, verb, acceptedStatus } = INVITE_KINDS[kind];
  usePageTitle(pageTitle);
  const navigate = useNavigate();
  // An invite answered or revoked elsewhere refreshes, and the page shows why it can't be answered anymore
  const { accept: acceptMutation, reject: rejectMutation } = useAnswerInvite();
  const answer = { kind, inviteId };

  // Once answered, the page is on its way out: don't refetch the invite and
  // flash its new status before the navigation lands.
  const isAnswering =
    acceptMutation.isPending || rejectMutation.isPending || acceptMutation.isSuccess || rejectMutation.isSuccess;

  const { data: invite, isLoading, error } = useQuery({ ...inviteQuery(kind, inviteId), enabled: !isAnswering });

  const goToDashboard = (
    <Button variant="contained" component={Link} to="/dashboard">
      Go to Dashboard
    </Button>
  );
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
      <InviteStateCard icon={stateIcon} title="Invite Not Found" action={goToDashboard}>
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
      <InviteStateCard icon={stateIcon} title={`${entityLabel} Archived`} action={goToDashboard}>
        <strong>{name}</strong> has been archived. This invite can no longer be accepted.
      </InviteStateCard>
    );
  }

  if (!isAnswering && invite.status !== "Pending") {
    return (
      <InviteStateCard
        icon={<StatusChip label={invite.status} color={invite.status === "Rejected" ? "error" : "default"} />}
        title={`Invite ${invite.status}`}
        action={goToDashboard}
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
                      <RoleChip label={invite.role} />
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
