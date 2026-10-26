import { Button, DialogContentText, FormHelperText, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useRef, useState } from "react";
import { type Control, Controller, useController } from "react-hook-form";

import { CreateDialog } from "@/client/src/components/common/index.ts";
import { ImportIcon } from "@/client/src/components/icons/index.ts";
import {
  BaseRulesetAlert,
  type RulesetOption,
  RulesetPicker,
  useRulesetPickerOptions,
} from "@/client/src/components/rulesets/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith, useRules } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import type { RulesDescriptions } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import type { CharacterImport, ImportFileDescription } from "@/client/src/pages/characters/characterQueries.ts";
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
  /** What the file picked is, once the app read it: the rulesets that import it are offered alone. */
  onDescribed: (description: ImportFileDescription) => void;
}

/** What an import is sent with: the file picked, and the ruleset it goes into. */
interface ImportFormData {
  file: PickedFile | null;
  rulesetId: string;
}

/**
 * A file picked: its name, its text once it's read, and what it is once the app read it (`description`); or why it
 * can't be sent (too large, unread, a file no ruleset imports, which its description says), or that it's still being
 * read.
 */
interface PickedFile {
  description?: ImportFileDescription;
  error?: string;
  name: string;
  reading?: boolean;
  text?: string;
}

/** The import's form before anything is picked. */
const EMPTY_IMPORT: ImportFormData = { file: null, rulesetId: "" };

/** The file's rules: one is picked, read, and of a kind a ruleset imports. */
const FILE_RULES = {
  validate: (file: ImportFormData["file"]) => {
    if (!file) return "File is required";
    if (file.reading) return "The file is still being read";
    return file.error ?? true;
  },
};

/**
 * The programs the app imports characters from, as every base rules' imports name them (`RulesDescription.importers`):
 * " (PCGen's)", none until the rules load.
 */
function describePrograms(all: RulesDescriptions | undefined) {
  const programs = [...new Set(Object.values(all ?? {}).flatMap((rules) => rules.importers))];
  return programs.length > 0 ? ` (${programs.map((program) => `${program}'s`).join(" or ")})` : "";
}

/** What a file is, in a line: the program that saved it and its version, the file's format, its character's rules. */
function describeSource(source: NonNullable<ImportFileDescription["source"]>) {
  const rules = source.rules ? `, a character of its ${source.rules} rules` : "";
  return `${source.program} ${source.version}, file format ${source.format}${rules}`;
}

/**
 * The file to import, picked from the device and read as text, then what it is, which the app reads from it (the
 * program that saved it, its version, its character's rules): its name once picked, what it is, and why it can't be
 * sent.
 */
function ImportFileField({ control, onDescribed }: ImportFileFieldProps) {
  const {
    field: { onChange, ref, value },
    fieldState,
  } = useController({ control, name: "file", rules: FILE_RULES });
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  // Which pick is the latest: a read that ends after another file was picked is let go
  const latestPick = useRef<File | null>(null);
  // What the app makes of the file's text: what it is, or why it can't be imported; a read another pick overtook is
  // let go
  const sourceMutation = useMutation({
    mutationFn: async ({ text }: { file: File; text: string }) =>
      parseResponse(rpc.api.characters.import.source.$post({ json: { text } })),
    onSuccess: (description, { file, text }) => {
      if (latestPick.current !== file) return;
      onChange({ description, name: file.name, text, ...(description.refusal && { error: description.refusal }) });
      onDescribed(description);
    },
    onError: (error, { file }) => {
      if (latestPick.current !== file) return;
      onChange({ error: errorMessage(error, "The app couldn't tell what this file is"), name: file.name });
    },
  });

  // An import reads up to so many characters: a file whose bytes can't hold so few (three bytes at most each) isn't
  // read at all, one read is checked by its characters, then sent to be told what it is
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    latestPick.current = file;
    const tooLarge: PickedFile = { error: "This file is too large to import", name: file.name };
    if (file.size > 3 * MAX_IMPORT_FILE_LENGTH) {
      onChange(tooLarge);
      return;
    }
    onChange({ name: file.name, reading: true });
    const text = await file.text().catch(() => undefined);
    if (latestPick.current !== file) return;
    if (text === undefined) onChange({ error: "This file couldn't be read: pick it again", name: file.name });
    else if (text.length > MAX_IMPORT_FILE_LENGTH) onChange(tooLarge);
    else if (!text.trim()) onChange({ error: "This file is empty", name: file.name });
    else sourceMutation.mutate({ file, text });
  };

  const described = value?.description?.source && !value.error ? describeSource(value.description.source) : "";

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
      {value?.reading && <FormHelperText>Reading the file…</FormHelperText>}
      {described && <FormHelperText>{described}</FormHelperText>}
      {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
      <input
        ref={setFileInput}
        type="file"
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
 * A character imported from a file another program saved (PCGen's): the file first, which the app reads what it is
 * from (the program that saved it, its version, its character's rules), then the ruleset it goes into, of the rulesets
 * that import it alone. Mounted while it's open, it starts clean at each opening; once the import is in, its opener
 * shows its report.
 */
export function ImportCharacterDialog({ open, onClose, onExited, onImported }: ImportCharacterDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const rulesetOptions = useRulesetPickerOptions("character", open);
  const { all: rules } = useRules();
  const { preselected } = rulesetOptions;
  // The base rules whose rulesets import the file the app last read, kept while another is read: none before one, or
  // for a file none imports (which its own error blocks), which every ruleset is offered for
  const [importing, setImporting] = useState<ImportFileDescription["baseRules"] | null>(null);
  const imports = (ruleset: RulesetOption) => !importing || importing.includes(ruleset.baseRules);
  const importingOptions = { ...rulesetOptions, rulesets: rulesetOptions.rulesets.filter(imports) };
  // The user's own ruleset is picked once it's known, when it imports the file, unless the user picked one already
  const form = useFormWith<ImportFormData>(EMPTY_IMPORT, {
    values: preselected && imports(preselected) ? { ...EMPTY_IMPORT, rulesetId: preselected.id } : undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const { control, setValue, watch } = form;
  const selectedRulesetId = watch("rulesetId");
  const [pickedRuleset, setPickedRuleset] = useState<RulesetOption | null>(null);
  const selectedRuleset = pickedRuleset ?? (preselected?.id === selectedRulesetId ? preselected : null);

  // A file the ruleset picked doesn't import lets the ruleset go: the rulesets that import it are offered instead
  const handleDescribed = ({ baseRules, refusal }: ImportFileDescription) => {
    setImporting(refusal ? null : baseRules);
    if (!refusal && selectedRuleset && !baseRules.includes(selectedRuleset.baseRules)) {
      setPickedRuleset(null);
      setValue("rulesetId", "", { shouldDirty: true, shouldValidate: true });
    }
  };

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
        {`Pick a character file another program saved${describePrograms(rules)}: the app reads which program saved it, ` +
          "its version and its rules, then offers the rulesets that import it."}
      </DialogContentText>
      <ImportFileField control={control} onDescribed={handleDescribed} />
      <BaseRulesetAlert ruleset={selectedRuleset} />
      <Controller
        name="rulesetId"
        control={control}
        rules={requiredRules("Ruleset is required")}
        render={({ field, fieldState }) => (
          <RulesetPicker
            options={importingOptions}
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
    </CreateDialog>
  );
}
