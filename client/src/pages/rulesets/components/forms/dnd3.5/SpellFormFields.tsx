import {
  AptitudesAutocomplete,
  type Aptitude,
} from "@/client/src/components/customization/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import {
  Autocomplete,
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { InferRequestType, InferResponseType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";
import {
  SPELL_SCHOOLS,
  SPELL_SUBSCHOOLS,
  SPELL_DESCRIPTORS,
  SPELL_COMPONENTS,
  SPELL_RANGE_TYPES,
  SPELL_RESISTANCE_OPTIONS,
} from "@/shared/dnd3.5/spells.ts";

export type SpellFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["powers"]["$post"]
>["json"];

type SavesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"]>;
type SavesPaginated = Exclude<SavesResponse, { error: string }>;
type Save = SavesPaginated["items"][number];
export type AptitudeMetadata = Map<string, { level?: number }>;

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

interface SpellFormFieldsProps {
  form: UseFormReturn<SpellFormData>;
  rulesetId: string;
  selectedAptitudes: Aptitude[];
  onAptitudesChange: (aptitudes: Aptitude[]) => void;
  aptitudeMetadata: AptitudeMetadata;
  onAptitudeMetadataChange: React.Dispatch<React.SetStateAction<AptitudeMetadata>>;
  saves: Save[];
  hideProperties?: boolean;
}

function updateMetadata(
  setter: React.Dispatch<React.SetStateAction<AptitudeMetadata>>,
  aptitudeId: string,
  field: "level",
  value: number | undefined,
) {
  setter((prev) => {
    const next = new Map(prev);
    const entry = { ...next.get(aptitudeId) };
    if (value === undefined) {
      delete entry[field];
    } else {
      (entry as Record<string, unknown>)[field] = value;
    }
    next.set(aptitudeId, entry);
    return next;
  });
}

export function SpellFormFields({
  form,
  rulesetId,
  selectedAptitudes,
  onAptitudesChange,
  aptitudeMetadata,
  onAptitudeMetadataChange,
  saves,
  hideProperties,
}: SpellFormFieldsProps) {
  return (
    <>
      <TextField
        {...form.register("name", { required: "Name is required" })}
        label="Name"
        fullWidth
        error={!!form.formState.errors.name}
        helperText={form.formState.errors.name?.message}
      />
      <TextField
        {...form.register("description")}
        label="Description"
        fullWidth
        multiline
        minRows={3}
        sx={{ "& textarea": { resize: "vertical" } }}
      />
      <Controller
        name="saveId"
        control={form.control}
        render={({ field }) => (
          <FormControl fullWidth>
            <InputLabel>Saving Throw</InputLabel>
            <Select
              {...field}
              value={field.value && saves.some((s) => s.id === field.value) ? field.value : ""}
              onChange={(e) => field.onChange(e.target.value || null)}
              label="Saving Throw"
            >
              <MenuItem value="">None</MenuItem>
              {saves.map((save) => (
                <MenuItem key={save.id} value={save.id}>{save.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <TextField
        {...form.register("saveEffect")}
        label="Save Effect"
        fullWidth
        placeholder='e.g., "negates", "half", "partial"'
      />
      {!hideProperties && <SpellPropertyFields form={form} />}
      <AptitudesAutocomplete
        rulesetId={rulesetId}
        value={selectedAptitudes}
        onChange={onAptitudesChange}
      />
      {selectedAptitudes.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{
            color: "text.secondary"
          }}>Aptitude Settings</Typography>
          {selectedAptitudes.map((apt) => {
            const meta = aptitudeMetadata.get(apt.id) ?? {};
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
                  updateMetadata(onAptitudeMetadataChange, apt.id, "level", v === "" ? undefined : parseInt(v));
                }}
                sx={{ width: 80 }}
              />
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );
}
