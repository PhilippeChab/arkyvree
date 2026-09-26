import { Check } from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ElementType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { DiceSpinner, PageTransition } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/rpc.ts";
import { InviteActionButtons } from "./InviteActionButtons.tsx";

/** What the landing page needs to know about an invite, whatever its kind. */
export interface InviteDetails {
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
  icon: ElementType;
  queryKey: readonly unknown[];
  loadInvite: () => Promise<InviteDetails>;
  acceptInvite: () => Promise<unknown>;
  rejectInvite: () => Promise<unknown>;
  /** Status an accepted invite ends in ("Accepted" for campaigns, "Active" for contributors). */
  acceptedStatus: string;
  /** Completes "invitation to …": "join", "contribute to". */
  joinVerb: string;
  description: string;
  /** Lists that gain the entity once the invite is accepted. */
  invalidateOnAccept: readonly unknown[];
}

function InviteStateCard({ icon, title, children, action }: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
      <Card>
        <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
          {icon}
          <Typography variant="h5" gutterBottom>{title}</Typography>
          <Typography variant="body1" sx={{ color: "text.secondary", mb: 3 }}>{children}</Typography>
          {action}
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
  icon: Icon,
  queryKey,
  loadInvite,
  acceptInvite,
  rejectInvite,
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
    mutationFn: acceptInvite,
    onSuccess: () => {
      snackbar.success("Invitation accepted!");
      queryClient.invalidateQueries({ queryKey: invalidateOnAccept });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (error) => snackbar.error(error, "Failed to accept invitation"),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectInvite,
    onSuccess: () => {
      snackbar.success("Invitation rejected");
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      navigate("/dashboard");
    },
    onError: (error) => snackbar.error(error, "Failed to reject invitation"),
  });

  // Once answered, the page is on its way out: don't refetch the invite and
  // flash its new status before the navigation lands.
  const isAnswering = acceptMutation.isPending || rejectMutation.isPending
    || acceptMutation.isSuccess || rejectMutation.isSuccess;

  const { data: invite, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await loadInvite();
      } catch (err) {
        // Revoked, or addressed to someone else.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !isAnswering,
  });

  const goToDashboard = (
    <Button variant="contained" onClick={() => navigate("/dashboard")}>
      Go to Dashboard
    </Button>
  );
  const stateIcon = <Icon sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary", mb: 2 }} />;

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <DiceSpinner size="large" />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Alert severity="error">Failed to load invitation. Please try again later.</Alert>
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
        icon={<Check sx={{ fontSize: { xs: 48, sm: 64 }, color: "success.main", mb: 2 }} />}
        title="Already Accepted"
        action={entityId && (
          <Button variant="contained" onClick={() => navigate(entityPath(entityId))}>
            Go to {entityLabel}
          </Button>
        )}
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
        icon={(
          <Chip
            label={invite.status}
            color={invite.status === "Rejected" ? "error" : "default"}
            size="medium"
            sx={{ mb: 2 }}
          />
        )}
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
            <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
              <Avatar sx={{ width: 56, height: 56, mr: 2 }}>
                <Icon />
              </Avatar>
              <Box>
                <Typography variant="h5">{name}</Typography>
                {invite.role && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Invited as
                    </Typography>
                    <Chip label={invite.role} size="small" variant="outlined" />
                  </Box>
                )}
                {invite.invitedAt && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Invited on {new Date(invite.invitedAt).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            </Box>

            <Typography variant="body1" sx={{ mb: 4 }}>
              {description}
            </Typography>

            <InviteActionButtons
              prominent
              onAccept={() => acceptMutation.mutate(undefined, {
                onSuccess: () => navigate(entityId ? entityPath(entityId) : "/dashboard"),
              })}
              onReject={() => rejectMutation.mutate()}
              disabled={isAnswering}
            />
          </CardContent>
        </Card>
      </Container>
    </PageTransition>
  );
}
