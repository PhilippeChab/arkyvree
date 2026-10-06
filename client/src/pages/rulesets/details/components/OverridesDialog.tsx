import {
  Box,
  Button,
  Chip,
  Collapse,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { Link } from "react-router-dom";

import { BlankState, DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { CompareIcon, RestoreIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type Change = ChangesResponse[number];

type ChangesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["changes"]["$get"], 200>;

interface OverridesDialogProps {
  open: boolean;
  onClose: () => void;
  rulesetId: string;
  /** The ruleset's base rules, whose words name the entity types */
  baseRules: string;
  canEdit?: boolean;
}

/** A change the fork can undo: an entity it modified or deleted, which the restore route takes back. */
type RestorableChange = Extract<Change, { sourceEntityId: string }>;

const restoreApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].restore;

function getEntityUrl(rulesetId: string, change: Change): string | undefined {
  if (change.status === "deleted") return undefined;
  const { entityType, entityId } = change;
  return isOneOf(entityType, CUSTOMIZATION_PAGE_TYPES)
    ? `/rulesets/${rulesetId}/${buildCustomizationPath(entityType, entityId)}`
    : `/rulesets/${rulesetId}/${getUrlSegment(entityType)}/${entityId}`;
}

export function OverridesDialog({ open, onClose, rulesetId, baseRules, canEdit = false }: OverridesDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const { data: changes, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.changes(rulesetId),
    queryFn: async () => {
      return parseResponse(
        rpc.api.rulesets[":id"].changes.$get({
          param: { id: rulesetId },
        }),
      );
    },
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const revertMutation = useMutation({
    mutationFn: async ({ entityType, sourceEntityId }: Pick<RestorableChange, "entityType" | "sourceEntityId">) => {
      return parseResponse(
        restoreApi.$post({ param: { id: rulesetId, entityType: getUrlSegment(entityType), entityId: sourceEntityId } }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.detail(rulesetId) });
      snackbar.success("Change reverted");
    },
    onError: (err) => {
      snackbar.error(err, "Failed to revert change");
    },
  });

  // Group changes by entity type
  const grouped = new Map<string, Change[]>();
  if (changes) {
    for (const change of changes) {
      const group = grouped.get(change.entityType) ?? [];
      group.push(change);
      grouped.set(change.entityType, group);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <DialogTitle>Local Changes</DialogTitle>
      <DialogContent sx={{ maxHeight: "60vh" }}>
        <Stack spacing={3}>
          {isLoading && <DiceSpinner sx={{ py: 4 }} />}
          <Collapse in={!isLoading && !!changes && changes.length === 0} unmountOnExit>
            <BlankState icon={CompareIcon} title="No local changes" />
          </Collapse>
          <Collapse in={!isLoading && !!changes && changes.length > 0} unmountOnExit>
            <Stack spacing={2}>
              {[...grouped.entries()].map(([entityType, items]) => (
                <Paper key={entityType} variant="outlined" sx={{ overflow: "hidden" }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ px: 2, py: 1, bgcolor: "action.hover", alignItems: "center" }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {entityTypeLabel(entityType, baseRules, true)}
                    </Typography>
                    <Chip label={items.length} size="tiny" />
                  </Stack>
                  <List dense disablePadding>
                    {items.map((change) => {
                      const key = change.status === "deleted" ? change.sourceEntityId : change.entityId;
                      const chipColor =
                        change.status === "modified" ? "info" : change.status === "deleted" ? "error" : "success";
                      const url = getEntityUrl(rulesetId, change);
                      const showRevert = canEdit && change.status !== "added";
                      const rowContent = (
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <ListItemText primary={change.name} sx={{ my: 0, flexGrow: 0 }} />
                          <Chip
                            label={change.status}
                            color={chipColor}
                            variant="outlined"
                            size="tiny"
                            sx={{ flexShrink: 0 }}
                          />
                        </Stack>
                      );
                      return (
                        <ListItem key={key} disablePadding sx={{ pr: showRevert ? 1 : 0 }}>
                          {url ? (
                            <ListItemButton component={Link} to={url} target="_blank">
                              {rowContent}
                            </ListItemButton>
                          ) : (
                            <Box sx={{ px: 2, py: 1, flex: 1 }}>{rowContent}</Box>
                          )}
                          {showRevert && (
                            <Tooltip title="Revert to parent version">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  revertMutation.mutate({
                                    entityType: change.entityType,
                                    sourceEntityId: change.sourceEntityId,
                                  })
                                }
                                disabled={revertMutation.isPending}
                                sx={{ flexShrink: 0, ml: 0.5 }}
                              >
                                <DiceSpinner
                                  size="small"
                                  loading={
                                    revertMutation.isPending &&
                                    revertMutation.variables?.sourceEntityId === change.sourceEntityId
                                  }
                                >
                                  <RestoreIcon fontSize="small" />
                                </DiceSpinner>
                              </IconButton>
                            </Tooltip>
                          )}
                        </ListItem>
                      );
                    })}
                  </List>
                </Paper>
              ))}
            </Stack>
          </Collapse>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Close
        </Button>
      </DialogActions>
    </Modal>
  );
}
