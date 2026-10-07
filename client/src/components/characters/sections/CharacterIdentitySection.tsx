import { Autocomplete, Box, Button, Chip, Paper, Skeleton, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo } from "react";
import { useController } from "react-hook-form";

import { AttachmentField, DiceSpinner, FormTextField, SelectField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  type RulesetLanguage,
  useDirtyForm,
  useFormSync,
  useFormWith,
  useRulesetLanguages,
} from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { type Alignment, ALIGNMENT_OPTIONS, type Gender, GENDER_OPTIONS } from "@/shared/enums.ts";

import type { CharacterData } from "./characterData.ts";

interface CharacterIdentityFormData {
  age: string;
  alignment: Alignment | "";
  deity: string;
  description: string;
  experience: number;
  gender: Gender | "";
  height: string;
  languageIds: string[];
  notes: string;
  race: string;
  weight: string;
}

interface CharacterIdentitySectionProps {
  character: CharacterData;
  characterId: string;
  partial?: boolean;
  /** The portrait can't be changed; defaults to `readOnly`. */
  portraitReadOnly?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views (shared character page). */
  portraitUrl?: string | null;
  readOnly?: boolean;
  rulesetId?: string;
}

/** A language as the picker shows it: the character's, or one the ruleset offers. */
type LanguageOption = Pick<RulesetLanguage, "id" | "name">;

/** No saved languages: one list, so the selection's memo keeps its value. */
const NO_LANGUAGES: LanguageOption[] = [];

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
  characterId,
  rulesetId,
  character,
  readOnly = false,
  portraitReadOnly = readOnly,
  partial = false,
  portraitUrl,
}: CharacterIdentitySectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const form = useFormWith<CharacterIdentityFormData>({
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
  });

  const sync = useFormSync(form, toIdentityForm(character), { key: characterId, updatedAt: character.updatedAt });

  const saveIdentity = useMutation({
    mutationFn: (formData: CharacterIdentityFormData) =>
      parseResponse(
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
      ),
    onSuccess: async (saved, formData) => {
      sync.saved(formData, saved.updatedAt);
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, characterId);
    },
    onError: (err) => snackbar.error(err, "Failed to save character details"),
  });

  const { isDirty } = form.formState;
  useDirtyForm(isDirty);

  // Staged via the form like every other field — selections only persist
  // when the user clicks Save, matching the rest of the identity section.
  const { data: availableLanguages, error: languagesError } = useRulesetLanguages(rulesetId, !readOnly);

  const { field: languageIds } = useController({ control: form.control, name: "languageIds" });
  const selectedLanguageIds = languageIds.value;
  const currentLanguages = character?.identity?.physiology?.languages ?? NO_LANGUAGES;
  const selectedLanguages = useMemo(() => {
    const byId = new Map<string, LanguageOption>();
    for (const lang of currentLanguages) byId.set(lang.id, lang);
    for (const lang of availableLanguages ?? []) byId.set(lang.id, lang);
    return selectedLanguageIds.map((id) => byId.get(id)).filter((l): l is LanguageOption => !!l);
  }, [selectedLanguageIds, availableLanguages, currentLanguages]);

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
      <Stack
        component="form"
        noValidate
        spacing={3}
        onSubmit={sync.handleSubmit((formData) => saveIdentity.mutate(formData))}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 4 }}
          sx={{ alignItems: { xs: "center", sm: "flex-start" } }}
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

          <Stack spacing={2} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
            {/* Line 1: Race, Alignment, Experience, Deity */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
                gap: 3,
              }}
            >
              <FormTextField control={form.control} name="race" label="Race" size="small" variant="outlined" disabled />
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
                  <FormTextField
                    control={form.control}
                    name="experience"
                    rules={wholeNumberRules(0)}
                    number
                    label="Experience"
                    size="small"
                    variant="outlined"
                    slotProps={{ htmlInput: { min: 0 } }}
                    disabled={readOnly}
                    sx={disabledFieldStyle}
                  />
                  <FormTextField
                    control={form.control}
                    name="deity"
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
              }}
            >
              <FormTextField
                control={form.control}
                name="age"
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
              <FormTextField
                control={form.control}
                name="height"
                label="Height"
                size="small"
                variant="outlined"
                disabled={readOnly}
                sx={disabledFieldStyle}
              />
              <FormTextField
                control={form.control}
                name="weight"
                label="Weight"
                size="small"
                variant="outlined"
                disabled={readOnly}
                sx={disabledFieldStyle}
              />
            </Box>

            {/* Languages */}
            {!partial && (
              <Box>
                {readOnly ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ color: "text.secondary", pr: 1 }}>
                      Languages:
                    </Typography>
                    {selectedLanguages.length === 0 ? (
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        None
                      </Typography>
                    ) : (
                      selectedLanguages.map((lang) => <Chip key={lang.id} label={lang.name} size="small" />)
                    )}
                  </Stack>
                ) : (
                  <Autocomplete
                    multiple
                    size="small"
                    options={availableLanguages ?? []}
                    noOptionsText={emptyOptionsText("Languages", languagesError)}
                    getOptionLabel={(option) => option.name}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    value={selectedLanguages}
                    onChange={(_, newValue) => languageIds.onChange(newValue.map((l) => l.id))}
                    onBlur={languageIds.onBlur}
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
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
                  <FormTextField
                    control={form.control}
                    name="description"
                    label="Description"
                    size="small"
                    variant="outlined"
                    multiline
                    minRows={3}
                    placeholder="Character appearance, personality, or background…"
                    disabled={readOnly}
                    sx={{ ...disabledFieldStyle, "& textarea": { resize: "vertical" } }}
                  />
                </Box>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
                  <FormTextField
                    control={form.control}
                    name="notes"
                    label="Notes"
                    size="small"
                    variant="outlined"
                    multiline
                    minRows={4}
                    placeholder="Campaign notes, character development, reminders…"
                    disabled={readOnly}
                    sx={{ ...disabledFieldStyle, "& textarea": { resize: "vertical" } }}
                  />
                </Box>
              </>
            )}
          </Stack>
        </Stack>
        {/* The panel's Save, at its end as an inline editor's */}
        {!readOnly && (
          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <Button type="submit" variant="contained" disabled={!isDirty || saveIdentity.isPending}>
              <DiceSpinner size="small" loading={saveIdentity.isPending}>
                Save
              </DiceSpinner>
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
