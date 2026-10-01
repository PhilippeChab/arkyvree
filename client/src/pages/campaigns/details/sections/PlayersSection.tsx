import { pageItems } from "@/client/src/lib/pageItems.ts";
import { formatDate } from "@/client/src/lib/activityFormatters.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { BlankState, ConfirmDialog, DiceSpinner, LoadMoreButton, NoMatchesState, ROW_ACTIONS_HOVER_SX, ROW_ACTIONS_SX, SearchBar, SectionContent } from "@/client/src/components/common/index.ts";
import {
  AddPlayerDialog,
  type CampaignPlayer,
  EditPlayerDialog,
  getPlayerSlot,
  playerDisplay,
  type PlayerFormData,
  type PlayerState,
  RemovePlayerDialog,
  toPlayerPayload,
} from "@/client/src/pages/campaigns/components/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  AdminPanelSettings as GMIcon,
  ExitToApp as LeaveIcon,
  HourglassEmpty as PendingIcon,
  Person as PlayerIcon,
  Close as RevokeIcon,
  PersonOff as UnassignedIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { campaignPlayersQuery } from "@/client/src/pages/campaigns/details/sectionQueries.ts";

interface PlayersSectionProps {
  campaign: CampaignDetail;
}

const STATUS_CHIPS = {
  assigned: null,
  pending: { icon: <PendingIcon sx={{ fontSize: 14 }} />, label: "Invite Pending", color: "warning" },
  unassigned: { icon: <UnassignedIcon sx={{ fontSize: 14 }} />, label: "Unassigned", color: "default" },
} as const satisfies Record<PlayerState, { icon: ReactNode; label: string; color: "warning" | "default" } | null>;

