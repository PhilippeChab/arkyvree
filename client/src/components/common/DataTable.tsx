import {
  Box,
  type SxProps,
  Table,
  TableBody,
  TableCell,
  type TableCellProps,
  TableContainer,
  TableRow,
  type TableRowProps,
  type Theme,
} from "@mui/material";
import { isValidElement, type ReactNode } from "react";

import { EmptyValue } from "./EmptyValue.tsx";
import { type PhoneSlot, type TableColumn, TableColumnsHead } from "./TableColumnsHead.tsx";
import { TableFrame } from "./TableFrame.tsx";

interface DataCellProps extends Omit<TableCellProps, "sx"> {
  /** Its column's name, which a `labeled` cell leads with on a phone ("Rank 6") */
  label?: string;
  /** What it shows on a phone in place of its children, shorter ("2 lbs" for "2.00 lbs") */
  phoneChildren?: ReactNode;
  /** Where it goes on a phone (`PhoneSlot`) */
  slot: PhoneSlot;
  /** Its own styles, which its slot's outrank on a phone but those set at a breakpoint (`{ xs: 600 }`) */
  sx?: SxProps<Theme>;
}

interface DataRowProps extends TableRowProps {
  /** Set in under its group's row on a phone (a grouped skill, a feat's variant); from `sm` up, its cells' `sx` indent it */
  indented?: boolean;
}

interface DataTableProps {
  /** Its rows, each a `DataRow` */
  children: ReactNode;
  /** Its header, from its columns; a table without one shows none */
  columns?: readonly TableColumn[];
  /** Its frame's `sx`: a `TableFrame`'s when framed, a bare container's otherwise */
  containerSx?: SxProps<Theme>;
  /** Columns as wide as its header's cells say, whatever their content (`table-layout: fixed`), from `sm` up */
  fixed?: boolean;
  /** On a page or in a dialog, outlined (`TableFrame`); in a panel, it stands bare */
  framed?: boolean;
  /**
   * Its rows' inset from its sides on a phone, in the theme's spacing: a frame's padding by default (2), none in a panel
   * (0), a little (1) for a bare table whose rows are shaded, which would touch their shade's edge
   */
  inset?: number;
  /** Its least width from `sm` up, which its container scrolls sideways to; a phone lists its rows instead */
  minWidth?: number;
  /**
   * On a phone, its items' chips read as plain text, parted by commas, but at a line's end (a count): a ruleset's
   * entities' facts (a size, a hit die, an aptitude, a level's feats), which name a value rather than flag a state
   */
  plainChips?: boolean;
  size?: "small" | "medium";
  /** The `Table`'s own `sx` */
  sx?: SxProps<Theme>;
}

/** A style's object, as `sx` takes one: neither a list nor a function of the theme */
type StyleObject = Exclude<SxProps<Theme>, ReadonlyArray<unknown> | ((theme: Theme) => unknown)>;

/** A `labeled` cell's name, on a phone alone: its header says it from `sm` up */
const PHONE_LABEL_SX = { display: { xs: "inline", sm: "none" }, color: "text.secondary", fontWeight: 400, pr: 0.5 };

/** What a cell shows on a phone alone, in place of what it shows from `sm` up */
const PHONE_ONLY_SX = { display: { xs: "inline", sm: "none" } };

/** A chip read as plain text, in its line's type, parted from the next by a comma */
const PLAIN_CHIPS_SX: StyleObject = {
  // Inline in its line, on its text's baseline
  "& .MuiChip-root": {
    display: "inline",
    verticalAlign: "baseline",
    height: "auto",
    border: 0,
    borderRadius: 0,
    bgcolor: "transparent",
    color: "inherit",
    font: "inherit",
  },
  // A list of chips (aptitudes, a level's feats) reads as a list; a path's chips have their chevrons between them
  "& .MuiChip-root:has(+ .MuiChip-root)::after": { content: '", "' },
  // Their rows (a list of aptitudes, a path's segments) run as a sentence, a path's chevrons a space from its words
  "& .MuiStack-root": { display: "inline" },
  "& .MuiStack-root > .MuiSvgIcon-root": { px: 0.5, verticalAlign: "middle", boxSizing: "content-box" },
  "& .MuiChip-label": { display: "inline", px: 0, whiteSpace: "normal" },
  "& .MuiChip-icon": { display: "none" },
};

/** A cell on a phone's second line: small and muted, as a caption, a text it holds running in its line */
const SECOND_LINE_SX: StyleObject = {
  order: 3,
  typography: "caption",
  color: "text.secondary",
  "& > .MuiTypography-root": { display: "inline", font: "inherit" },
  // Its cells (a text, a chip) centered on each other
  alignSelf: "center",
};

/** Each slot's place in a phone's list item, its row a wrapping line of cells */
const SLOT_SX: Record<PhoneSlot, StyleObject> = {
  primary: { order: 0, flex: "1 1 0", minWidth: 0, fontWeight: 500, overflowWrap: "break-word" },
  // Centered on the first line's text, as tall as it, whatever it holds (a number, icon buttons taller than a line)
  trailing: {
    order: 1,
    flex: "none",
    ml: "auto",
    textAlign: "right",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    height: "1.43em",
  },
  inline: SECOND_LINE_SX,
  labeled: { ...SECOND_LINE_SX, color: "text.primary", fontWeight: 600 },
  block: { order: 4, flexBasis: "100%", minWidth: 0, pt: 0.5 },
  hidden: { display: "none" },
};

/** What a cell shows from `sm` up alone */
const WIDE_ONLY_SX = { display: { xs: "none", sm: "inline" } };

