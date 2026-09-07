import { PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Check, Close, Group as ContributorIcon } from "@mui/icons-material";
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
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function RulesetContributorInvitePage() {
  usePageTitle("Ruleset Contributor Invite");
  const { contributorId } = useParams<{ contributorId: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);

  const {
    data: invite,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["rulesetContributorInvite", contributorId],
    queryFn: async () => {
      if (!contributorId) throw new Error("Missing contributor id");
      const response = await rpc.api.rulesets.contributors.invites[":id"].$get({
        param: { id: contributorId },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to fetch contributor invite");
      return response.json();
    },
    enabled: !processing && !!contributorId,
  });

  const rulesetName = invite?.rulesetsInRule?.name || "Ruleset";
  const rulesetId = invite?.rulesetId;
  const isArchived = invite?.rulesetsInRule?.status === "Archived";

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await rpc.api.rulesets.contributors.invites[":id"].accept.$post({
        param: { id },
      });
      return response.json();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await rpc.api.rulesets.contributors.invites[":id"].reject.$post({
        param: { id },
      });
      return response.json();
    },
  });

  const handleAccept = () => {
    if (!contributorId) return;
    setProcessing(true);
    const targetRulesetId = rulesetId;
    acceptMutation.mutate(contributorId, {
      onSuccess: () => {
        snackbar.success("Contributor invite accepted!");
        navigate(targetRulesetId ? `/rulesets/${targetRulesetId}` : "/rulesets");
        queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      },
      onError: (err) => {
        snackbar.error(err, "Failed to accept invitation");
        setProcessing(false);
      },
    });
  };

  const handleReject = () => {
    if (!contributorId) return;
    setProcessing(true);
    rejectMutation.mutate(contributorId, {
      onSuccess: () => {
        snackbar.success("Contributor invite rejected");
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        navigate("/dashboard");
      },
      onError: (err) => {
        snackbar.error(err, "Failed to reject invitation");
        setProcessing(false);
      },
    });
  };

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

  if (!invite && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <ContributorIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Invitation Not Found
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              This invitation may have been revoked or doesn't belong to your account.
            </Typography>
            <Button variant="contained" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (invite?.status === "Active" && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <Check sx={{ fontSize: { xs: 48, sm: 64 }, color: "success.main", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Already Accepted
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              You've already accepted the invitation to contribute to <strong>{rulesetName}</strong>.
            </Typography>
            {rulesetId && (
              <Button variant="contained" onClick={() => navigate(`/rulesets/${rulesetId}`)}>
                Go to Ruleset
              </Button>
            )}
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (!invite) return null;

  if (invite.status === "Pending" && isArchived && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <ContributorIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary", mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Ruleset Archived
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              <strong>{rulesetName}</strong> has been archived. This invitation can no longer be accepted.
            </Typography>
            <Button variant="contained" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (invite.status !== "Pending" && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <Chip
              label={invite.status}
              color={invite.status === "Rejected" ? "error" : "default"}
              size="medium"
              sx={{ mb: 2 }}
            />
            <Typography variant="h5" gutterBottom>
              Invitation {invite.status}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              This invitation to contribute to <strong>{rulesetName}</strong> is no longer pending.
            </Typography>
            <Button variant="contained" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 4 } }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
              <Avatar sx={{ width: 56, height: 56, mr: 2 }}>
                <ContributorIcon />
              </Avatar>
              <Box>
                <Typography variant="h5">{rulesetName}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    Invited as
                  </Typography>
                  <Chip label={invite.role} size="small" variant="outlined" />
                </Box>
              </Box>
            </Box>

            <Typography variant="body1" sx={{ mb: 4 }}>
              You've been invited to contribute to this ruleset. Would you like to accept or reject this invitation?
            </Typography>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<Check />}
                onClick={handleAccept}
                disabled={processing}
                fullWidth
              >
                Accept
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<Close />}
                onClick={handleReject}
                disabled={processing}
                fullWidth
              >
                Reject
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </PageTransition>
  );
}
