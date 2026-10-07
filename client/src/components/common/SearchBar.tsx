import {
  Box,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
} from "@mui/material";
import { type ReactNode } from "react";

import { FilterIcon, SearchIcon, SortIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu } from "@/client/src/hooks/index.ts";

interface SearchBarProps<TFilter extends string = string, TSort extends string = string> {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  filterOptions?: FilterOption<TFilter>[];
  filterValue?: TFilter;
  onFilterChange?: (value: TFilter | undefined) => void;

  sortOptions?: SortOption<TSort>[];
  sortField?: TSort;
  sortDirection?: "asc" | "desc";
  onSortChange?: (field: TSort, direction: "asc" | "desc") => void;

  filters?: ReactNode;
  actions?: ReactNode;
}

export interface FilterOption<T extends string = string> {
  value: T | undefined;
  label: string;
}

export interface SortOption<T extends string = string> {
  field: T;
  direction: "asc" | "desc";
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

  const handleSortSelect = (field: TSort, direction: "asc" | "desc") => {
    onSortChange?.(field, direction);
    sortMenu.closeMenu();
  };

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
      <Toolbar sx={{ px: 2, py: 1 }}>
        <Stack direction="row" sx={{ alignItems: "center", flexGrow: 1, flexWrap: "wrap", columnGap: 3, rowGap: 1 }}>
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

          <Box sx={{ flexGrow: 1 }} />

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
        </Stack>
      </Toolbar>
    </Paper>
  );
}
