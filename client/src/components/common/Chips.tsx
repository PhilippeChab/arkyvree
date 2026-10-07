import { Chip, type ChipProps } from "@mui/material";
import { Link } from "react-router-dom";

/**
 * A chip of the family: MUI's, its size and its fill set by its role. What it's handed beyond its label and color (a
 * click that opens its choices, a delete, an input's tag props, a tooltip's handlers) goes on to MUI's chip.
 */
type FamilyChipProps = Omit<ChipProps, "size" | "sx" | "variant">;

interface ValueChipProps extends FamilyChipProps {
  /** Warms the page its link opens, as it's pointed at or focused. */
  onPrefetch?: () => void;
  /** The record it names, which it opens: a link, its icon, label and delete kept (the ruleset a fork comes from). */
  to?: string;
}

/** A chip keeps its whole label beside text that wraps (a change's name in Local Changes). */
const CHIP_SX = { flexShrink: 0 } as const;

/** A count ("3 variants", "1 player", a point-buy's points): outlined, at the theme's small size. */
export function CountChip({ ...props }: FamilyChipProps) {
  return <Chip {...props} size="small" variant="outlined" sx={CHIP_SX} />;
}

/** Someone's role (Owner, Admin, Game Master): outlined, at the theme's small size. */
export function RoleChip({ ...props }: FamilyChipProps) {
  return <Chip {...props} size="small" variant="outlined" sx={CHIP_SX} />;
}

/** The state something is in (Active, Draft, Private, Shared, modified): filled, at the theme's small size. */
export function StatusChip({ ...props }: FamilyChipProps) {
  return <Chip {...props} size="small" variant="filled" sx={CHIP_SX} />;
}

/**
 * A value something has (a hit die, a size, a race, a pick, an operator), the same in its list, on its page and in its
 * header: outlined red (another color for a secondary fact), at the theme's small size; a link when it names a record.
 */
export function ValueChip({ color = "primary", onPrefetch, to, ...props }: ValueChipProps) {
  if (!to) return <Chip {...props} color={color} size="small" variant="outlined" sx={CHIP_SX} />;
  const { icon, label, onDelete } = props;
  return (
    <Chip
      component={Link}
      to={to}
      clickable
      icon={icon}
      label={label}
      onDelete={onDelete}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      color={color}
      size="small"
      variant="outlined"
      sx={CHIP_SX}
    />
  );
}
