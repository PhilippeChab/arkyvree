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
  /** Where it goes on a phone (`PhoneSlot`) */
  slot: PhoneSlot;
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
  /** Its least width from `sm` up, which its container scrolls sideways to; a phone lists its rows instead */
  minWidth?: number;
  size?: "small" | "medium";
  /** The `Table`'s own `sx` */
  sx?: SxProps<Theme>;
}

/** A style's object, as `sx` takes one: neither a list nor a function of the theme */
type StyleObject = Exclude<SxProps<Theme>, ReadonlyArray<unknown> | ((theme: Theme) => unknown)>;

/** A `labeled` cell's name, on a phone alone: its header says it from `sm` up */
const PHONE_LABEL_SX = { display: { xs: "inline", sm: "none" }, color: "text.secondary", pr: 0.5 };

/** A cell on a phone's second line: small and muted, as a caption, a text it holds running in its line */
const SECOND_LINE_SX: StyleObject = {
  order: 3,
  typography: "caption",
  color: "text.secondary",
  "& > .MuiTypography-root": { display: "inline", font: "inherit" },
};

/** Each slot's place in a phone's list item, its row a wrapping line of cells */
const SLOT_SX: Record<PhoneSlot, StyleObject> = {
  primary: { order: 0, flex: "1 1 0", minWidth: 0, fontWeight: 500, overflowWrap: "anywhere" },
  trailing: { order: 1, flex: "none", ml: "auto", textAlign: "right", fontWeight: 600 },
  inline: SECOND_LINE_SX,
  labeled: { ...SECOND_LINE_SX, color: "text.primary" },
  block: { order: 4, flexBasis: "100%", minWidth: 0 },
  hidden: { display: "none" },
};

/**
 * A cell as a phone shows it, in its slot. Its second line's cells are parted by a dot after each but its last (a
 * chip's gap parts it alone), and one that holds a dash (`EmptyValue`) shows nothing there.
 */
function phoneCellSx(theme: Theme, slot: PhoneSlot): StyleObject {
  const secondLine = slot === "inline" || slot === "labeled";
  return {
    [theme.breakpoints.down("sm")]: {
      display: "block",
      border: 0,
      p: 0,
      ...SLOT_SX[slot],
      ...(secondLine && {
        "&:has(.empty-value)": { display: "none" },
        "&:not(:has(.MuiChip-root)):has(~ [data-slot='inline'], ~ [data-slot='labeled'])::after": {
          content: '"·"',
          pl: 1,
          color: "text.secondary",
        },
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
      alignItems: "baseline",
      columnGap: 1,
      py: 1.25,
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
function phoneTableSx(theme: Theme, framed: boolean, headed: boolean, minWidth?: number, fixed?: boolean): StyleObject {
  return {
    [theme.breakpoints.up("sm")]: { minWidth, tableLayout: fixed ? "fixed" : undefined },
    [theme.breakpoints.down("sm")]: {
      display: "block",
      // Its rows' inset from its sides: a frame's padding, or none in a panel
      "--data-row-inset": framed ? theme.spacing(2) : "0px",
      "& > thead": { display: "none" },
      // Bare, the list keeps its header's rule over its first row
      "& > tbody": { display: "block", ...(!framed && headed && { borderTop: 2, borderColor: "secondary.main" }) },
      ...(framed && { "& > tbody > tr:last-of-type": { borderBottom: 0 } }),
    },
  };
}

/** A list of styles, the caller's after its own, as `sx` takes them */
function withSx(own: SxProps<Theme>, sx: SxProps<Theme> | undefined): SxProps<Theme> {
  return [...(Array.isArray(own) ? own : [own]), ...(Array.isArray(sx) ? sx : sx ? [sx] : [])];
}

/** A `DataRow`'s cell: from `sm` up, its column's; on a phone, where its `slot` says. */
export function DataCell({ children, label, slot, sx, ...props }: DataCellProps) {
  // A dash says nothing on a phone, nor needs a dot before it
  const shownSlot = isValidElement(children) && children.type === EmptyValue ? "hidden" : slot;
  return (
    <TableCell {...props} data-slot={shownSlot} sx={withSx((theme) => phoneCellSx(theme, shownSlot), sx)}>
      {label && shownSlot === "labeled" && (
        <Box component="span" sx={PHONE_LABEL_SX}>
          {label}
        </Box>
      )}
      {children}
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
  minWidth,
  size,
  sx,
}: DataTableProps) {
  const table = (
    <Table size={size} sx={withSx((theme) => phoneTableSx(theme, framed, !!columns, minWidth, fixed), sx)}>
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
