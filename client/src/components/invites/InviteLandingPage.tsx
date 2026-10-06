import { Avatar, Box, Button, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ElementType, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { DiceSpinner, LoadError, PageBody, Section, TagChip } from "@/client/src/components/common/index.ts";
import { CheckIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/apiError.ts";

import { InviteActionButtons } from "./InviteActionButtons.tsx";

/** What the landing page needs to know about an invite, whatever its kind. */
interface InviteDetails {
  status: string;
  entityName: string | undefined;
  entityId: string | null | undefined;
  isArchived: boolean;
  /** Contributor role offered by the invite. */
  role?: string;
  invitedAt?: string;
}

interface InviteLandingPageProps {
  pageTitle: string;
  /** "Campaign", "Ruleset", "Character". */
  entityLabel: string;
  entityPath: (entityId: string) => string;
  /** Where accepting lands when the invite doesn't name its entity. */
  listPath: string;
  icon: ElementType;
  queryKey: readonly unknown[];
  inviteFn: () => Promise<InviteDetails>;
  acceptFn: () => Promise<unknown>;
  rejectFn: () => Promise<unknown>;
  /** Status an accepted invite ends in ("Accepted" for campaigns, "Active" for contributors). */
  acceptedStatus: string;
  /** Completes "invitation to …": "join", "contribute to". */
  joinVerb: string;
  description: string;
  /** Lists that gain the entity once the invite is accepted. */
  invalidateOnAccept: readonly unknown[];
}

interface InviteStateCardProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action: ReactNode;
}

function InviteStateCard({ icon, title, children, action }: InviteStateCardProps) {
  return (
    <PageBody width="sm">
      <Section>
        <Stack spacing={3} sx={{ alignItems: "center", textAlign: "center" }}>
          {icon}
          <Box>
            <Typography component="h1" variant="h3" gutterBottom>
              {title}
            </Typography>
            <Typography sx={{ color: "text.secondary" }}>{children}</Typography>
          </Box>
          {action}
        </Stack>
      </Section>
    </PageBody>
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
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (error) => snackbar.error(error, "Failed to accept invitation"),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectFn,
    onSuccess: () => {
      snackbar.success("Invitation rejected");
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      navigate("/dashboard");
    },
    onError: (error) => snackbar.error(error, "Failed to reject invitation"),
  });

  // Once answered, the page is on its way out: don't refetch the invite and
  // flash its new status before the navigation lands.
  const isAnswering =
    acceptMutation.isPending || rejectMutation.isPending || acceptMutation.isSuccess || rejectMutation.isSuccess;

  const {
    data: invite,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await inviteFn();
      } catch (err) {
        // Revoked, or addressed to someone else.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !isAnswering,
    // Drop the invite once the page closes: it may be answered elsewhere (the
    // bell, the dashboard), and a cached "Pending" would offer dead buttons.
    gcTime: 0,
  });

  const goToDashboard = (
    <Button variant="contained" component={Link} to={"/dashboard"}>
      Go to Dashboard
    </Button>
  );
  const stateIcon = <Icon fontSize="hero" sx={{ color: "text.secondary" }} />;

  if (isLoading) {
    return (
      <PageBody width="sm">
        <DiceSpinner size="large" sx={{ minHeight: 300 }} />
      </PageBody>
    );
  }

  if (error) {
    return (
      <PageBody width="sm">
        <LoadError what="Invitation" error={error} />
      </PageBody>
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
        icon={<CheckIcon fontSize="hero" sx={{ color: "success.main" }} />}
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
      <InviteStateCard icon={stateIcon} title={`Invitation ${invite.status}`} action={goToDashboard}>
        This invitation to {joinVerb} <strong>{name}</strong> is no longer pending.
      </InviteStateCard>
    );
  }

  return (
    <PageBody width="sm">
      <Section>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Avatar sx={{ width: 56, height: 56 }}>
              <Icon />
            </Avatar>
            <Stack spacing={0.5}>
              <Typography component="h2" variant="h5">
                {name}
              </Typography>
              {invite.role && (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Invited as
                  </Typography>
                  <TagChip tag={{ label: invite.role, color: "default" }} />
                </Stack>
              )}
              {invite.invitedAt && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Invited on {formatDate(invite.invitedAt)}
                </Typography>
              )}
            </Stack>
          </Stack>

          <Typography>{description}</Typography>

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
      </Section>
    </PageBody>
  );
}
