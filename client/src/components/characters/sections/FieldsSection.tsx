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

import { type FieldsFormData, sentFieldsOf, toFieldsForm } from "./fieldsForm.ts";
import { characterLinkQuery, type LinkedEntity, type LinkRoom } from "./linkQueries.ts";
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

/** A picked link's field: the entities the character has of it, and those its rules let it pick. */
interface LinkPicksFieldProps {
  characterId: string;
  control: Control<FieldsFormData>;
  link: NonNullable<BlockOf<"fields">["links"]>[number];
  /** The viewer can't edit the character: its picks read as they are. */
  readOnly: boolean;
}

/** A grid's line of fields: one to a phone's line, two to a tablet's, four from a desktop's */
const LINE_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
  gap: 3,
};

/** No answer yet: no entity its rules give it, nor one to add. */
const NO_ANSWER: LinkRoom = { automatic: [], options: [], picks: [] };

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

/**
 * A picked link's field (3.5's languages), its form's `links.<link>`: staged via the form like every other field (a
 * selection persists when the user clicks Save, as the rest of the block), what its picker offers the rules' answer
 * for the picks the form holds. What the character has without picking it (its modifiers' grants) stays: only its
 * picks come and go.
 */
function LinkPicksField({ characterId, control, link, readOnly }: LinkPicksFieldProps) {
  const { field: picks } = useController({ control, name: `links.${link.link}` });
  const selectedIds = picks.value as unknown as string[];
  const {
    data: room = NO_ANSWER,
    error,
    isLoading,
  } = useQuery({
    ...characterLinkQuery(characterId, link.link, selectedIds),
    placeholderData: keepPreviousData,
    enabled: !readOnly,
  });
  const automaticIds = new Set(room.automatic.map(({ id }) => id));
  const byId = new Map<string, LinkedEntity>();
  for (const entity of link.picked) byId.set(entity.id, entity);
  for (const entity of [...room.automatic, ...room.picks, ...room.options]) byId.set(entity.id, entity);
  const [search, setSearch] = useState("");
  const selected = selectedIds.map((id) => byId.get(id)).filter((entity): entity is LinkedEntity => !!entity);

  return (
    <Box>
      {readOnly ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ color: "text.secondary", pr: 1 }}>
            {link.label}:
          </Typography>
          {selected.length === 0 ? (
            <EmptyValue />
          ) : (
            selected.map((entity) => <ValueChip color="default" key={entity.id} label={entity.name} />)
          )}
        </Stack>
      ) : (
        <Autocomplete
          multiple
          size="small"
          options={[...selected, ...room.options]}
          filterSelectedOptions
          loading={isLoading}
          noOptionsText={emptyOptionsText(link.label, error, link.none)}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selected}
          // Each render builds a new value, which the Autocomplete answers with a "reset" that would clear the search
          // as it's typed. Typing, picking an entity and blur still set it.
          inputValue={search}
          onInputChange={(_, input, reason) => {
            if (reason !== "reset") setSearch(input);
          }}
          onChange={(_, newValue) =>
            picks.onChange([
              ...selectedIds.filter((id) => automaticIds.has(id)),
              ...newValue.map((entity) => entity.id).filter((id) => !automaticIds.has(id)),
            ])
          }
          onBlur={picks.onBlur}
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
          renderInput={(params) => <TextField {...params} label={link.label} variant="outlined" />}
        />
      )}
    </Box>
  );
}

/**
 * A `fields` block: the character's portrait, then its fields' lines and the fields under them, its picked links (3.5's
 * languages), and its notes (its private ones where the block gives them: who reads them alone), saved together. A partly
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
          // Only who reads the private notes saves them: a form without their field leaves them as they are
          json: { ...sentFieldsOf(block, formData), updatedAt: sync.updatedAt() },
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
          {block.portrait && (
            <AttachmentField
              name="portrait"
              label={block.portrait}
              recordId={characterId}
              readOnly={portraitReadOnly}
              url={portraitUrl}
            />
          )}

          {/* Its fields' lines, 24px apart as the fields in a line are */}
          <Stack spacing={3} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
            {block.lines.map((line) => (
              <Box key={line.map(({ key }) => key).join()} sx={LINE_SX}>
                {line.map((field) => (
                  <FieldInput key={field.key} control={form.control} field={field} readOnly={readOnly} />
                ))}
              </Box>
            ))}

            {block.links?.map((link) => (
              <LinkPicksField
                key={link.link}
                characterId={characterId}
                control={form.control}
                link={link}
                readOnly={readOnly}
              />
            ))}

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
