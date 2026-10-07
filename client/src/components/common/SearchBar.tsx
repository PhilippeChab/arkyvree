import { IconButton, InputAdornment, Menu, MenuItem, TextField, Tooltip } from "@mui/material";
import { type ReactNode } from "react";

import { FilterIcon, SearchIcon, SortIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu } from "@/client/src/hooks/index.ts";
import type { Direction } from "@/client/src/lib/queries.ts";

import { ListToolbar } from "./ListToolbar.tsx";

interface SearchBarProps<TFilter extends string = string, TSort extends string = string> {
  actions?: ReactNode;
  filterOptions?: FilterOption<TFilter>[];
  filters?: ReactNode;

  filterValue?: TFilter;
  onFilterChange?: (value: TFilter | undefined) => void;
  onSearchChange: (value: string) => void;

  onSortChange?: (field: TSort, direction: Direction) => void;
  searchPlaceholder?: string;
  searchValue: string;
  sortDirection?: Direction;

  sortField?: TSort;
  sortOptions?: SortOption<TSort>[];
}

export interface FilterOption<T extends string = string> {
  label: string;
  value: T | undefined;
}

export interface SortOption<T extends string = string> {
  direction: Direction;
  field: T;
  label: string;
}

export function SearchBar<TFilter extends string = string, TSort extends string = string>({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  filterOptions,
  filterValue,
  onFilterChange,
  sortOptions,
  sortField,
  sortDirection,
  onSortChange,
  filters,
  actions,
}: SearchBarProps<TFilter, TSort>) {
  const filterMenu = useAnchorMenu();
  const sortMenu = useAnchorMenu();

  const handleFilterSelect = (value: TFilter | undefined) => {
    onFilterChange?.(value);
    filterMenu.closeMenu();
  };

  const handleSortSelect = (field: TSort, direction: Direction) => {
    onSortChange?.(field, direction);
    sortMenu.closeMenu();
  };

  return (
    <ListToolbar
      actions={
        <>
          {actions}

          {filterOptions && filterOptions.length > 0 && (
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

          {sortOptions && sortOptions.length > 0 && (
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
        sx={{ width: { xs: "100%", sm: 300 } }}
      />

      {filters}
    </ListToolbar>
  );
}
