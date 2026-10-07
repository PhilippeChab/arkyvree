import {
  Box,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AddButton,
  BlankState,
  ConfirmDialog,
  DiceSpinner,
  EmptyValue,
  LoadError,
  LoadMoreButton,
  NoMatchesState,
  ROW_ACTIONS_HOVER_SX,
  ROW_ACTIONS_SX,
  SearchBar,
  SectionContent,
  TableFrame,
} from "@/client/src/components/common/index.ts";
import {
  DeleteIcon,
  EditIcon,
  GMIcon,
  LeaveIcon,
  PendingIcon,
  PlayerIcon,
  RevokeIcon,
  UnassignedIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith, useSearchText } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
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
import {
  campaignPlayersQuery,
  invalidateCampaignPlayers,
} from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface PlayersSectionProps {
  campaign: CampaignDetail;
}

const STATUS_CHIPS = {
  assigned: null,
  pending: { icon: <PendingIcon sx={{ fontSize: 14 }} />, label: "Invite Pending", color: "warning" },
  unassigned: { icon: <UnassignedIcon sx={{ fontSize: 14 }} />, label: "Unassigned", color: "default" },
} as const satisfies Record<PlayerState, { color: "warning" | "default"; icon: ReactNode; label: string } | null>;

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
  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("playerSearch");

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);

  const { canManagePlayers, canManageInvites } = useCampaignPermissions(campaign);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const addForm = useFormWith<PlayerFormData>({
    role: "Player Character",
    email: "",
  });

  const editForm = useFormWith<PlayerFormData>({
    role: "Player Character",
    email: "",
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
  const playersLoadFailed = !!playersError && !data;

  const addMutation = useMutation({
    mutationFn: async (data: PlayerFormData) => {
      return parseResponse(
        rpc.api.campaigns[":id"].players.$post({
          param: { id: campaign.id },
          json: toPlayerPayload(data),
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Player added");
      invalidateCampaignPlayers(queryClient, campaign.id);
      setAddDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to add player");
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ playerId, data }: { data: PlayerFormData; playerId: string }) => {
      return parseResponse(
        rpc.api.campaigns[":id"].players[":playerId"].$put({
          param: { id: campaign.id, playerId },
          json: toPlayerPayload(data),
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Player updated");
      invalidateCampaignPlayers(queryClient, campaign.id);
      setEditDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update player");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return parseResponse(
        rpc.api.campaigns[":id"].players[":playerId"].$delete({
          param: { id: campaign.id, playerId },
        }),
      );
    },
    onSuccess: () => {
      const removedSelf = selectedPlayer?.userId === currentUserId;
      snackbar.success(removedSelf ? "You left the campaign" : "Player removed");
      if (removedSelf) {
        navigate("/campaigns", { replace: true });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.lists });
      } else {
        invalidateCampaignPlayers(queryClient, campaign.id, true);
        setRemoveDialogOpen(false);
      }
    },
    onError: (error) => {
      snackbar.error(error, "Failed to remove player");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return parseResponse(
        rpc.api.campaigns.invites[":inviteId"].revoke.$post({
          param: { inviteId },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaign.id, "players") });
      setRevokeDialogOpen(false);
      setSelectedInviteId(null);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to revoke invitation");
    },
  });

  const handleRevokeInvite = (inviteId: string) => {
    setSelectedInviteId(inviteId);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeInvite = () => {
    if (selectedInviteId) revokeInviteMutation.mutate(selectedInviteId);
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
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search players…"
          actions={
            canManagePlayers && !campaign.deletedAt && <AddButton label="Add Player" onClick={handleAddPlayer} />
          }
        />
        {/* Loading State */}
        {playersLoading && <DiceSpinner sx={{ py: 4 }} />}
        {/* Error State: only while nothing has loaded, a failed refetch keeping the table */}
        {playersLoadFailed && (
          // The room below the error, at the end of the tab
          <Box sx={{ pb: 3 }}>
            <LoadError what="Players" error={playersError} />
          </Box>
        )}
        {/* Table */}
        {!playersLoading &&
          !playersLoadFailed &&
          (players.length > 0 ? (
            <Stack spacing={2}>
              <TableFrame>
                <Table sx={{ width: "100%" }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: "20%" }}>Player</TableCell>
                      <TableCell sx={{ width: "20%" }}>Role</TableCell>
                      <TableCell sx={{ width: "20%" }}>Status</TableCell>
                      <TableCell sx={{ width: "20%" }}>Joined</TableCell>
                      <TableCell sx={{ width: "10%" }}>Actions</TableCell>
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
                        (!campaign.deletedAt &&
                          ((canManagePlayers && (!isGameMaster || slot.state !== "assigned")) || isCurrentUser)) ||
                        canRevokeInvite;

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
                              icon={
                                isGameMaster ? <GMIcon sx={{ fontSize: 14 }} /> : <PlayerIcon sx={{ fontSize: 14 }} />
                              }
                              label={player.role}
                              size="small"
                              color={isGameMaster ? "warning" : "primary"}
                              variant="filled"
                              sx={{ fontWeight: 500 }}
                            />
                          </TableCell>
                          <TableCell>
                            {displayInfo.statusChip ? (
                              <Chip
                                icon={displayInfo.statusChip.icon}
                                label={displayInfo.statusChip.label}
                                size="small"
                                color={displayInfo.statusChip.color}
                                variant="outlined"
                                sx={{ fontWeight: 500 }}
                              />
                            ) : (
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
                            {slot.state === "assigned" ? (
                              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                {formatDate(player.createdAt)}
                              </Typography>
                            ) : (
                              <EmptyValue />
                            )}
                          </TableCell>
                          <TableCell>
                            {canEditPlayer && (
                              <Stack className="row-actions" direction="row" spacing={0.5} sx={ROW_ACTIONS_SX}>
                                {canManagePlayers && (
                                  <Tooltip title="Edit">
                                    <IconButton
                                      aria-label="Edit"
                                      size="small"
                                      onClick={() => handleEditPlayer(player)}
                                      sx={{ color: "primary.main" }}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                {slot.state === "pending" && canManageInvites && !campaign.deletedAt && (
                                  <Tooltip title="Revoke Invite">
                                    <span>
                                      <IconButton
                                        aria-label="Revoke Invite"
                                        size="small"
                                        onClick={() => handleRevokeInvite(slot.pendingInvite.id)}
                                        sx={{ color: "warning.main" }}
                                        disabled={revokeInviteMutation.isPending}
                                      >
                                        <RevokeIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                )}
                                <Tooltip title={isCurrentUser ? "Leave" : "Remove"}>
                                  <IconButton
                                    aria-label={isCurrentUser ? "Leave" : "Remove"}
                                    size="small"
                                    onClick={() => handleRemovePlayer(player)}
                                    sx={{ color: isCurrentUser ? "warning.main" : "error.main" }}
                                  >
                                    {isCurrentUser ? <LeaveIcon fontSize="small" /> : <DeleteIcon fontSize="small" />}
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableFrame>

              <LoadMoreButton
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              />
            </Stack>
          ) : searchQuery ? (
            <NoMatchesState search={searchQuery} />
          ) : (
            <BlankState
              icon={PlayerIcon}
              title="No players in this campaign"
              description="Add players to start your adventure together"
              action={
                canManagePlayers && !campaign.deletedAt ? (
                  <AddButton variant="outlined" size="large" label="Add Your First Player" onClick={handleAddPlayer} />
                ) : undefined
              }
            />
          ))}
      </Stack>
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
