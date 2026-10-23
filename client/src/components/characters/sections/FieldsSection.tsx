import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { type Control, useController } from "react-hook-form";

import {
  AttachmentField,
  BlankNote,
  EmptyValue,
  FormTextField,
  SaveButton,
  SelectField,
  TextAreaField,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { type CharacterLanguage, type CharacterLanguages, characterLanguagesQuery } from "./languageQueries.ts";
import { NotesField, PrivateNotesField } from "./NotesFields.tsx";
import type { BlockOf, SheetField } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";

interface FieldInputProps {
  control: Control<FieldsFormData>;
  field: SheetField;
  /** The viewer can't edit the character: its fields read as they are. */
  readOnly: boolean;
}

interface FieldsSectionProps {
  block: BlockOf<"fields">;
  characterId: string;
  partial?: boolean;
  /** The portrait can't be changed; defaults to `readOnly`. */
  portraitReadOnly?: boolean;
  /** Pre-resolved portrait URL for unauthenticated views (shared character page). */
  portraitUrl?: string | null;
  readOnly?: boolean;
  updatedAt: string;
}

/**
 * A `fields` block as its form holds it: each field's value by its key (a number's NaN while it's empty, a select's
 * "" while it's unset), its languages' ids, and its notes.
 */
type FieldsFormData = Record<string, number | string | string[]>;

/** A language as the picker shows it: one the character speaks, or one its rules let it pick. */
type LanguageOption = Pick<CharacterLanguage, "id" | "name">;

/** A grid's line of fields: one to a phone's line, two to a tablet's, four from a desktop's */
const LINE_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
  gap: 3,
};

/** No answer yet: no language its rules give it, nor one to add. */
const NO_ANSWER: CharacterLanguages = { automatic: [], options: [], picks: [] };

/** What a Partial character hides from the campaign's other players, said on its sheet and on its card. */
export const PARTIAL_IDENTITY_NOTE = "The rest of this character's identity is private";

/** A field's input, by its kind: a fixed one read only, whoever reads it. */
function FieldInput({ control, field, readOnly }: FieldInputProps) {
  // A viewer who can't edit the character reads its fields as they are
  const fieldSlots = { input: { readOnly } };
  switch (field.kind) {
    case "number":
      // A required number steps from its least
      return field.required ? (
        <FormTextField
          control={control}
          name={field.key}
          rules={wholeNumberRules(field.min, field.required)}
          number
          label={field.label}
          size="small"
          variant="outlined"
          slotProps={{ ...fieldSlots, htmlInput: { min: field.min } }}
        />
      ) : (
        <FormTextField
          control={control}
          name={field.key}
          rules={wholeNumberRules(field.min, false)}
          number
          label={field.label}
          size="small"
          variant="outlined"
          slotProps={fieldSlots}
        />
      );
    case "select":
      return (
        <SelectField
          control={control}
          name={field.key}
          label={field.label}
          options={field.options}
          size="small"
          readOnly={readOnly}
        />
      );
    case "text":
      return (
        <FormTextField
          control={control}
          name={field.key}
          label={field.label}
          size="small"
          variant="outlined"
          // A fixed field is its rules' own: the sheet shows it
          slotProps={field.fixed ? { input: { readOnly: true } } : fieldSlots}
        />
      );
    case "textarea":
      return (
        <TextAreaField
          control={control}
          name={field.key}
          label={field.label}
          size="small"
          variant="outlined"
          placeholder={field.placeholder}
          slotProps={fieldSlots}
        />
      );
  }
}

/** A block's fields, wherever it lays them out. */
function fieldsOf(block: BlockOf<"fields">) {
  return [...block.lines.flat(), ...block.fields];
}

/** A field's value as its form holds it: a number's NaN while it's empty, a select's "" while it's unset. */
function formValueOf(field: SheetField) {
  if (field.kind === "number") return field.value ?? Number.NaN;
  if (field.kind === "select") return field.value ?? "";
  return field.value;
}

