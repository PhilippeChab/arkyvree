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
import { useState } from "react";

import { FilterIcon, SearchIcon, SortIcon } from "@/client/src/components/icons/index.ts";

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

  filters?: React.ReactNode;
  actions?: React.ReactNode;
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
  searchPlaceholder = "Search...",
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
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(null);
  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);

  const handleFilterClick = (event: React.MouseEvent<HTMLElement>) => {
    setFilterAnchorEl(event.currentTarget);
  };

  const handleFilterClose = () => {
    setFilterAnchorEl(null);
  };

  const handleFilterSelect = (value: TFilter | undefined) => {
    onFilterChange?.(value);
    handleFilterClose();
  };

  const handleSortClick = (event: React.MouseEvent<HTMLElement>) => {
    setSortAnchorEl(event.currentTarget);
  };

  const handleSortClose = () => {
    setSortAnchorEl(null);
  };

  const handleSortSelect = (field: TSort, direction: "asc" | "desc") => {
    onSortChange?.(field, direction);
    handleSortClose();
  };

  return (
    <Paper elevation={0} sx={{ mb: 3, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Toolbar sx={{ px: 2, py: 1 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexGrow: 1, flexWrap: "wrap", gap: 1 }}>
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
                <IconButton size="small" onClick={handleFilterClick}>
                  <FilterIcon />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={filterAnchorEl} open={Boolean(filterAnchorEl)} onClose={handleFilterClose}>
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
                <IconButton size="small" onClick={handleSortClick}>
                  <SortIcon />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={sortAnchorEl} open={Boolean(sortAnchorEl)} onClose={handleSortClose}>
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
