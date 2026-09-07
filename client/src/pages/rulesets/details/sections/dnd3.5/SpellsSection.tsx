import {
  AptitudeAutocomplete,
  AptitudesAutocomplete,
  SavesAutocomplete,
  type Aptitude,
  type Save,
} from "@/client/src/components/customization/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Bolt as PowersIcon } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback, useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import type { PowersSectionProps } from "../../sectionFactory.ts";
import {
  SPELL_SCHOOLS,
  SPELL_SUBSCHOOLS,
  SPELL_DESCRIPTORS,
  SPELL_COMPONENTS,
  SPELL_RANGE_TYPES,
  SPELL_RESISTANCE_OPTIONS,
} from "@/shared/dnd3.5/spells.ts";

const SPELLS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "aptitudes", label: "Aptitudes", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];

type SpellsResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"]>;
type SpellsPaginated = Exclude<SpellsResponse, { error: string }>;
type Spell = SpellsPaginated["items"][number];

type SpellFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["powers"]["$post"]>["json"];

type SpellAptitude = {
  aptitudeId: string;
  level: number | null;
  aptitudesInRule?: Aptitude;
};

function SpellPropertyFields({ form }: { form: UseFormReturn<SpellFormData> }) {
  return (
    <>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <Controller
          name="school"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ""}
              label="School"
              fullWidth
              select
            >
              <MenuItem value="">None</MenuItem>
              {SPELL_SCHOOLS.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          name="subschool"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ""}
              label="Subschool"
              fullWidth
              select
            >
              <MenuItem value="">None</MenuItem>
              {SPELL_SUBSCHOOLS.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <Controller
        name="descriptors"
        control={form.control}
        render={({ field }) => (
          <Autocomplete
            multiple
            freeSolo
            options={SPELL_DESCRIPTORS}
            value={field.value ?? []}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getItemProps({ index });
                return <Chip key={key} label={option} size="small" {...tagProps} />;
              })
            }
            renderInput={(params) => <TextField {...params} label="Descriptors" />}
          />
        )}
      />
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <TextField
          {...form.register("castingTime")}
          label="Casting Time"
          fullWidth
          placeholder='e.g., "1 standard action"'
        />
        <Controller
          name="rangeType"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ""}
              label="Range"
              fullWidth
              select
            >
              <MenuItem value="">None</MenuItem>
              {SPELL_RANGE_TYPES.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <TextField
          {...form.register("target")}
          label="Target"
          fullWidth
          placeholder='e.g., "One creature"'
        />
        <TextField
          {...form.register("areaOfEffect")}
          label="Area of Effect"
          fullWidth
          placeholder='e.g., "20-ft. radius"'
        />
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", sm: "row" } }}>
        <TextField
          {...form.register("duration")}
          label="Duration"
          fullWidth
          placeholder='e.g., "1 round/level"'
        />
        <Controller
          name="spellResistance"
          control={form.control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ""}
              label="Spell Resistance"
              fullWidth
              select
            >
              <MenuItem value="">None</MenuItem>
              {SPELL_RESISTANCE_OPTIONS.map((sr) => (
                <MenuItem key={sr} value={sr}>{sr}</MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>
      <Controller
        name="components"
        control={form.control}
        render={({ field }) => (
          <Autocomplete
            multiple
            freeSolo
            options={SPELL_COMPONENTS}
            value={field.value ?? []}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getItemProps({ index });
                return <Chip key={key} label={option} size="small" {...tagProps} />;
              })
            }
            renderInput={(params) => <TextField {...params} label="Components" />}
          />
        )}
      />
    </>
  );
}

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
  const [selectedCreateSave, setSelectedCreateSave] = useState<Save | null>(null);

  const {
    currentUserId,
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
      const response = await rpc.api.rulesets[":id"].powers.$post({
        param: { id: ruleset.id },
        json: {
          ...data,
          saveId: selectedCreateSave?.id ?? null,
          aptitudes: selectedCreateAptitudes.map((a) => {
            const meta = createAptitudeMetadata.get(a.id);
            return { id: a.id, level: meta?.level };
          }) as SpellFormData["aptitudes"],
        },
      });
      if (!response.ok) throw new Error("Failed to create spell");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/powers/${(data as { id: string }).id}/customization`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "powers"), searchQuery, childOnly, selectedAptitude?.id, selectedLevel],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].powers.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
          aptitudeId: selectedAptitude?.id,
          level: selectedLevel !== "" ? selectedLevel.toString() : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch spells");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const spells = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleCreate = () => {
    setSelectedCreateAptitudes([]);
    setCreateAptitudeMetadata(new Map());
    setSelectedCreateSave(null);
    setCreateDialogOpen(true);
  };

  const handleRowClick = (spell: Spell) => {
    navigate(`/rulesets/${ruleset.id}/powers/${spell.id}/customization`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((spell: Spell) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "powers", spell.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].powers[":powerId"].$get({
          param: { id: ruleset.id, powerId: spell.id },
        });
        if (!response.ok) throw new Error("Failed to fetch spell");
        return response.json();
      },
    });
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

  const updateMetadata = (
    setter: typeof setCreateAptitudeMetadata,
    aptitudeId: string,
    update: Partial<{ level: number | undefined }>,
  ) => {
    setter((prev) => {
      const next = new Map(prev);
      const entry = { ...next.get(aptitudeId), ...update };
      next.set(aptitudeId, entry);
      return next;
    });
  };

  const aptitudeMetadataFields = (
    aptitudes: Aptitude[],
    metadata: Map<string, { level?: number }>,
    setter: typeof setCreateAptitudeMetadata,
  ) => {
    if (aptitudes.length === 0) return null;
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="subtitle2" sx={{
          color: "text.secondary"
        }}>Aptitude Settings</Typography>
        {aptitudes.map((apt) => {
          const meta = metadata.get(apt.id) ?? {};
          return (
            <Box key={apt.id} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{apt.name}</Typography>
              <TextField
                label="Level"
                type="number"
                size="small"
                slotProps={{ htmlInput: { min: 0, max: 9 } }}
                value={meta.level ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateMetadata(setter, apt.id, { level: v === "" ? undefined : parseInt(v) });
                }}
                sx={{ width: 80 }}
              />
            </Box>
          );
        })}
      </Box>
    );
  };

  const saveFields = () => (
    <>
      <SavesAutocomplete
        rulesetId={ruleset.id}
        value={selectedCreateSave}
        onChange={(save) => {
          setSelectedCreateSave(save);
          createForm.setValue("saveId", save?.id ?? null);
        }}
        enabled={createDialogOpen}
      />
      <TextField
        {...createForm.register("saveEffect")}
        label="Save Effect"
        fullWidth
        placeholder='e.g., "negates", "half", "partial"'
      />
    </>
  );

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
        emptyIcon={<PowersIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No spells"
        emptyDescription="No spells available for this ruleset."
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
        title="Create New Spell"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="md"
        fixedHeight
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
        <SpellPropertyFields form={createForm} />
        <AptitudesAutocomplete
          rulesetId={ruleset.id}
          value={selectedCreateAptitudes}
          onChange={setSelectedCreateAptitudes}
        />
        {aptitudeMetadataFields(selectedCreateAptitudes, createAptitudeMetadata, setCreateAptitudeMetadata)}
        {saveFields()}
      </CreateDialog>
    </Box>
  );
}