/** A field's value as its edit sends it: an empty number or an unset select, none. */
function sentValueOf(field: SheetField, value: FieldsFormData[string]) {
  if (field.kind === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (field.kind === "select") return typeof value === "string" && value ? value : null;
  return typeof value === "string" ? value : String(value);
}

/** A block's values as its form holds them (`block` none: before the character's are in, each field empty). */
function toFieldsForm(block: BlockOf<"fields">, filled: boolean): FieldsFormData {
  const empty = (field: SheetField) => {
    if (field.kind === "number") return field.required ? field.min : Number.NaN;
    return "";
  };
  return {
    ...Object.fromEntries(fieldsOf(block).map((field) => [field.key, filled ? formValueOf(field) : empty(field)])),
    notes: filled ? (block.notes?.notes ?? "") : "",
    privateNotes: filled ? (block.notes?.privateNotes ?? "") : "",
    languageIds: filled ? (block.languages?.picked ?? []).map(({ id }) => id) : [],
  };
}

/**
 * A `fields` block: the character's portrait, then its fields' lines and the fields under them, the languages it
 * speaks, and its notes (its private ones where the block gives them: who reads them alone), saved together. A partly
 * seen character shows its fields alone, and says the rest is private.
 */
export function FieldsSection({
  block,
  characterId,
  readOnly = false,
  portraitReadOnly = readOnly,
  partial = false,
  portraitUrl,
  updatedAt,
}: FieldsSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const form = useFormWith<FieldsFormData>(toFieldsForm(block, false));
  const privateNotes = block.notes?.privateNotes !== undefined;

  const sync = useFormSync(form, toFieldsForm(block, true), { key: characterId, updatedAt });

  const saveFields = useMutation({
    mutationFn: (formData: FieldsFormData) =>
      parseResponse(
        rpc.api.characters[":id"].$put({
          param: { id: characterId },
          json: {
            fields: Object.fromEntries(
              fieldsOf(block)
                .filter((field) => !(field.kind === "text" && field.fixed))
                .map((field) => [field.key, sentValueOf(field, formData[field.key])]),
            ),
            notes: String(formData.notes),
            // Only who reads them saves them: a form without the field leaves them as they are
            privateNotes: privateNotes ? String(formData.privateNotes) : undefined,
            languageIds: block.languages ? (formData.languageIds as string[]) : undefined,
            updatedAt: sync.updatedAt(),
          },
        }),
      ),
    onSuccess: async (saved, formData) => {
      snackbar.success(block.saved);
      sync.saved(formData, saved.updatedAt);
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, characterId);
    },
    onError: (error) => snackbar.error(error, block.failed),
  });

  // Staged via the form like every other field — selections only persist when the user clicks Save, matching the
  // rest of the block. What the picker offers is the rules' answer for the picks the form holds.
  const { field: languageIds } = useController({ control: form.control, name: "languageIds" });
  const selectedLanguageIds = languageIds.value as string[];
  const {
    data: languages = NO_ANSWER,
    error: languagesError,
    isLoading: languagesLoading,
  } = useQuery({
    ...characterLanguagesQuery(characterId, selectedLanguageIds),
    placeholderData: keepPreviousData,
    enabled: !readOnly,
  });
  const automaticIds = new Set(languages.automatic.map(({ id }) => id));
  const languagesById = new Map<string, LanguageOption>();
  for (const lang of block.languages?.picked ?? []) languagesById.set(lang.id, lang);
  for (const lang of [...languages.automatic, ...languages.picks, ...languages.options])
    languagesById.set(lang.id, lang);
  const [languageSearch, setLanguageSearch] = useState("");
  const selectedLanguages = selectedLanguageIds
    .map((id) => languagesById.get(id))
    .filter((l): l is LanguageOption => !!l);

  return (
    <SheetSection title={block.title}>
      <Stack
        component="form"
        noValidate
        spacing={3}
        onSubmit={sync.handleSubmit((formData) => saveFields.mutate(formData))}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 4 }}
          sx={{ alignItems: { xs: "center", sm: "flex-start" } }}
        >
          <AttachmentField
            name="portrait"
            label={block.portrait}
            recordId={characterId}
            readOnly={portraitReadOnly}
            url={portraitUrl}
          />

          {/* Its fields' lines, 24px apart as the fields in a line are */}
          <Stack spacing={3} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
            {block.lines.map((line) => (
              <Box key={line.map(({ key }) => key).join()} sx={LINE_SX}>
                {line.map((field) => (
                  <FieldInput key={field.key} control={form.control} field={field} readOnly={readOnly} />
                ))}
              </Box>
            ))}

            {block.languages && (
              <Box>
                {readOnly ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ color: "text.secondary", pr: 1 }}>
                      {block.languages.label}:
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
                    options={[...selectedLanguages, ...languages.options]}
                    filterSelectedOptions
                    loading={languagesLoading}
                    noOptionsText={emptyOptionsText(block.languages.label, languagesError, block.languages.none)}
                    getOptionLabel={(option) => option.name}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    value={selectedLanguages}
                    // Each render builds a new value, which the Autocomplete answers with a "reset" that would clear
                    // the search as it's typed. Typing, picking a language and blur still set it.
                    inputValue={languageSearch}
                    onInputChange={(_, input, reason) => {
                      if (reason !== "reset") setLanguageSearch(input);
                    }}
                    // Those its modifiers grant it (its race's, its classes') stay: only its picks come and go
                    onChange={(_, newValue) =>
                      languageIds.onChange([
                        ...selectedLanguageIds.filter((id) => automaticIds.has(id)),
                        ...newValue.map((l) => l.id).filter((id) => !automaticIds.has(id)),
                      ])
                    }
                    onBlur={languageIds.onBlur}
                    renderValue={(value, getItemProps) =>
                      value.map((option, index) => {
                        const { onDelete, ...itemProps } = getItemProps({ index });
                        return (
                          <ValueChip
                            color="default"
                            {...itemProps}
                            key={option.id}
                            label={option.name}
                            onDelete={automaticIds.has(option.id) ? undefined : onDelete}
                          />
                        );
                      })
                    }
                    renderInput={(params) => (
                      <TextField {...params} label={block.languages?.label} variant="outlined" />
                    )}
                  />
                )}
              </Box>
            )}

            {partial ? (
              <BlankNote>{PARTIAL_IDENTITY_NOTE}</BlankNote>
            ) : (
              <>
                {block.fields.map((field) => (
                  <FieldInput key={field.key} control={form.control} field={field} readOnly={readOnly} />
                ))}

                {block.notes && (
                  <Stack spacing={3}>
                    <NotesField control={form.control} name="notes" size="small" readOnly={readOnly} />
                    {privateNotes && (
                      <PrivateNotesField control={form.control} name="privateNotes" size="small" readOnly={readOnly} />
                    )}
                  </Stack>
                )}
              </>
            )}
          </Stack>
        </Stack>
        {/* The panel's Save, at its end as an inline editor's */}
        {!readOnly && <SaveButton canSave={sync.isDirty} pending={saveFields.isPending} />}
      </Stack>
    </SheetSection>
  );
}
