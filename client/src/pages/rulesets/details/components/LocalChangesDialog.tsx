import {
  Box,
  Collapse,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { Link } from "react-router-dom";

import {
  BlankNote,
  CountChip,
  DialogFooter,
  DiceSpinner,
  LoadError,
  Modal,
  RowAction,
  StatusChip,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";
import { RestoreIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { rulesetChangesQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type Change = ChangesResponse[number];

type ChangesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["changes"]["$get"], 200>;

interface LocalChangesDialogProps {
  /** The ruleset's base rules, whose words name the entity types */
  baseRules: BaseRules;
  canEdit?: boolean;
  onClose: () => void;
  open: boolean;
  rulesetId: string;
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

export function LocalChangesDialog({ open, onClose, rulesetId, baseRules, canEdit = false }: LocalChangesDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const {
    data: changes,
    isLoading,
    error,
  } = useQuery({
    ...rulesetChangesQuery(rulesetId),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const revertMutation = useMutation({
    mutationFn: async ({ entityType, sourceEntityId }: Pick<RestorableChange, "entityType" | "sourceEntityId">) =>
      parseResponse(
        restoreApi.$post({ param: { id: rulesetId, entityType: getUrlSegment(entityType), entityId: sourceEntityId } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.detail(rulesetId) });
      snackbar.success("Change reverted");
    },
    onError: (error) => {
      snackbar.error(error, "Failed to revert change");
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
        {isLoading && <DiceSpinner sx={{ py: 4 }} />}
        {!!error && !changes && <LoadError what="Local Changes" error={error} />}
        <Collapse in={!isLoading && !!changes && changes.length === 0} timeout={DURATION.normal} unmountOnExit>
          <BlankNote sx={{ py: 2 }}>No local changes</BlankNote>
        </Collapse>
        <Collapse in={!isLoading && !!changes && changes.length > 0} timeout={DURATION.moderate} unmountOnExit>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {[...grouped.entries()].map(([entityType, items]) => (
              <Paper key={entityType} variant="outlined" sx={{ overflow: "hidden" }}>
                <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, bgcolor: "action.hover", alignItems: "center" }}>
                  <SubsectionTitle>{entityTypeLabel(entityType, baseRules, true)}</SubsectionTitle>
                  <CountChip label={items.length} />
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
                        <StatusChip label={change.status} color={chipColor} />
                      </Stack>
                    );
                    return (
                      <ListItem key={key} disablePadding sx={{ gap: 0.5, pr: showRevert ? 1 : 0 }}>
                        {url ? (
                          <ListItemButton component={Link} to={url} target="_blank">
                            {rowContent}
                          </ListItemButton>
                        ) : (
                          <Box sx={{ px: 2, py: 1, flex: 1 }}>{rowContent}</Box>
                        )}
                        {showRevert && (
                          <RowAction
                            icon={RestoreIcon}
                            label="Revert to Parent Version"
                            onClick={() =>
                              revertMutation.mutate({
                                entityType: change.entityType,
                                sourceEntityId: change.sourceEntityId,
                              })
                            }
                            disabled={revertMutation.isPending}
                            pending={
                              revertMutation.isPending &&
                              revertMutation.variables.sourceEntityId === change.sourceEntityId
                            }
                          />
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            ))}
          </Stack>
        </Collapse>
      </DialogContent>
      <DialogFooter onCancel={onClose} cancelLabel="Close" />
    </Modal>
  );
}
