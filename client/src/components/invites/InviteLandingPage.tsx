import { Avatar, Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ElementType, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { LoadError, PageLoader, PageTransition } from "@/client/src/components/common/index.ts";
import { CheckIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

import { InviteActionButtons } from "./InviteActionButtons.tsx";
import { inviteQuery } from "./inviteQueries.ts";

/** What the landing page needs to know about an invite, whatever its kind. */
interface InviteDetails {
  entityId: string | null | undefined;
  entityName: string | undefined;
  invitedAt?: string;
  isArchived: boolean;
  /** Contributor role offered by the invite. */
  role?: string;
  status: string;
}

interface InviteLandingPageProps {
  /** Status an accepted invite ends in ("Accepted" for campaigns, "Active" for contributors). */
  acceptedStatus: string;
  acceptFn: () => Promise<unknown>;
  description: string;
  /** "Campaign", "Ruleset", "Character". */
  entityLabel: string;
  entityPath: (entityId: string) => string;
  icon: ElementType;
  /** Lists that gain the entity once the invite is accepted. */
  invalidateOnAccept: readonly unknown[];
  inviteFn: () => Promise<InviteDetails>;
  /** Completes "invitation to …": "join", "contribute to". */
  joinVerb: string;
  /** Where accepting lands when the invite doesn't name its entity. */
  listPath: string;
  pageTitle: string;
  queryKey: readonly unknown[];
  rejectFn: () => Promise<unknown>;
}

interface InviteStateCardProps {
  action: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}

function InviteStateCard({ icon, title, children, action }: InviteStateCardProps) {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
      <Card>
        <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
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
        </CardContent>
      </Card>
    </Container>
  );
}

/**
 * Page reached from an invitation email: shows the invite and lets the user
 * accept or reject it, or explains why it can no longer be answered.
 */
export function InviteLandingPage({
  pageTitle,
  entityLabel,
  entityPath,
  listPath,
  icon: Icon,
  queryKey,
  inviteFn,
  acceptFn,
  rejectFn,
  acceptedStatus,
  joinVerb,
  description,
  invalidateOnAccept,
}: InviteLandingPageProps) {
  usePageTitle(pageTitle);
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: acceptFn,
    onSuccess: () => {
      snackbar.success("Invitation accepted");
      queryClient.invalidateQueries({ queryKey: invalidateOnAccept });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications.all });
    },
    onError: (error) => snackbar.error(error, "Failed to accept invitation"),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectFn,
    onSuccess: () => {
      snackbar.success("Invitation rejected");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications.all });
      navigate("/dashboard");
    },
    onError: (error) => snackbar.error(error, "Failed to reject invitation"),
  });

  // Once answered, the page is on its way out: don't refetch the invite and
  // flash its new status before the navigation lands.
  const isAnswering =
    acceptMutation.isPending || rejectMutation.isPending || acceptMutation.isSuccess || rejectMutation.isSuccess;

  const { data: invite, isLoading, error } = useQuery({ ...inviteQuery(queryKey, inviteFn), enabled: !isAnswering });

  const goToDashboard = (
    <Button variant="contained" component={Link} to="/dashboard">
      Go to Dashboard
    </Button>
  );
  const stateIcon = <Icon sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary" }} />;

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <PageLoader />
      </Container>
    );
  }

  if (error && !invite) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <LoadError what="Invitation" error={error} />
      </Container>
    );
  }

  if (!invite) {
    return (
      <InviteStateCard icon={stateIcon} title="Invitation Not Found" action={goToDashboard}>
        This invitation may have been revoked or doesn't belong to your account.
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
        You've already accepted the invitation to {joinVerb} <strong>{name}</strong>.
      </InviteStateCard>
    );
  }

  if (!isAnswering && invite.status === "Pending" && invite.isArchived) {
    return (
      <InviteStateCard icon={stateIcon} title={`${entityLabel} Archived`} action={goToDashboard}>
        <strong>{name}</strong> has been archived. This invitation can no longer be accepted.
      </InviteStateCard>
    );
  }

  if (!isAnswering && invite.status !== "Pending") {
    return (
      <InviteStateCard
        icon={<Chip label={invite.status} color={invite.status === "Rejected" ? "error" : "default"} size="medium" />}
        title={`Invitation ${invite.status}`}
        action={goToDashboard}
      >
        This invitation to {joinVerb} <strong>{name}</strong> is no longer pending.
      </InviteStateCard>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
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
                        <Chip label={invite.role} size="small" variant="outlined" />
                      </Stack>
                    )}
                  </Stack>
                  {invite.invitedAt && (
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Invited on {formatDate(invite.invitedAt)}
                    </Typography>
                  )}
                </Stack>
              </Stack>

              <Stack spacing={4}>
                <Typography variant="body1">{description}</Typography>

                <InviteActionButtons
                  prominent
                  onAccept={() =>
                    acceptMutation.mutate(undefined, {
                      onSuccess: () => navigate(entityId ? entityPath(entityId) : listPath),
                    })
                  }
                  onReject={() => rejectMutation.mutate()}
                  disabled={isAnswering}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </PageTransition>
  );
}
