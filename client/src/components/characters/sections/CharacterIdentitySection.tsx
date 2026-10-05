import { Autocomplete, Box, Button, Chip, Paper, Skeleton, Stack, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { AttachmentField, DiceSpinner, SelectField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { type RulesetLanguage, useRulesetLanguages } from "@/client/src/hooks/index.ts";
import { useDirtyForm, useFormSync } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { type Alignment, ALIGNMENT_OPTIONS, type Gender, GENDER_OPTIONS } from "@/shared/enums.ts";

import type { CharacterData } from "./characterData.ts";

interface CharacterIdentityFormData {
  race: string;
  alignment: Alignment | "";
  experience: number;
  age: string;
  gender: Gender | "";
  height: string;
  weight: string;
  deity: string;
  description: string;
  notes: string;
  languageIds: string[];
}

/** A language as the picker shows it: the character's, or one the ruleset offers. */
type LanguageOption = Pick<RulesetLanguage, "id" | "name">;

interface CharacterIdentitySectionProps {
  characterName: string;
  characterId: string;
  rulesetId?: string;
  readOnly?: boolean;
  /** The portrait can't be changed; defaults to `readOnly`. */
  portraitReadOnly?: boolean;
  partial?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views (shared character page). */
  portraitUrl?: string | null;
  character: CharacterData;
}

function toIdentityForm({ identity }: CharacterIdentitySectionProps["character"]): CharacterIdentityFormData {
  return {
    race: identity?.physiology?.race?.name || "",
    alignment: oneOf(identity?.beliefs?.alignment, ALIGNMENT_OPTIONS) ?? "",
    experience: identity?.meta?.xp || 0,
    age: String(identity?.physiology?.age || ""),
    gender: oneOf(identity?.physiology?.gender, GENDER_OPTIONS) ?? "",
    height: String(identity?.physiology?.height || ""),
    weight: String(identity?.physiology?.weight || ""),
    deity: identity?.beliefs?.deity || "",
    description: identity?.physiology?.description || "",
    notes: identity?.background?.notes || "",
    languageIds: (identity?.physiology?.languages ?? []).map((l) => l.id),
  };
}

export function CharacterIdentitySection({
  characterName,
  characterId,
  rulesetId,
  character,
  readOnly = false,
  portraitReadOnly = readOnly,
  partial = false,
  portraitUrl,
}: CharacterIdentitySectionProps) {
  const canEditName = !readOnly;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const form = useForm<CharacterIdentityFormData>({
    defaultValues: {
      race: "",
      alignment: "",
      experience: 0,
      age: "",
      gender: "",
      height: "",
      weight: "",
      deity: "",
      description: "",
      notes: "",
      languageIds: [],
    },
  });

  const sync = useFormSync(form, toIdentityForm(character), { key: characterId, updatedAt: character.updatedAt });

  const handleSubmit = async (formData: CharacterIdentityFormData) => {
    try {
      const saved = await parseResponse(
        rpc.api.characters[":id"]["$put"]({
          param: { id: characterId },
          json: {
            age: Number(formData.age) || undefined,
            gender: formData.gender || undefined,
            height: formData.height || undefined,
            weight: formData.weight || undefined,
            deity: formData.deity,
            xp: formData.experience,
            alignment: formData.alignment || undefined,
            description: formData.description,
            notes: formData.notes,
            languageIds: formData.languageIds,
            updatedAt: sync.updatedAt(),
          },
        }),
      );

      sync.saved(formData, saved.updatedAt);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(characterId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.characters.levelUp.all(characterId),
      });
    } catch (err) {
      snackbar.error(err, "Failed to save character details");
    }
  };

  const { isDirty, isSubmitting } = form.formState;
  useDirtyForm(isDirty);

  // Lives outside the main form so users can rename without opening the
  // Save flow (and vice versa). Click the name → TextField; Enter/blur
  // saves, Escape cancels. Save is a direct PUT; response invalidates
  // the character detail query so the new name flows everywhere.
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(characterName);
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    if (!nameEditing) setNameDraft(characterName);
  }, [characterName, nameEditing]);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === characterName) {
      setNameDraft(characterName);
      setNameEditing(false);
      return;
    }
    setNameSaving(true);
    try {
      await rpc.api.characters[":id"]["$put"]({
        param: { id: characterId },
        json: { name: trimmed, updatedAt: character.updatedAt },
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(characterId) });
      if (character.parentCharacterId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.characters.detail(character.parentCharacterId),
        });
      }
      setNameEditing(false);
    } catch (err) {
      snackbar.error(err, "Failed to rename character");
      setNameDraft(characterName);
      setNameEditing(false);
    } finally {
      setNameSaving(false);
    }
  };

  // Staged via the form like every other field — selections only persist
  // when the user clicks Save, matching the rest of the identity section.
  const { data: availableLanguages } = useRulesetLanguages(rulesetId, !readOnly);

  const watchedLanguageIds = form.watch("languageIds");
  const currentLanguages = useMemo(
    () => character?.identity?.physiology?.languages ?? [],
    [character?.identity?.physiology?.languages],
  );
  const selectedLanguages = useMemo(() => {
    const byId = new Map<string, LanguageOption>();
    for (const lang of currentLanguages) byId.set(lang.id, lang);
    for (const lang of availableLanguages ?? []) byId.set(lang.id, lang);
    return watchedLanguageIds.map((id) => byId.get(id)).filter((l): l is LanguageOption => !!l);
  }, [watchedLanguageIds, availableLanguages, currentLanguages]);

  // Style object to remove grayed-out appearance from disabled TextFields
  const disabledFieldStyle = readOnly
    ? {
        "& .MuiInputBase-input.Mui-disabled": {
          WebkitTextFillColor: "inherit",
          color: "text.primary",
        },
        "& .MuiInputLabel-root.Mui-disabled": {
          color: "text.secondary",
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: "divider",
        },
      }
    : undefined;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <form onSubmit={sync.handleSubmit(handleSubmit)}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          {nameEditing ? (
            <TextField
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.target instanceof HTMLElement) e.target.blur();
                } else if (e.key === "Escape") {
                  setNameDraft(characterName);
                  setNameEditing(false);
                }
              }}
              autoFocus
              disabled={nameSaving}
              variant="standard"
              slotProps={{ htmlInput: { "aria-label": "Character name", maxLength: 255 } }}
              sx={{
                "& .MuiInputBase-input": {
                  fontWeight: 600,
                  color: "primary.main",
                  typography: { xs: "h6", sm: "h5" },
                },
              }}
            />
          ) : (
            <Typography
              component="h5"
              onClick={canEditName ? () => setNameEditing(true) : undefined}
              sx={{
                fontWeight: 600,
                color: "primary.main",
                typography: { xs: "h6", sm: "h5" },
                cursor: canEditName ? "pointer" : "default",
                "&:hover": canEditName
                  ? { textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "4px" }
                  : undefined,
              }}
            >
              {characterName || "Unnamed Character"}
            </Typography>
          )}
          <Button
            type="submit"
            variant="contained"
            size="small"
            disabled={!isDirty || isSubmitting}
            sx={{ visibility: readOnly ? "hidden" : "visible" }}
          >
            <DiceSpinner size="small" loading={isSubmitting}>
              Save
            </DiceSpinner>
          </Button>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "center", sm: "flex-start" },
            gap: { xs: 2, sm: 4 },
          }}
        >
          <AttachmentField
            recordType="Character"
            recordId={characterId}
            name="portrait"
            variant="portrait"
            size={140}
            readOnly={portraitReadOnly}
            url={portraitUrl}
          />

          <Box sx={{ flex: 1, width: "100%", minWidth: 0 }}>
            {/* Line 1: Race, Alignment, Experience, Deity */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
                gap: 3,
                mb: 2,
              }}
            >
              <TextField {...form.register("race")} label="Race" size="small" variant="outlined" disabled />
              {partial ? (
                <>
                  <Skeleton variant="rounded" height={40} />
                  <Skeleton variant="rounded" height={40} />
                  <Skeleton variant="rounded" height={40} />
                </>
              ) : (
                <>
                  <SelectField
                    control={form.control}
                    name="alignment"
                    label="Alignment"
                    options={ALIGNMENT_OPTIONS}
                    size="small"
                    disabled={readOnly}
                    sx={disabledFieldStyle}
                  />
                  <TextField
                    {...form.register("experience", { valueAsNumber: true })}
                    label="Experience"
                    type="number"
                    size="small"
                    variant="outlined"
                    slotProps={{ htmlInput: { min: 0 } }}
                    disabled={readOnly}
                    sx={disabledFieldStyle}
                  />
                  <TextField
                    {...form.register("deity")}
                    label="Deity"
                    size="small"
                    variant="outlined"
                    disabled={readOnly}
                    sx={disabledFieldStyle}
                  />
                </>
              )}
            </Box>

            {/* Line 2: Age, Gender, Height, Weight */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
                gap: 3,
                mb: 2,
              }}
            >
              <TextField
                {...form.register("age")}
                label="Age"
                size="small"
                variant="outlined"
                disabled={readOnly}
                sx={disabledFieldStyle}
              />
              <SelectField
                control={form.control}
                name="gender"
                label="Gender"
                options={GENDER_OPTIONS}
                size="small"
                disabled={readOnly}
                sx={disabledFieldStyle}
              />
              <TextField
                {...form.register("height")}
                label="Height"
                size="small"
                variant="outlined"
                disabled={readOnly}
                sx={disabledFieldStyle}
              />
              <TextField
                {...form.register("weight")}
                label="Weight"
                size="small"
                variant="outlined"
                disabled={readOnly}
                sx={disabledFieldStyle}
              />
            </Box>

            {/* Languages */}
            {!partial && (
              <Box sx={{ mb: 2 }}>
                {readOnly ? (
                  <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="body2" sx={{ color: "text.secondary", mr: 1 }}>
                      Languages:
                    </Typography>
                    {selectedLanguages.length === 0 ? (
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        None
                      </Typography>
                    ) : (
                      selectedLanguages.map((lang) => <Chip key={lang.id} label={lang.name} size="small" />)
                    )}
                  </Box>
                ) : (
                  <Autocomplete
                    multiple
                    size="small"
                    options={availableLanguages ?? []}
                    getOptionLabel={(option) => option.name}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    value={selectedLanguages}
                    onChange={(_, newValue) => {
                      form.setValue(
                        "languageIds",
                        newValue.map((l) => l.id),
                        { shouldDirty: true },
                      );
                    }}
                    renderValue={(value, getItemProps) =>
                      value.map((option, index) => (
                        <Chip {...getItemProps({ index })} key={option.id} label={option.name} size="small" />
                      ))
                    }
                    renderInput={(params) => <TextField {...params} label="Languages" variant="outlined" />}
                  />
                )}
              </Box>
            )}

            {/* Line 3: Description and Notes */}
            {partial ? (
              <Stack spacing={2}>
                <Skeleton variant="rounded" height={80} />
                <Skeleton variant="rounded" height={100} />
              </Stack>
            ) : (
              <>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3, mb: 2 }}>
                  <TextField
                    {...form.register("description")}
                    label="Description"
                    size="small"
                    variant="outlined"
                    multiline
                    minRows={3}
                    placeholder="Character appearance, personality, or background..."
                    disabled={readOnly}
                    sx={{ ...disabledFieldStyle, "& textarea": { resize: "vertical" } }}
                  />
                </Box>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
                  <TextField
                    {...form.register("notes")}
                    label="Notes"
                    size="small"
                    variant="outlined"
                    multiline
                    minRows={4}
                    placeholder="Campaign notes, character development, reminders..."
                    disabled={readOnly}
                    sx={{ ...disabledFieldStyle, "& textarea": { resize: "vertical" } }}
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>
      </form>
    </Paper>
  );
}
