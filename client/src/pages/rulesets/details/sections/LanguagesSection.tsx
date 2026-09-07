import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Translate as LanguagesIcon } from "@mui/icons-material";
import { Box, Button, TextField, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const LANGUAGES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "20%" },
  { key: "description", label: "Description", width: "55%" },
];

type LanguagesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["languages"]["$get"]>;
type LanguagesPaginated = Exclude<LanguagesResponse, { error: string }>;
type Language = LanguagesPaginated["items"][number];

type LanguageFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["languages"]["$post"]
>["json"];

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
    currentUserId,
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
      const response = await rpc.api.rulesets[":id"].languages.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create language");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/languages/${(data as { id: string }).id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "languages"), searchQuery, childOnly],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].languages.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch languages");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const languages = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleRowClick = (language: Language) => {
    navigate(`/rulesets/${ruleset.id}/languages/${language.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((language: Language) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "languages", language.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].languages[":languageId"].$get({
          param: { id: ruleset.id, languageId: language.id },
        });
        if (!response.ok) throw new Error("Failed to fetch language");
        return response.json();
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
        emptyIcon={<LanguagesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No languages"
        emptyDescription="No languages available for this ruleset."
      />

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

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Language"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <TextField
          {...createForm.register("name", { required: "Name is required" })}
          label="Name"
          fullWidth
          error={!!createForm.formState.errors.name}
          helperText={createForm.formState.errors.name?.message}
        />
        <TextField
          {...createForm.register("description")}
          label="Description"
          fullWidth
          multiline
          minRows={3}
          sx={{ "& textarea": { resize: "vertical" } }}
        />
        <TextField
          {...createForm.register("type")}
          label="Type"
          fullWidth
          placeholder="e.g., Spoken, Written, Sign"
        />
      </CreateDialog>
    </Box>
  );
}
