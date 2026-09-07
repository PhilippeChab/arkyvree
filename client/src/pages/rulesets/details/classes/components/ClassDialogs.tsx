import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { CreateDialog, Modal } from "@/client/src/components/common/index.ts";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

type SavesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"]>;
type SavesPaginated = Exclude<SavesResponse, { error: string }>;
type RulesetSave = SavesPaginated["items"][number];

type CreateLevelFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$post"]
>["json"];

type FeatAptitudeOption = {
  featId: string;
  aptitudeId: string;
  featName: string;
  aptitudeName: string;
  label: string;
};

interface CreateLevelDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CreateLevelFormData>;
  onSubmit: (data: CreateLevelFormData) => void;
  isLoading: boolean;
  rulesetId: string;
}

export function CreateLevelDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
  rulesetId,
}: CreateLevelDialogProps) {
  // Fetch available feats for this ruleset
  const { data: featsData } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, "feats"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"]["feats"]["$get"]({
        param: { id: rulesetId },
        query: { limit: "10", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch feats");
      return response.json();
    },
    enabled: open && !!rulesetId,
  });
  // Fetch available saves for this ruleset
  const { data: savesData } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, "saves"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"]["saves"]["$get"]({
        param: { id: rulesetId },
        query: { limit: "100", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch saves");
      return response.json();
    },
    enabled: open && !!rulesetId,
  });
  const rulesetSaves: RulesetSave[] = savesData?.items ?? [];

  // Create feat-aptitude options for autocomplete
  const featOptions = useMemo(() => {
    const feats = featsData?.items ?? [];
    return feats.flatMap((feat) =>
      feat.featsAptitudesInRules?.map((fa) => ({
        featId: feat.id,
        aptitudeId: fa.aptitudeId,
        featName: feat.name,
        aptitudeName: fa.aptitudesInRule?.name || 'Unknown',
        label: `${feat.name} (${fa.aptitudesInRule?.name || 'Unknown'})`
      })) || []
    );
  }, [featsData?.items]);

  const watchedFeats = form.watch("feats");
  const watchedSaves = form.watch("saves");

  const selectedFeats = useMemo<FeatAptitudeOption[]>(() => {
    return (watchedFeats ?? []).map((f) => {
      const match = featOptions.find(
        (o) => o.featId === f.featId && o.aptitudeId === f.aptitudeId,
      );
      return match ?? {
        featId: f.featId,
        aptitudeId: f.aptitudeId,
        featName: 'Unknown',
        aptitudeName: 'Unknown',
        label: 'Unknown',
      };
    });
  }, [watchedFeats, featOptions]);

  const saveValues = useMemo<Record<string, number>>(() => {
    const values: Record<string, number> = {};
    for (const s of watchedSaves ?? []) values[s.saveId] = s.base;
    return values;
  }, [watchedSaves]);

  const setSaveValue = (saveId: string, base: number) => {
    const next = [...(watchedSaves ?? []).filter((s) => s.saveId !== saveId), { saveId, base }];
    form.setValue("saves", next, { shouldDirty: true });
  };

  const setSelectedFeats = (next: FeatAptitudeOption[]) => {
    form.setValue(
      "feats",
      next.map((feat) => ({ featId: feat.featId, aptitudeId: feat.aptitudeId })),
      { shouldDirty: true },
    );
  };

  const handleSubmit = (data: CreateLevelFormData) => {
    const submitData = {
      ...data,
      saves: rulesetSaves.map((save) => ({
        saveId: save.id,
        base: saveValues[save.id] ?? 0,
      })),
      feats: (data.feats ?? []).map((feat) => ({
        featId: feat.featId,
        aptitudeId: feat.aptitudeId,
      })),
    };
    onSubmit(submitData);
  };

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Level"
      form={form}
      onSubmit={handleSubmit}
      isLoading={isLoading}
    >
      <TextField
        {...form.register("level", {
          required: "Level is required",
          valueAsNumber: true,
        })}
        label="Level"
        type="number"
        fullWidth
        error={!!form.formState.errors.level}
        helperText={form.formState.errors.level?.message}
        slotProps={{
          htmlInput: { min: 1, max: 20 }
        }}
      />
      <TextField
        {...form.register("bab", {
          required: "Base Attack Bonus is required",
          valueAsNumber: true,
        })}
        label="Base Attack Bonus"
        type="number"
        fullWidth
        error={!!form.formState.errors.bab}
        helperText={form.formState.errors.bab?.message}
        slotProps={{
          htmlInput: { min: 0 }
        }}
      />
      <TextField
        {...form.register("skills", {
          required: "Skill points are required",
          valueAsNumber: true,
        })}
        label="Skill Points"
        type="number"
        fullWidth
        error={!!form.formState.errors.skills}
        helperText={form.formState.errors.skills?.message}
        slotProps={{
          htmlInput: { min: 1 }
        }}
      />
      {rulesetSaves.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(rulesetSaves.length, 3)}, 1fr)` }, gap: 2 }}>
          {rulesetSaves.map((save) => (
            <TextField
              key={save.id}
              label={`${save.name} Save`}
              type="number"
              value={saveValues[save.id] ?? 0}
              onChange={(e) => setSaveValue(save.id, Number(e.target.value))}
              slotProps={{
                htmlInput: { min: 0, max: 12 }
              }}
            />
          ))}
        </Box>
      )}

      <Autocomplete
        multiple
        options={featOptions}
        getOptionLabel={(option) => option.label}
        value={selectedFeats}
        onChange={(_, newValue) => setSelectedFeats(newValue)}
        isOptionEqualToValue={(option, value) =>
          option.featId === value.featId && option.aptitudeId === value.aptitudeId
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Feats"
            placeholder="Select feats with aptitudes granted at this level"
          />
        )}
        renderValue={(value, getItemProps) =>
          value.map((option, index) => {
            const tagProps = getItemProps({ index });
            return (
              <Chip
                variant="outlined"
                label={option.label}
                {...tagProps}
                onDelete={() => {
                  const newFeats = selectedFeats.filter((_, i) => i !== index);
                  setSelectedFeats(newFeats);
                }}
                key={`${option.featId}-${option.aptitudeId}`}
              />
            );
          })
        }
      />
    </CreateDialog>
  );
}

interface DeleteLevelDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function DeleteLevelDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: DeleteLevelDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>Delete Level</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete this level? This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={isLoading}
        >
          {isLoading ? "Deleting..." : "Delete"}
        </Button>
      </DialogActions>
    </Modal>
  );
}

interface RemoveSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function RemoveSkillDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: RemoveSkillDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>Remove Skill</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to remove this skill from the class?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={isLoading}
        >
          {isLoading ? "Removing..." : "Remove"}
        </Button>
      </DialogActions>
    </Modal>
  );
}