/**
 * A cell as a phone shows it, in its slot. Its second line's cells are parted by the row's gap, each wrapping onto the
 * next line whole, and one that holds a dash (`EmptyValue`) shows nothing there; nor does a block that holds nothing
 * but one (a missing description, in its text).
 */
function phoneCellSx(theme: Theme, slot: PhoneSlot): StyleObject {
  const secondLine = slot === "inline" || slot === "labeled";
  return {
    [theme.breakpoints.down("sm")]: {
      display: "block",
      border: 0,
      p: 0,
      ...SLOT_SX[slot],
      ...(secondLine && { "&:has(.empty-value)": { display: "none" } }),
      ...(slot === "block" && {
        "&:has(> .empty-value:only-child, > :only-child > .empty-value:only-child)": { display: "none" },
      }),
    },
  };
}

/**
 * A row as a phone shows it: a list's item, its cells wrapping onto the lines their slots give them. A row that's
 * `hidden` (a closed group's) shows nowhere, and one with nothing in its cells (what a closed row expands to) takes no
 * room on a phone.
 */
function phoneRowSx(theme: Theme, indented: boolean): StyleObject {
  return {
    "&[hidden]": { display: "none" },
    [theme.breakpoints.down("sm")]: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-start",
      columnGap: 2,
      // Its lines apart: its second under its first by twice this (the break between them is a line of its own)
      rowGap: 0.75,
      py: 1.5,
      px: "var(--data-row-inset)",
      ...(indented && { pl: `calc(var(--data-row-inset) + ${theme.spacing(2)})` }),
      borderBottom: 1,
      borderColor: "divider",
      // The break between its first line and its second, which the second's cells follow
      "&::before": { content: '""', order: 2, flexBasis: "100%", height: 0 },
      "&[hidden], &:not(:has(> td:not(:empty)))": { display: "none" },
    },
  };
}

/** A table's own look on a phone: a list, its header gone, its rows inset from its frame */
function phoneTableSx(
  theme: Theme,
  inset: number,
  headed: boolean,
  framed: boolean,
  plainChips: boolean,
  minWidth?: number,
  fixed?: boolean,
): StyleObject {
  return {
    [theme.breakpoints.up("sm")]: { minWidth, tableLayout: fixed ? "fixed" : undefined },
    [theme.breakpoints.down("sm")]: {
      display: "block",
      // Its rows' inset from its sides
      "--data-row-inset": theme.spacing(inset),
      "& > thead": { display: "none" },
      // Bare, the list keeps its header's rule over its first row
      "& > tbody": { display: "block", ...(!framed && headed && { borderTop: 2, borderColor: "secondary.main" }) },
      ...(framed && { "& > tbody > tr:last-of-type": { borderBottom: 0 } }),
      ...(plainChips && { "& > tbody > tr > td:not([data-slot='trailing'])": PLAIN_CHIPS_SX }),
    },
  };
}

/** A list of styles, the caller's after its own, as `sx` takes them */
function withSx(own: SxProps<Theme>, sx: SxProps<Theme> | undefined): SxProps<Theme> {
  return [...(Array.isArray(own) ? own : [own]), ...(Array.isArray(sx) ? sx : sx ? [sx] : [])];
}

/** A `DataRow`'s cell: from `sm` up, its column's; on a phone, where its `slot` says. */
export function DataCell({ children, label, phoneChildren, slot, sx, ...props }: DataCellProps) {
  // A dash says nothing on a phone, nor needs a dot before it
  const shownSlot = isValidElement(children) && children.type === EmptyValue ? "hidden" : slot;
  return (
    <TableCell {...props} data-slot={shownSlot} sx={withSx((theme) => phoneCellSx(theme, shownSlot), sx)}>
      {label && shownSlot === "labeled" && (
        <Box component="span" sx={PHONE_LABEL_SX}>
          {label}
        </Box>
      )}
      {phoneChildren === undefined ? (
        children
      ) : (
        <>
          <Box component="span" sx={WIDE_ONLY_SX}>
            {children}
          </Box>
          <Box component="span" sx={PHONE_ONLY_SX}>
            {phoneChildren}
          </Box>
        </>
      )}
    </TableCell>
  );
}

/** A `DataTable`'s row: from `sm` up, its row; on a phone, a list's item. */
export function DataRow({ indented = false, sx, ...props }: DataRowProps) {
  return <TableRow {...props} sx={withSx((theme) => phoneRowSx(theme, indented), sx)} />;
}

/**
 * A table, as the app draws one: from `sm` up, the table it is, its header from its columns (`TableColumnsHead`),
 * framed on a page or in a dialog (`TableFrame`) or bare in a panel; on a phone, a list, each row (`DataRow`) an item
 * whose cells (`DataCell`) go where their slot (`PhoneSlot`) says, so nothing scrolls sideways out of view.
 */
export function DataTable({
  children,
  columns,
  containerSx,
  fixed,
  framed = false,
  inset,
  minWidth,
  plainChips = false,
  size,
  sx,
}: DataTableProps) {
  const table = (
    <Table
      size={size}
      sx={withSx(
        (theme) => phoneTableSx(theme, inset ?? (framed ? 2 : 0), !!columns, framed, plainChips, minWidth, fixed),
        sx,
      )}
    >
      {columns && <TableColumnsHead columns={columns} />}
      <TableBody>{children}</TableBody>
    </Table>
  );
  return framed ? (
    <TableFrame sx={containerSx}>{table}</TableFrame>
  ) : (
    <TableContainer sx={withSx({ overflowX: "auto" }, containerSx)}>{table}</TableContainer>
  );
}
