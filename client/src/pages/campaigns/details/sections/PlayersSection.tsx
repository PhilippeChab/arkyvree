import { BlankState, ConfirmDialog, SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import {
  AddPlayerDialog,
  type AddPlayerFormData,
  EditPlayerDialog,
  type EditPlayerFormData,
  RemovePlayerDialog,
} from "@/client/src/pages/campaigns/components/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Add as AddIcon,
  Close as RevokeIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExitToApp as LeaveIcon,
  AdminPanelSettings as GMIcon,
  HourglassEmpty as PendingIcon,
  Person as PlayerIcon,
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
import type { InferResponseType } from "hono/client";
import { useDebouncedValue, useIsMobile } from "@/client/src/hooks/index.ts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

type PlayersResponse = InferResponseType<(typeof rpc.api.campaigns)[":id"]["players"]["$get"]>;
type PlayersPaginated = Exclude<PlayersResponse, { error: string }>;
type Player = PlayersPaginated["items"][number];

interface PlayersSectionProps {
  campaign: {
    id: string;
    name: string;
    currentUserRole: string | null;
    deletedAt: string | null;
  };
}

// Helper function to determine player state
function getPlayerState(player: Player): "assigned" | "pending" | "unassigned" {
  // Player is assigned if they have a userId and usersInAccount
  if (player.userId && player.usersInAccount?.id) {
    return "assigned";
  }

  // Player has pending invitation if there's an active invite
  if (player.invitesInCampaigns && player.invitesInCampaigns.length > 0) {
    const pendingInvite = player.invitesInCampaigns[0]; // Latest invite due to ordering
    if (pendingInvite.status === "Pending") {
      return "pending";
    }
  }

  // Otherwise unassigned
  return "unassigned";
}

// Helper function to get player display info
function getPlayerDisplayInfo(player: Player) {
  const state = getPlayerState(player);

  switch (state) {
    case "assigned":
      return {
        name: player.usersInAccount?.username ?? `Player ${player.id.slice(0, 4)}`,
        email: player.usersInAccount?.emailAddress,
        statusChip: null,
      };
    case "pending": {
      const pendingInvite = player.invitesInCampaigns?.[0];
      return {
        name: pendingInvite?.usersInAccount?.username ??
          pendingInvite?.email ??
          `User ${pendingInvite?.userId?.slice(0, 4)}`,
        email: pendingInvite?.usersInAccount?.emailAddress ?? pendingInvite?.email,
        statusChip: {
          icon: <PendingIcon sx={{ fontSize: 14 }} />,
          label: "Invite Pending",
          color: "warning" as const,
        },
      };
    }
    case "unassigned":
      return {
        name: "Unassigned Player Slot",
        email: "No player assigned",
        statusChip: {
          icon: <UnassignedIcon sx={{ fontSize: 14 }} />,
          label: "Unassigned",
          color: "default" as const,
        },
      };
  }
}

export function PlayersSection({ campaign }: PlayersSectionProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Search state with debounce
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);

  // Get permissions for this campaign
  const { canManagePlayers, canManageInvites } = useCampaignPermissions(campaign);
  const { user } = useAuthStore();

  const addForm = useForm<AddPlayerFormData>({
    defaultValues: {
      role: "Player Character",
      email: "",
    },
  });

  const editForm = useForm<EditPlayerFormData>({
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
  } = useInfiniteQuery({
    queryKey: [...queryKeys.campaigns.section(campaign.id, "players"), debouncedSearchQuery],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.campaigns[":id"].players.$get({
        param: { id: campaign.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: debouncedSearchQuery || undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch players");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const players = data?.pages.flatMap((page) => page.items) ?? [];

  const addMutation = useMutation({
    mutationFn: async (data: AddPlayerFormData) => {
      const response = await rpc.api.campaigns[":id"].players.$post({
        param: { id: campaign.id },
        json: {
          role: data.role,
          email: data.email,
        },
      });
      return response.json();
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
    mutationFn: async ({ playerId, data }: { playerId: string; data: EditPlayerFormData }) => {
      const response = await rpc.api.campaigns[":id"].players[":playerId"].$put({
        param: { id: campaign.id, playerId },
        json: {
          role: data.role,
          email: data.email,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Player updated successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      setEditDialogOpen(false);
      setSelectedPlayer(null);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await rpc.api.campaigns[":id"].players[":playerId"].$delete({
        param: { id: campaign.id, playerId },
      });
      return response.json();
    },
    onSuccess: () => {
      const removedSelf = selectedPlayer?.userId === user?.id;
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
        setSelectedPlayer(null);
      }
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const response = await rpc.api.campaigns.invites[":inviteId"].revoke.$post({
        param: { inviteId },
      });
      return response.json();
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
    setAddDialogOpen(true);
  };

  const confirmAddPlayer = (data: AddPlayerFormData) => {
    addMutation.mutate(data);
  };

  const handleEditPlayer = (player: Player) => {
    setSelectedPlayer(player);
    editForm.reset({
      role: player.role,
      email: "",
    });
    setEditDialogOpen(true);
  };

  const confirmEditPlayer = (data: EditPlayerFormData) => {
    if (!selectedPlayer) return;
    editMutation.mutate({ playerId: selectedPlayer.id, data });
  };

  const handleRemovePlayer = (player: Player) => {
    setSelectedPlayer(player);
    setRemoveDialogOpen(true);
  };

  const confirmRemovePlayer = () => {
    if (!selectedPlayer) return;
    removeMutation.mutate(selectedPlayer.id);
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
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
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <DiceSpinner />
        </Box>
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
                      const playerState = getPlayerState(player);
                      const displayInfo = getPlayerDisplayInfo(player);
                      const isGameMaster = player.role === "Game Master";
                      const isCurrentUser = player.userId === user?.id;
                      const canRevokeInvite = playerState === "pending" && canManageInvites && !campaign.deletedAt;
                      const canEditPlayer =
                        (!campaign.deletedAt && (canManagePlayers && (!isGameMaster || playerState !== "assigned") || isCurrentUser))
                        || canRevokeInvite;

                      return (
                        <TableRow
                          key={player.id}
                          hover
                          sx={{
                            position: "relative",
                            "&:hover .row-actions": {
                              opacity: canEditPlayer ? 1 : 0,
                            },
                          }}
                        >
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {displayInfo.name}
                              </Typography>
                              <Typography variant="caption" sx={{
                                color: "text.secondary"
                              }}>
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
                            {playerState === "assigned"
                              ? (
                                <Typography variant="body2" sx={{
                                  color: "text.secondary"
                                }}>
                                  {new Date(player.createdAt).toLocaleDateString()}
                                </Typography>
                              )
                              : (
                                <Typography variant="body2" sx={{
                                  color: "text.disabled"
                                }}>
                                  —
                                </Typography>
                              )}
                          </TableCell>
                          <TableCell>
                            {canEditPlayer && (
                              <Box
                                className="row-actions"
                                sx={{
                                  opacity: isMobile ? 1 : 0,
                                  transition: "opacity 0.2s ease",
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
                                {playerState === "pending" && canManageInvites && !campaign.deletedAt && (
                                  <Tooltip title="Revoke Invite">
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRevokeInvite(player.invitesInCampaigns?.[0]?.id ?? "");
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

              {hasNextPage && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                  <Button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    variant="outlined"
                  >
                    <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
                  </Button>
                </Box>
              )}
              </>
            )
            : (
              <BlankState
                icon={<PlayerIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
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
        onClose={() => {
          setEditDialogOpen(false);
          setSelectedPlayer(null);
        }}
        form={editForm}
        onSubmit={confirmEditPlayer}
        isLoading={editMutation.isPending}
        selectedPlayer={selectedPlayer}
      />
      {/* Remove Player Dialog */}
      <RemovePlayerDialog
        open={removeDialogOpen}
        onClose={() => {
          setRemoveDialogOpen(false);
          setSelectedPlayer(null);
        }}
        onConfirm={confirmRemovePlayer}
        isLoading={removeMutation.isPending}
        isSelfRemoval={selectedPlayer?.userId === user?.id}
        selectedPlayer={selectedPlayer}
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
    </Box>
  );
}
