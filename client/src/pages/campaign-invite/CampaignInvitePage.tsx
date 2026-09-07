import { PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Check, Close, Mail as InviteIcon } from "@mui/icons-material";
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

export default function InvitePage() {
  usePageTitle("Invite");
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);

  const {
    data: invite,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.invites.detail(inviteId),
    queryFn: async () => {
      if (!inviteId) throw new Error("Missing invite id");
      const response = await rpc.api.campaigns.invites[":inviteId"].$get({
        param: { inviteId },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Failed to fetch invite");
      return await response.json();
    },
    enabled: !processing && !!inviteId,
  });

  const campaignName =
    invite?.playersInCampaign?.campaignsInCampaign?.name || "Campaign";
  const campaignId = invite?.playersInCampaign?.campaignsInCampaign?.id;
  const isArchived = !!invite?.playersInCampaign?.campaignsInCampaign?.deletedAt;

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await rpc.api.campaigns.invites[":inviteId"].accept
        .$post({
          param: { inviteId: id },
        });
      return response.json();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await rpc.api.campaigns.invites[":inviteId"].reject
        .$post({
          param: { inviteId: id },
        });
      return response.json();
    },
  });

  const handleAccept = () => {
    if (!inviteId) return;
    setProcessing(true);
    const targetCampaignId = campaignId;
    acceptMutation.mutate(inviteId, {
      onSuccess: () => {
        snackbar.success("Invitation accepted!");
        navigate(targetCampaignId ? `/campaigns/${targetCampaignId}` : "/campaigns");
        queryClient.removeQueries({ queryKey: queryKeys.invites.me });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      },
      onError: (err) => {
        snackbar.error(err, "Failed to accept invitation");
        setProcessing(false);
      },
    });
  };

  const handleReject = () => {
    if (!inviteId) return;
    setProcessing(true);
    rejectMutation.mutate(inviteId, {
      onSuccess: () => {
        snackbar.success("Invitation rejected");
        queryClient.removeQueries({ queryKey: queryKeys.invites.me });
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
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 300,
          }}
        >
          <DiceSpinner size="large" />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Alert severity="error">
          Failed to load invitation. Please try again later.
        </Alert>
      </Container>
    );
  }

  if (!invite && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <InviteIcon
              sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary", mb: 2 }}
            />
            <Typography variant="h5" gutterBottom>
              Invitation Not Found
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              This invitation may have been revoked or doesn't belong to your
              account.
            </Typography>
            <Button variant="contained" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (invite?.status === "Accepted" && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <Check
              sx={{ fontSize: { xs: 48, sm: 64 }, color: "success.main", mb: 2 }}
            />
            <Typography variant="h5" gutterBottom>
              Already Accepted
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              You've already accepted the invitation to{" "}
              <strong>{campaignName}</strong>.
            </Typography>
            {campaignId && (
              <Button
                variant="contained"
                onClick={() => navigate(`/campaigns/${campaignId}`)}
              >
                Go to Campaign
              </Button>
            )}
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (!invite) {
    return null;
  }

  if (invite.status === "Pending" && isArchived && !processing) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
        <Card>
          <CardContent sx={{ textAlign: "center", py: { xs: 3, sm: 6 } }}>
            <InviteIcon
              sx={{ fontSize: { xs: 48, sm: 64 }, color: "text.secondary", mb: 2 }}
            />
            <Typography variant="h5" gutterBottom>
              Campaign Archived
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              <strong>{campaignName}</strong> has been archived. This invitation can no longer be accepted.
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
              This invitation to <strong>{campaignName}</strong> is no longer
              pending.
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
              <Avatar sx={{ width: 56, height: 56, mr: 2 }} />
              <Box>
                <Typography variant="h5">{campaignName}</Typography>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  Invited on{" "}
                  {new Date(invite.createdAt).toLocaleDateString()}
                </Typography>
              </Box>
            </Box>

            <Typography variant="body1" sx={{ mb: 4 }}>
              You've been invited to join this campaign. Would you like to accept
              or reject this invitation?
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
