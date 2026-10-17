import { Button, DialogContentText, FormHelperText, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useRef, useState } from "react";
import { type Control, Controller, useController } from "react-hook-form";

import { CreateDialog, LoadError } from "@/client/src/components/common/index.ts";
import { ImportIcon } from "@/client/src/components/icons/index.ts";
import {
  BaseRulesetAlert,
  type RulesetOption,
  RulesetPicker,
  useRulesetPickerOptions,
} from "@/client/src/components/rulesets/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import { type CharacterImport, characterImportersQuery } from "@/client/src/pages/characters/characterQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { MAX_IMPORT_FILE_LENGTH } from "@/shared/characters.ts";

interface ImportCharacterDialogProps {
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  /** The character was imported: what the import answered, which its report shows. */
  onImported: (imported: CharacterImport) => void;
  open: boolean;
}

interface ImportFileFieldProps {
  control: Control<ImportFormData>;
}

/** What an import is sent with: the ruleset it goes into, and the file picked. */
interface ImportFormData {
  file: PickedFile | null;
  rulesetId: string;
}

/** A file picked: its name, and its text once it's read, or why it can't be sent (too large, unread). */
interface PickedFile {
  error?: string;
  name: string;
  text?: string;
}

/** The import's form before anything is picked. */
const EMPTY_IMPORT: ImportFormData = { file: null, rulesetId: "" };

/** The file's rules: one is picked, and read. */
const FILE_RULES = {
  validate: (file: ImportFormData["file"]) => (file ? (file.error ?? true) : "File is required"),
};

/** The file to import, picked from the device and read as text: its name once picked, and why it can't be sent. */
function ImportFileField({ control }: ImportFileFieldProps) {
  const {
    field: { onChange, ref, value },
    fieldState,
  } = useController({ control, name: "file", rules: FILE_RULES });
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  // Which pick is the latest: a read that ends after another file was picked is let go
  const latestPick = useRef<File | null>(null);

  // An import reads up to so many characters: a file whose bytes can't hold so few (three bytes at most each) isn't
  // read at all, one read is checked by its characters
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    latestPick.current = file;
    const tooLarge: PickedFile = { error: "This file is too large to import", name: file.name };
    if (file.size > 3 * MAX_IMPORT_FILE_LENGTH) {
      onChange(tooLarge);
      return;
    }
    const picked = await file.text().then(
      (text): PickedFile => {
        if (text.length > MAX_IMPORT_FILE_LENGTH) return tooLarge;
        return text.trim() ? { name: file.name, text } : { error: "This file is empty", name: file.name };
      },
      (): PickedFile => ({ error: "This file couldn't be read: pick it again", name: file.name }),
    );
    if (latestPick.current === file) onChange(picked);
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Button ref={ref} variant="outlined" startIcon={<ImportIcon />} onClick={() => fileInput?.click()}>
          Choose File
        </Button>
        <Typography variant="body2" sx={{ color: value ? "text.primary" : "text.secondary", minWidth: 0 }} noWrap>
          {value?.name ?? "No file chosen"}
        </Typography>
      </Stack>
      {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
      <input
        ref={setFileInput}
        type="file"
        accept=".pcg"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again fires its change
          event.target.value = "";
          void handleFile(file);
        }}
      />
    </Stack>
  );
}

/**
 * A character imported from a file another program saved (PCGen's), into a ruleset: the ruleset picked decides which
 * programs' files it reads, which the dialog says. Mounted while it's open, it starts clean at each opening; once the
 * import is in, its opener shows its report.
 */
export function ImportCharacterDialog({ open, onClose, onExited, onImported }: ImportCharacterDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const rulesetOptions = useRulesetPickerOptions("character", open);
  const { preselected } = rulesetOptions;
  // The user's own ruleset is picked once it's known, unless the user picked one already
  const form = useFormWith<ImportFormData>(EMPTY_IMPORT, {
    values: preselected ? { ...EMPTY_IMPORT, rulesetId: preselected.id } : undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const { control, watch } = form;
  const selectedRulesetId = watch("rulesetId");
  const [pickedRuleset, setPickedRuleset] = useState<RulesetOption | null>(null);
  const selectedRuleset = pickedRuleset ?? (preselected?.id === selectedRulesetId ? preselected : null);
  const importers = useQuery(characterImportersQuery(selectedRulesetId));

  const importMutation = useMutation({
    mutationFn: async ({ rulesetId, text }: { rulesetId: string; text: string }) =>
      parseResponse(rpc.api.characters.import.$post({ json: { rulesetId, text } })),
    onSuccess: (imported) => {
      snackbar.success("Character imported");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.lists });
      onClose();
      onImported(imported);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to import character");
    },
  });

  const handleImport = ({ file, rulesetId }: ImportFormData) => {
    if (file?.text) importMutation.mutate({ rulesetId, text: file.text });
  };

  const programs = importers.data?.programs.join(", ");

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Import Character"
      submitLabel="Import"
      submitIcon={<ImportIcon />}
      form={form}
      onSubmit={handleImport}
      pending={importMutation.isPending}
      onExited={onExited}
    >
      <DialogContentText>
        {programs
          ? `This ruleset imports characters from ${programs}: pick a character file it saved.`
          : "Pick the ruleset to import into, then a character file another program saved."}
      </DialogContentText>
      {importers.error && <LoadError what="Importers" error={importers.error} />}
      <BaseRulesetAlert ruleset={selectedRuleset} />
      <Controller
        name="rulesetId"
        control={control}
        rules={requiredRules("Ruleset is required")}
        render={({ field, fieldState }) => (
          <RulesetPicker
            options={rulesetOptions}
            value={selectedRuleset}
            onChange={(ruleset) => {
              setPickedRuleset(ruleset);
              field.onChange(ruleset?.id ?? "");
            }}
            error={fieldState.error}
            inputRef={field.ref}
          />
        )}
      />
      <ImportFileField control={control} />
    </CreateDialog>
  );
}
