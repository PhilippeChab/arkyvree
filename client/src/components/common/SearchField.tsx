import { InputAdornment, type SxProps, TextField, type Theme } from "@mui/material";

import { SearchIcon } from "@/client/src/components/icons/index.ts";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** What it searches, as the field says it: "Search feats..." */
  placeholder: string;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
}

/** A search box: a list page's (in `SearchBar`) or a picker's, named by its placeholder. */
export function SearchField({ value, onChange, placeholder, fullWidth, sx }: SearchFieldProps) {
  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      fullWidth={fullWidth}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        },
      }}
      sx={sx}
    />
  );
}
