/** The list sorts pages share, so the same sort reads the same everywhere. */

import type { SortOption } from "./SearchBar.tsx";

export const CREATED_SORTS: SortOption<"createdAt">[] = [
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
];

export const NAME_SORTS: SortOption<"name">[] = [
  { field: "name", direction: "asc", label: "Name (A-Z)" },
  { field: "name", direction: "desc", label: "Name (Z-A)" },
];

export const UPDATED_SORTS: SortOption<"updatedAt">[] = [
  { field: "updatedAt", direction: "desc", label: "Recently Updated" },
  { field: "updatedAt", direction: "asc", label: "Least Recently Updated" },
];
