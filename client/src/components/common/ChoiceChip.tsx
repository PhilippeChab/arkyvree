import { Chip } from "@mui/material";

interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

/** One of several to choose from (a level's feat or spell pools): filled while it's the one chosen. */
export function ChoiceChip({ label, selected, onClick }: ChoiceChipProps) {
  return (
    <Chip
      label={label}
      variant={selected ? "filled" : "outlined"}
      color={selected ? "primary" : "default"}
      onClick={onClick}
      aria-pressed={selected}
    />
  );
}
