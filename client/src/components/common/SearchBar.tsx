import {
  Badge,
  Drawer,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  type Theme,
  Tooltip,
} from "@mui/material";
import { type ReactNode, useState } from "react";

import { CloseIcon, FilterIcon, SearchIcon, SortIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, useIsMobile } from "@/client/src/hooks/index.ts";
import type { Direction } from "@/client/src/lib/queries.ts";
import { pastInset, SAFE_BOTTOM, SAFE_LEFT, SAFE_RIGHT } from "@/client/src/theme/safeArea.ts";

import { AddButton } from "./AddButton.tsx";
import { CardTitle } from "./CardTitle.tsx";
import { ChoiceChip } from "./Chips.tsx";
import { ListToolbar } from "./ListToolbar.tsx";
import { SubsectionTitle } from "./SubsectionTitle.tsx";

interface FilterSheetProps {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  /** What it holds, its button's name too: "Filters", "Sort", "Filter and Sort" */
  title: string;
}

export interface FilterOption<T extends string = string> {
  label: string;
  value: T | undefined;
}

export interface SearchBarProps<TFilter extends string = string, TSort extends string = string> {
  /** Its toggles ("Local Changes"): at its end, before its add; on a phone, in its filters' sheet */
  actions?: ReactNode;
  /** Its add's label ("Add Race"), which names its icon alone on a phone */
  addLabel?: string;
  /**
   * Whether its `filters` or its `actions` narrow the list now (an aptitude picked, Local Changes on), which a phone's
   * filters button says with a dot, as it does for a filter menu set off its first option.
   */
  filtered?: boolean;
  filterOptions?: FilterOption<TFilter>[];
  /** What narrows the list beside its search (an aptitude, a spell level); on a phone, in its filters' sheet */
  filters?: ReactNode;

  filterValue?: TFilter;
  /** The list's add, at the bar's end: on a phone, its icon alone, right of the filters button */
  onAdd?: () => void;
  onFilterChange?: (value: TFilter | undefined) => void;
  onSearchChange: (value: string) => void;

  onSortChange?: (field: TSort, direction: Direction) => void;
  /** What it searches, said in its empty field ("Search rulesets…"). */
  searchPlaceholder: string;
  searchValue: string;
  sortDirection?: Direction;

  sortField?: TSort;
  sortOptions?: SortOption<TSort>[];
}

export interface SortOption<T extends string = string> {
  direction: Direction;
  field: T;
  label: string;
}

/** Its field takes what its row leaves on a phone (`useIsMobile`'s breakpoint), and a set width above. */
const SEARCH_SX = { width: { xs: "auto", md: 300 }, flexGrow: { xs: 1, md: 0 }, minWidth: 0 } as const;

/** Its sheet rises from the screen's foot: rounded at its top alone, its content clear of the system's edges. */
const SHEET_SX = {
  borderRadius: 2,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  pt: 2,
  pl: (theme: Theme) => pastInset(theme.spacing(2), SAFE_LEFT),
  pr: (theme: Theme) => pastInset(theme.spacing(2), SAFE_RIGHT),
  pb: (theme: Theme) => pastInset(theme.spacing(3), SAFE_BOTTOM),
} as const;

/** A phone's filters, toggles and sort, in a sheet risen from the screen's foot: its title and its close over them. */
function FilterSheet({ open, onClose, title, children }: FilterSheetProps) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { role: "dialog", "aria-label": title, sx: SHEET_SX } }}
    >
      <Stack spacing={3}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <CardTitle>{title}</CardTitle>
          <IconButton aria-label={`Close ${title}`} edge="end" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
        {children}
      </Stack>
    </Drawer>
  );
}

/** What a phone's sheet holds, which names it and its button. */
function sheetTitle(narrows: boolean, sorts: boolean) {
  if (narrows && sorts) return "Filter and Sort";
  return narrows ? "Filters" : "Sort";
}

/**
 * A list's bar: its search, its filters, its toggles, its add, and its filter and sort menus. On a phone
 * (`useIsMobile`), one row: its search, a button opening its filters, toggles and menus in a sheet, then its add.
 */
