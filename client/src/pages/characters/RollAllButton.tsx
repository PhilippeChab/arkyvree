import { Button } from "@mui/material";

import { CasinoIcon } from "@/client/src/components/icons/index.ts";

interface RollAllButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

/** Rolls every die a step asks for (a new character's ability scores, the levels' hit points), its dice and its words. */
export function RollAllButton({ disabled, onClick }: RollAllButtonProps) {
  return (
    <Button size="small" startIcon={<CasinoIcon />} onClick={onClick} disabled={disabled}>
      Roll All
    </Button>
  );
}
