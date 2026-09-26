import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { SaveFormFields, type SaveFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Shield as SavesIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  ToggleButton,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRulesetAbilities, useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { savesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const SAVES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "description", label: "Description", width: "45%" },
  { key: "ability", label: "Linked Ability", width: "30%" },
];

type SavesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"], 200>;
type Save = SavesPaginated["items"][number];


interface SavesSectionProps {
  ruleset: {
    id: string;
    name: string;
    rulesetId?: string | null;
    userId?: string | null;
    status?: string;
  };
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export function SavesSection({ ruleset, childOnly, onChildOnlyChange }: SavesSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Save, SaveFormData>({
    rulesetId: ruleset.id,
    sectionName: "saves",
    label: "Save",
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].saves.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/saves/${created.id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data: abilities = [] } = useRulesetAbilities(ruleset.id);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...savesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const saves = data?.pages.flatMap((page) => page.items) ?? [];
  const abilityLookup = new Map(abilities.map((a) => [a.id, a.name]));

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (save: Save) => {
    navigate(`/rulesets/${ruleset.id}/saves/${save.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((save: Save) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "saves", save.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].saves[":saveId"].$get({
          param: { id: ruleset.id, saveId: save.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (save: Save, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return save.name;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {save.description || "-"}
          </Typography>
        );
      case "ability":
        return (
          <Typography variant="body2">
            {abilityLookup.get(save.abilityId) || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search saves..."
        actions={
          <>
            {isFork && (
              <ToggleButton
                value="childOnly"
                selected={childOnly}
                onChange={() => onChildOnlyChange(!childOnly)}
                sx={{ textTransform: "none" }}
              >
                Local changes
              </ToggleButton>
            )}
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
              >
                Add Save
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={saves}
        isLoading={isLoading}
        columns={SAVES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={SavesIcon}
        emptyTitle="No saves"
        emptyDescription="No saving throws available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Save"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <SaveFormFields form={createForm} abilities={abilities} />
      </CreateDialog>
    </Box>
  );
}