export function SearchBar<TFilter extends string = string, TSort extends string = string>({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterOptions,
  filterValue,
  onFilterChange,
  sortOptions,
  sortField,
  sortDirection,
  onSortChange,
  filters,
  filtered = false,
  actions,
  addLabel,
  onAdd,
}: SearchBarProps<TFilter, TSort>) {
  const isMobile = useIsMobile();
  const filterMenu = useAnchorMenu();
  const sortMenu = useAnchorMenu();
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasFilterMenu = !!filterOptions && filterOptions.length > 0;
  const hasSortMenu = !!sortOptions && sortOptions.length > 0;

  const handleFilterSelect = (value: TFilter | undefined) => {
    onFilterChange?.(value);
    filterMenu.closeMenu();
  };

  const handleSortSelect = (field: TSort, direction: Direction) => {
    onSortChange?.(field, direction);
    sortMenu.closeMenu();
  };

  const searchField = (
    <TextField
      size="small"
      placeholder={searchPlaceholder}
      value={searchValue}
      onChange={(e) => onSearchChange(e.target.value)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        },
      }}
      sx={SEARCH_SX}
    />
  );
  const addButton = onAdd && addLabel && <AddButton label={addLabel} onClick={onAdd} compact={isMobile} />;

  if (isMobile) {
    const narrows = !!filters || !!actions || hasFilterMenu;
    const title = sheetTitle(narrows, hasSortMenu);
    // A filter menu off its first option ("All", "Active") narrows the list too
    const showsFiltered = filtered || (hasFilterMenu && filterValue !== filterOptions[0].value);
    return (
      <>
        <ListToolbar>
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1, alignItems: "center" }}>
            {searchField}
            {(narrows || hasSortMenu) && (
              <IconButton
                aria-label={title}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
              >
                <Badge variant="dot" color="primary" invisible={!showsFiltered}>
                  {narrows ? <FilterIcon /> : <SortIcon />}
                </Badge>
              </IconButton>
            )}
            {addButton}
          </Stack>
        </ListToolbar>
        {(narrows || hasSortMenu) && (
          <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={title}>
            {filters && <Stack spacing={2}>{filters}</Stack>}
            {actions && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {actions}
              </Stack>
            )}
            {hasFilterMenu && (
              <Stack spacing={1}>
                <SubsectionTitle>Filter</SubsectionTitle>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {filterOptions.map((option) => (
                    <ChoiceChip
                      key={option.value ?? "all"}
                      label={option.label}
                      selected={filterValue === option.value}
                      onClick={() => onFilterChange?.(option.value)}
                    />
                  ))}
                </Stack>
              </Stack>
            )}
            {hasSortMenu && (
              <Stack spacing={1}>
                <SubsectionTitle>Sort</SubsectionTitle>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {sortOptions.map((option) => (
                    <ChoiceChip
                      key={`${option.field}-${option.direction}`}
                      label={option.label}
                      selected={sortField === option.field && sortDirection === option.direction}
                      onClick={() => onSortChange?.(option.field, option.direction)}
                    />
                  ))}
                </Stack>
              </Stack>
            )}
          </FilterSheet>
        )}
      </>
    );
  }

  return (
    <ListToolbar
      actions={
        <>
          {actions}
          {addButton}

          {hasFilterMenu && (
            <>
              <Tooltip title="Filter">
                <IconButton aria-label="Filter" size="small" onClick={filterMenu.openMenu}>
                  <FilterIcon />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={filterMenu.anchorEl} open={filterMenu.open} onClose={filterMenu.closeMenu}>
                {filterOptions.map((option) => (
                  <MenuItem
                    key={option.value ?? "all"}
                    onClick={() => handleFilterSelect(option.value)}
                    selected={filterValue === option.value}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {hasSortMenu && (
            <>
              <Tooltip title="Sort">
                <IconButton aria-label="Sort" size="small" onClick={sortMenu.openMenu}>
                  <SortIcon />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={sortMenu.anchorEl} open={sortMenu.open} onClose={sortMenu.closeMenu}>
                {sortOptions.map((option) => (
                  <MenuItem
                    key={`${option.field}-${option.direction}`}
                    onClick={() => handleSortSelect(option.field, option.direction)}
                    selected={sortField === option.field && sortDirection === option.direction}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </>
      }
    >
      {searchField}

      {filters}
    </ListToolbar>
  );
}
