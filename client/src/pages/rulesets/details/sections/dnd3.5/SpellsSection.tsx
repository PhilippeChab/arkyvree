import { AptitudeAutocomplete, type Aptitude } from "@/client/src/components/customization/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Bolt as PowersIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRulesetSaves, useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { PowersSectionProps } from "../../sectionFactory.ts";
import { powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { SpellFormFields, type SpellFormData } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";

const SPELLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];

type SpellsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"], 200>;
type Spell = SpellsPaginated["items"][number];

type SpellAptitude = {
  aptitudeId: string;
  level: number | null;
  aptitudesInRule?: Aptitude;
};


export function SpellsSection({ ruleset, childOnly, onChildOnlyChange }: PowersSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");
  const [selectedAptitude, setSelectedAptitude] = useState<Aptitude | null>(null);
  const [levelParam, setLevelParam] = useSearchParam("level");
  const parsed = Number(levelParam);
  const selectedLevel: number | "" = levelParam === "" || Number.isNaN(parsed) ? "" : parsed;
  const [selectedCreateAptitudes, setSelectedCreateAptitudes] = useState<Aptitude[]>([]);
  const [createAptitudeMetadata, setCreateAptitudeMetadata] = useState<Map<string, { level?: number }>>(new Map());

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
  } = useRulesetSection<Spell, SpellFormData>({
    rulesetId: ruleset.id,
    sectionName: "powers",
    label: "Power",
    createFn: async (data) => {
      if (selectedCreateAptitudes.length === 0) {
        throw new Error("At least one aptitude must be selected");
      }
      return parseResponse(rpc.api.rulesets[":id"].powers.$post({
        param: { id: ruleset.id },
        json: {
          ...data,
          aptitudes: selectedCreateAptitudes.map((a) => {
            const level = createAptitudeMetadata.get(a.id)?.level;
            return level === undefined ? { id: a.id } : { id: a.id, level };
          }),
        },
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/powers/${created.id}/customization`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...powersQuery(ruleset.id, {
      search: searchQuery,
      childOnly,
      aptitudeId: selectedAptitude?.id,
      level: selectedLevel === "" ? undefined : selectedLevel,
    }),
    placeholderData: keepPreviousData,
  });

  const spells = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const { data: createSaves = [] } = useRulesetSaves(ruleset.id, createDialogOpen);

  const handleCreate = () => {
    setSelectedCreateAptitudes([]);
    setCreateAptitudeMetadata(new Map());
    setCreateDialogOpen(true);
  };

  const handleRowClick = (spell: Spell) => {
    navigate(`/rulesets/${ruleset.id}/powers/${spell.id}/customization`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((spell: Spell) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "powers", spell.id));
  }, [queryClient, ruleset.id]);

  const renderCell = (spell: Spell, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return spell.name;
      case "aptitudes":
        return (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {spell.powersAptitudesInRules && spell.powersAptitudesInRules.length > 0
              ? (
                spell.powersAptitudesInRules.map((spellAptitude: SpellAptitude) => (
                  <Chip
                    key={spellAptitude.aptitudeId}
                    label={spellAptitude.aptitudesInRule?.name || "Unknown"}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              )
              : (
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  -
                </Typography>
              )}
          </Box>
        );
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {spell.description || "-"}
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
        searchPlaceholder="Search spells..."
        filters={
          <>
            <Box sx={{ width: { xs: "100%", sm: 200 } }}>
              <AptitudeAutocomplete
                rulesetId={ruleset.id}
                value={selectedAptitude}
                onChange={setSelectedAptitude}
                size="small"
                scope="spells"
              />
            </Box>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Level</InputLabel>
              <Select
                value={selectedLevel}
                label="Level"
                onChange={(e) => setLevelParam(String(e.target.value))}
              >
                <MenuItem value="">All</MenuItem>
                {Array.from({ length: 10 }, (_, i) => (
                  <MenuItem key={i} value={i}>{i}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        }
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
                Add Spell
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={spells}
        isLoading={isLoading}
        columns={SPELLS_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={PowersIcon}
        emptyTitle="No spells"
        emptyDescription="No spells available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Spell"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="md"
        fixedHeight
      >
        <SpellFormFields
          form={createForm}
          rulesetId={ruleset.id}
          selectedAptitudes={selectedCreateAptitudes}
          onAptitudesChange={setSelectedCreateAptitudes}
          aptitudeMetadata={createAptitudeMetadata}
          onAptitudeMetadataChange={setCreateAptitudeMetadata}
          saves={createSaves}
        />
      </CreateDialog>
    </Box>
  );
}
