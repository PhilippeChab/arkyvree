import { RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { saveQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { SaveFormFields, type SaveFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Shield as SavesIcon } from "@mui/icons-material";
import {
  Box,
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

export function SavesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

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

  const handleRowClick = (save: Save) => {
    navigate(`/rulesets/${ruleset.id}/saves/${save.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((save: Save) => {
    void queryClient.prefetchQuery(saveQuery(ruleset.id, save.id));
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
          <SectionActions
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel="Add Save"
            onAdd={handleCreate}
          />
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
