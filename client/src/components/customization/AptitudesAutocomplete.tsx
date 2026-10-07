import { Autocomplete, Chip, TextField } from "@mui/material";
import { type InferResponseType } from "hono/client";
import { type Ref } from "react";

import { type rpc } from "@/client/src/services/rpc.ts";

import { useAptitudeOptions } from "./useAptitudeOptions.ts";

interface AptitudeAutocompleteProps {
  disabled?: boolean;
  label?: string;
  onChange: (aptitude: Aptitude | null) => void;
  rulesetId: string;
  scope?: "feats" | "spells";
  size?: "small" | "medium";
  value: Aptitude | null;
}

interface AptitudesAutocompleteProps {
  disabled?: boolean;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  onChange: (aptitudes: Aptitude[]) => void;
  rulesetId: string;
  scope?: "feats" | "spells";
  value: Aptitude[];
}

type AptitudesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$get"], 200>;

export type Aptitude = AptitudesPaginated["items"][number];

export function AptitudeAutocomplete({
  rulesetId,
  value,
  onChange,
  disabled,
  label = "Aptitude",
  size,
  scope,
}: AptitudeAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId, scope);

  // Ensure selected value always appears in options
  const options =
    value && !fetchedOptions.some((opt) => opt.id === value.id) ? [value, ...fetchedOptions] : fetchedOptions;

  return (
    <Autocomplete
      options={options}
      {...autocompleteProps}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      disabled={disabled}
      size={size}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

export function AptitudesAutocomplete({
  rulesetId,
  value,
  onChange,
  disabled,
  scope,
  inputRef,
}: AptitudesAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId, scope);

  // Merge selected values with fetched options so selected items always appear
  const selectedIds = new Set(value.map((v) => v.id));
  const options = [...value, ...fetchedOptions.filter((opt) => !selectedIds.has(opt.id))];

  return (
    <Autocomplete
      multiple
      options={options}
      {...autocompleteProps}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      disabled={disabled}
      renderValue={(tagValue, getItemProps) =>
        tagValue.map((option, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <Chip key={key} label={option.name} size="small" {...chipProps} />;
        })
      }
      renderInput={(params) => <TextField {...params} inputRef={inputRef} label="Aptitudes" />}
    />
  );
}
