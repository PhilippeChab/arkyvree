import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useMemo } from "react";
import { useController } from "react-hook-form";

import {
  AttachmentField,
  BlankNote,
  EmptyValue,
  FormTextField,
  Panel,
  SaveButton,
  SelectField,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { type CharacterDetail, invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { type Alignment, ALIGNMENT_OPTIONS, type Gender, GENDER_OPTIONS } from "@/shared/enums.ts";

import { NotesField, PrivateNotesField } from "./NotesFields.tsx";
import { type RulesetLanguage, useRulesetLanguages } from "./useRulesetLanguages.ts";

interface CharacterIdentityFormData {
  /** NaN while it is empty: a number field's value. */
  age: number;
  alignment: Alignment | "";
  deity: string;
  description: string;
  experience: number;
  gender: Gender | "";
  height: string;
  languageIds: string[];
  notes: string;
  privateNotes: string;
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
  /** The viewer receives the private notes: the character's editors, and its campaign's Game Master. */
  showPrivateNotes?: boolean;
}

type CampaignCharacterData = InferResponseType<
  (typeof rpc.api.campaigns)[":id"]["characters"][":characterId"]["$get"],
  200
>;

/** A language as the picker shows it: the character's, or one the ruleset offers. */
type LanguageOption = Pick<RulesetLanguage, "id" | "name">;

type SharedCharacterData = InferResponseType<(typeof rpc.api.shared.characters)[":shareToken"]["$get"], 200>;

/** A character sheet's data, whose identity the section shows: the owner's view, a campaign member's, or a share link's. */
export type CharacterData = CharacterDetail | CampaignCharacterData | SharedCharacterData;

/** No saved languages: one list, so the selection's memo keeps its value. */
const NO_LANGUAGES: LanguageOption[] = [];

/** What a Partial character hides from the campaign's other players, said on its sheet and on its card. */
export const PARTIAL_IDENTITY_NOTE = "The rest of this character's identity is private";

function toIdentityForm({ identity }: CharacterIdentitySectionProps["character"]): CharacterIdentityFormData {
  return {
    race: identity?.physiology?.race?.name || "",
    alignment: oneOf(identity?.beliefs?.alignment, ALIGNMENT_OPTIONS) ?? "",
    experience: identity?.meta?.xp || 0,
    age: identity?.physiology?.age ?? Number.NaN,
    gender: oneOf(identity?.physiology?.gender, GENDER_OPTIONS) ?? "",
    height: String(identity?.physiology?.height || ""),
    weight: String(identity?.physiology?.weight || ""),
    deity: identity?.beliefs?.deity || "",
    description: identity?.physiology?.description || "",
    notes: identity?.background?.notes || "",
    privateNotes: identity?.background?.privateNotes || "",
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
  showPrivateNotes = false,
}: CharacterIdentitySectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const form = useFormWith<CharacterIdentityFormData>({
    race: "",
    alignment: "",
    experience: 0,
    age: Number.NaN,
    gender: "",
    height: "",
    weight: "",
    deity: "",
    description: "",
    notes: "",
    privateNotes: "",
    languageIds: [],
  });

  const sync = useFormSync(form, toIdentityForm(character), { key: characterId, updatedAt: character.updatedAt });

  const saveIdentity = useMutation({
    mutationFn: (formData: CharacterIdentityFormData) =>
      parseResponse(
        rpc.api.characters[":id"].$put({
          param: { id: characterId },
          json: {
            // An emptied age, height or weight is cleared
            age: Number.isFinite(formData.age) ? formData.age : null,
            gender: formData.gender || undefined,
            height: formData.height || null,
            weight: formData.weight || null,
            deity: formData.deity,
            xp: formData.experience,
            alignment: formData.alignment || undefined,
            description: formData.description,
            notes: formData.notes,
            // Only who reads them saves them: a form without the field leaves them as they are
            privateNotes: showPrivateNotes ? formData.privateNotes : undefined,
            languageIds: formData.languageIds,
            updatedAt: sync.updatedAt(),
          },
        }),
      ),
    onSuccess: async (saved, formData) => {
      snackbar.success("Character updated");
      sync.saved(formData, saved.updatedAt);
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, characterId);
    },
    onError: (error) => snackbar.error(error, "Failed to save character details"),
  });

  // Staged via the form like every other field — selections only persist
  // when the user clicks Save, matching the rest of the identity section.
  const {
    data: availableLanguages,
    error: languagesError,
    isLoading: languagesLoading,
  } = useRulesetLanguages(rulesetId, !readOnly);

  const { field: languageIds } = useController({ control: form.control, name: "languageIds" });
  const selectedLanguageIds = languageIds.value;
  const currentLanguages = character?.identity?.physiology?.languages ?? NO_LANGUAGES;
  const selectedLanguages = useMemo(() => {
    const byId = new Map<string, LanguageOption>();
    for (const lang of currentLanguages) byId.set(lang.id, lang);
    for (const lang of availableLanguages ?? []) byId.set(lang.id, lang);
    return selectedLanguageIds.map((id) => byId.get(id)).filter((l): l is LanguageOption => !!l);
  }, [selectedLanguageIds, availableLanguages, currentLanguages]);

  // A viewer who can't edit the character reads its fields as they are
  const fieldSlots = { input: { readOnly } };

  return (
    <Panel>
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
            name="portrait"
            label="Portrait"
            recordId={characterId}
            readOnly={portraitReadOnly}
            url={portraitUrl}
          />

          {/* Its fields' lines, 24px apart as the fields in a line are */}
          <Stack spacing={3} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
                gap: 3,
              }}
            >
              <FormTextField
                control={form.control}
                name="race"
                label="Race"
                size="small"
                variant="outlined"
                // Its race is its creation's: the sheet shows it
                slotProps={{ input: { readOnly: true } }}
              />
              {!partial && (
                <>
                  <SelectField
                    control={form.control}
                    name="alignment"
                    label="Alignment"
                    options={ALIGNMENT_OPTIONS}
                    size="small"
                    readOnly={readOnly}
                  />
                  <FormTextField
                    control={form.control}
                    name="experience"
                    rules={wholeNumberRules(0)}
                    number
                    label="Experience Points"
                    size="small"
                    variant="outlined"
                    slotProps={{ ...fieldSlots, htmlInput: { min: 0 } }}
                  />
                  <FormTextField
                    control={form.control}
                    name="deity"
                    label="Deity"
                    size="small"
                    variant="outlined"
                    slotProps={fieldSlots}
                  />
                </>
              )}
            </Box>

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
                rules={wholeNumberRules(1)}
                number
                label="Age"
                size="small"
                variant="outlined"
                slotProps={fieldSlots}
              />
              <SelectField
                control={form.control}
                name="gender"
                label="Gender"
                options={GENDER_OPTIONS}
                size="small"
                readOnly={readOnly}
              />
              <FormTextField
                control={form.control}
                name="height"
                label="Height"
                size="small"
                variant="outlined"
                slotProps={fieldSlots}
              />
              <FormTextField
                control={form.control}
                name="weight"
                label="Weight"
                size="small"
                variant="outlined"
                slotProps={fieldSlots}
              />
            </Box>

            {!partial && (
              <Box>
                {readOnly ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ color: "text.secondary", pr: 1 }}>
                      Languages:
                    </Typography>
                    {selectedLanguages.length === 0 ? (
                      <EmptyValue />
                    ) : (
                      selectedLanguages.map((lang) => <ValueChip color="default" key={lang.id} label={lang.name} />)
                    )}
                  </Stack>
                ) : (
                  <Autocomplete
                    multiple
                    size="small"
                    options={availableLanguages ?? []}
                    loading={languagesLoading}
                    noOptionsText={emptyOptionsText("Languages", languagesError)}
                    getOptionLabel={(option) => option.name}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    value={selectedLanguages}
                    onChange={(_, newValue) => languageIds.onChange(newValue.map((l) => l.id))}
                    onBlur={languageIds.onBlur}
                    renderValue={(value, getItemProps) =>
                      value.map((option, index) => (
                        <ValueChip color="default" {...getItemProps({ index })} key={option.id} label={option.name} />
                      ))
                    }
                    renderInput={(params) => <TextField {...params} label="Languages" variant="outlined" />}
                  />
                )}
              </Box>
            )}

            {partial ? (
              <BlankNote>{PARTIAL_IDENTITY_NOTE}</BlankNote>
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
                    slotProps={fieldSlots}
                    sx={{ "& textarea": { resize: "vertical" } }}
                  />
                </Box>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 3 }}>
                  <NotesField control={form.control} name="notes" size="small" readOnly={readOnly} />
                  {showPrivateNotes && (
                    <PrivateNotesField control={form.control} name="privateNotes" size="small" readOnly={readOnly} />
                  )}
                </Box>
              </>
            )}
          </Stack>
        </Stack>
        {/* The panel's Save, at its end as an inline editor's */}
        {!readOnly && <SaveButton canSave={sync.isDirty} pending={saveIdentity.isPending} />}
      </Stack>
    </Panel>
  );
}