export function PlayersSection({ campaign }: PlayersSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  // Kept after its dialog closes, so the dialog doesn't change while it fades out.
  const [selectedPlayer, setSelectedPlayer] = useState<CampaignPlayer | null>(null);
  const selectedSlot = selectedPlayer && getPlayerSlot(selectedPlayer);

  // Search state with debounce
  const [searchQuery, setSearchQuery] = useSearchParam("playerSearch");

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);

  // Get permissions for this campaign
  const { canManagePlayers, canManageInvites } = useCampaignPermissions(campaign);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const addForm = useForm<PlayerFormData>({
    defaultValues: {
      role: "Player Character",
      email: "",
    },
  });

  const editForm = useForm<PlayerFormData>({
    defaultValues: {
      role: "Player Character",
      email: "",
    },
  });

  const {
    data,
    isLoading: playersLoading,
    error: playersError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...campaignPlayersQuery(campaign.id, searchQuery), placeholderData: keepPreviousData });

  const players = pageItems(data);

  const addMutation = useMutation({
    mutationFn: async (data: PlayerFormData) => {
      return parseResponse(rpc.api.campaigns[":id"].players.$post({
        param: { id: campaign.id },
        json: toPlayerPayload(data),
      }));
    },
    onSuccess: () => {
      snackbar.success("Player added successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      setAddDialogOpen(false);
      addForm.reset();
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ playerId, data }: { playerId: string; data: PlayerFormData }) => {
      return parseResponse(rpc.api.campaigns[":id"].players[":playerId"].$put({
        param: { id: campaign.id, playerId },
        json: toPlayerPayload(data),
      }));
    },
    onSuccess: () => {
      snackbar.success("Player updated successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return parseResponse(rpc.api.campaigns[":id"].players[":playerId"].$delete({
        param: { id: campaign.id, playerId },
      }));
    },
    onSuccess: () => {
      const removedSelf = selectedPlayer?.userId === currentUserId;
      snackbar.success(removedSelf ? "You left the campaign" : "Player removed successfully");
      if (removedSelf) {
        navigate("/campaigns", { replace: true });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "characters") });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
        setRemoveDialogOpen(false);
      }
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return parseResponse(rpc.api.campaigns.invites[":inviteId"].revoke.$post({
        param: { inviteId },
      }));
    },
    onSuccess: () => {
      snackbar.success("Invitation revoked successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      setRevokeDialogOpen(false);
      setSelectedInviteId(null);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const handleRevokeInvite = (inviteId: string) => {
    setSelectedInviteId(inviteId);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeInvite = () => {
    if (selectedInviteId) {
      revokeInviteMutation.mutate(selectedInviteId);
    }
  };

  const handleAddPlayer = () => {
    addForm.reset();
    setAddDialogOpen(true);
  };

  const confirmAddPlayer = (data: PlayerFormData) => {
    addMutation.mutate(data);
  };

  const handleEditPlayer = (player: CampaignPlayer) => {
    setSelectedPlayer(player);
    editForm.reset({
      role: player.role,
      email: "",
    });
    setEditDialogOpen(true);
  };

  const confirmEditPlayer = (data: PlayerFormData) => {
    if (!selectedPlayer) return;
    editMutation.mutate({ playerId: selectedPlayer.id, data });
  };

  const handleRemovePlayer = (player: CampaignPlayer) => {
    setSelectedPlayer(player);
    setRemoveDialogOpen(true);
  };

  const confirmRemovePlayer = () => {
    if (!selectedPlayer) return;
    removeMutation.mutate(selectedPlayer.id);
  };

  return (
    <SectionContent>
      {/* Header */}
      <Typography sx={{ fontWeight: 600, mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Players
      </Typography>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search players..."
        actions={canManagePlayers && !campaign.deletedAt && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="medium"
            onClick={handleAddPlayer}
          >
            Add Player
          </Button>
        )}
      />
      {/* Loading State */}
      {playersLoading && (
        <DiceSpinner sx={{ py: 4 }} />
      )}
      {/* Error State */}
      {playersError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load players
        </Alert>
      )}
      {/* Table */}
      {!playersLoading && !playersError && (
        <>
          {players.length > 0
            ? (
              <>
              <TableContainer
                component={Paper}
                sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", overflowX: "auto" }}
              >
                <Table sx={{ width: "100%" }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "action.hover" }}>
                      <TableCell sx={{ fontWeight: 600, width: "20%" }}>
                        Player
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, width: "20%" }}>
                        Role
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, width: "20%" }}>
                        Status
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, width: "20%" }}>
                        Joined
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, width: "10%" }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {players.map((player) => {
                      const slot = getPlayerSlot(player);
                      const displayInfo = { ...playerDisplay(player, slot), statusChip: STATUS_CHIPS[slot.state] };
                      const isGameMaster = player.role === "Game Master";
                      const isCurrentUser = player.userId === currentUserId;
                      const canRevokeInvite = slot.state === "pending" && canManageInvites && !campaign.deletedAt;
                      const canEditPlayer =
                        (!campaign.deletedAt && (canManagePlayers && (!isGameMaster || slot.state !== "assigned") || isCurrentUser))
                        || canRevokeInvite;

                      return (
                        <TableRow
                          key={player.id}
                          hover
                          sx={{
                            position: "relative",
                            ...ROW_ACTIONS_HOVER_SX,
                          }}
                        >
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {displayInfo.name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                {displayInfo.email}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={isGameMaster
                                ? <GMIcon sx={{ fontSize: 14 }} />
                                : <PlayerIcon sx={{ fontSize: 14 }} />}
                              label={player.role}
                              size="small"
                              color={isGameMaster ? "warning" : "primary"}
                              variant="filled"
                              sx={{ fontWeight: 500 }}
                            />
                          </TableCell>
                          <TableCell>
                            {displayInfo.statusChip
                              ? (
                                <Chip
                                  icon={displayInfo.statusChip.icon}
                                  label={displayInfo.statusChip.label}
                                  size="small"
                                  color={displayInfo.statusChip.color}
                                  variant="outlined"
                                  sx={{ fontWeight: 500 }}
                                />
                              )
                              : (
                                <Chip
                                  icon={<PlayerIcon sx={{ fontSize: 14 }} />}
                                  label="Active"
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  sx={{ fontWeight: 500 }}
                                />
                              )}
                          </TableCell>
                          <TableCell>
                            {slot.state === "assigned"
                              ? (
                                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                  {formatDate(player.createdAt)}
                                </Typography>
                              )
                              : (
                                <Typography variant="body2" sx={{ color: "text.disabled" }}>
                                  —
                                </Typography>
                              )}
                          </TableCell>
                          <TableCell>
                            {canEditPlayer && (
                              <Box
                                className="row-actions"
                                sx={{
                                  ...ROW_ACTIONS_SX,
                                  display: "flex",
                                  gap: 0.5,
                                }}
                              >
                                {canManagePlayers && (
                                  <Tooltip title="Edit">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditPlayer(player);
                                      }}
                                      sx={{ color: "primary.main" }}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                {slot.state === "pending" && canManageInvites && !campaign.deletedAt && (
                                  <Tooltip title="Revoke Invite">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRevokeInvite(slot.pendingInvite.id);
                                      }}
                                      sx={{ color: "warning.main" }}
                                      disabled={revokeInviteMutation.isPending}
                                    >
                                      <RevokeIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title={isCurrentUser ? "Leave" : "Remove"}>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemovePlayer(player);
                                    }}
                                    sx={{ color: isCurrentUser ? "warning.main" : "error.main" }}
                                  >
                                    {isCurrentUser
                                      ? <LeaveIcon fontSize="small" />
                                      : <DeleteIcon fontSize="small" />}
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <LoadMoreButton
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              />
              </>
            )
            : searchQuery ? (
              <NoMatchesState search={searchQuery} />
            ) : (
              <BlankState
                icon={PlayerIcon}
                title="No players in this campaign"
                description="Add players to start your adventure together"
                action={
                  canManagePlayers && !campaign.deletedAt ? (
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      size="large"
                      onClick={handleAddPlayer}
                    >
                      Add Your First Player
                    </Button>
                  ) : undefined
                }
              />
            )}
        </>
      )}
      {/* Add Player Dialog */}
      <AddPlayerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        form={addForm}
        onSubmit={confirmAddPlayer}
        isLoading={addMutation.isPending}
      />
      {/* Edit Player Dialog */}
      <EditPlayerDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        form={editForm}
        onSubmit={confirmEditPlayer}
        isLoading={editMutation.isPending}
        slot={selectedSlot}
      />
      {/* Remove Player Dialog */}
      <RemovePlayerDialog
        open={removeDialogOpen}
        onClose={() => setRemoveDialogOpen(false)}
        onConfirm={confirmRemovePlayer}
        isLoading={removeMutation.isPending}
        isSelfRemoval={selectedPlayer?.userId === currentUserId}
        slot={selectedSlot}
      />
      {/* Revoke Invite Dialog */}
      <ConfirmDialog
        open={revokeDialogOpen}
        onClose={() => setRevokeDialogOpen(false)}
        title="Confirm Revoke"
        message="Are you sure you want to revoke this invitation? This action cannot be undone."
        onConfirm={confirmRevokeInvite}
        confirmLabel="Revoke Invitation"
        isLoading={revokeInviteMutation.isPending}
      />
    </SectionContent>
  );
}
