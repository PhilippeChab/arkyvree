import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { LanguageFormFields, type LanguageFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Translate as LanguagesIcon } from "@mui/icons-material";
import { Box, Button, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { languagesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const LANGUAGES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "20%" },
  { key: "description", label: "Description", width: "55%" },
];

type LanguagesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["languages"]["$get"], 200>;
type Language = LanguagesPaginated["items"][number];


interface LanguagesSectionProps {
  ruleset: { id: string; name: string; rulesetId?: string | null; userId?: string | null; status?: string };
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export function LanguagesSection({ ruleset, childOnly, onChildOnlyChange }: LanguagesSectionProps) {
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
  } = useRulesetSection<Language, LanguageFormData>({
    rulesetId: ruleset.id,
    sectionName: "languages",
    label: "Language",
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].languages.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/languages/${created.id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...languagesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const languages = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (language: Language) => {
    navigate(`/rulesets/${ruleset.id}/languages/${language.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((language: Language) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "languages", language.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].languages[":languageId"].$get({
          param: { id: ruleset.id, languageId: language.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (language: Language, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return language.name;
      case "type":
        return language.type || "\u2014";
      case "description":
        return (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical"
            }}>
            {language.description || "\u2014"}
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
        searchPlaceholder="Search languages..."
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
                Add Language
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={languages}
        isLoading={isLoading}
        columns={LANGUAGES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={LanguagesIcon}
        emptyTitle="No languages"
        emptyDescription="No languages available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Language"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <LanguageFormFields form={createForm} />
      </CreateDialog>
    </Box>
  );
}
