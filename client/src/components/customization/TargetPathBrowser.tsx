import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { PathCompletion } from "@/shared/customization/target.ts";
import { formatSegment } from "@/shared/utils.ts";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Clear from "@mui/icons-material/Clear";
import Public from "@mui/icons-material/Public";
import FilterList from "@mui/icons-material/FilterList";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import {
  Box,
  Chip,
  IconButton,

  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

interface TargetPathBrowserProps {
  rulesetId: string;
  kind: "modifier" | "requirement";
  entityType?: string;
  segments: string[];
  isComplete: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSelectedCompletion?: (completion: PathCompletion | null) => void;
}

export function TargetPathBrowser({
  rulesetId,
  kind,
  entityType,
  segments,
  isComplete,
  disabled,
  onChange,
  onSelectedCompletion,
}: TargetPathBrowserProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  // Search-first mode: a non-empty search term flips the list to a flat scan
  // across every leaf path, regardless of the current drill prefix. The user
  // can flip to within-current-level filtering via the scope toggle.
  const [searchEverywhere, setSearchEverywhere] = useState(true);
  const flatMode = debouncedSearch.length > 0 && searchEverywhere;

  // When path is complete, browse parent level to show siblings with selection.
  const browsePrefix = useMemo(() => {
    if (segments.length === 0) return "";
    if (isComplete && segments.length > 1) {
      return segments.slice(0, -1).join(".") + ".";
    }
    return segments.join(".") + ".";
  }, [segments, isComplete]);

  const queryPrefix = flatMode ? "" : browsePrefix;

  const { data: completionsData, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.targetCompletions(rulesetId, flatMode ? `flat:${debouncedSearch}` : browsePrefix, kind, debouncedSearch, entityType),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].customization["target"].paths.completions.$post({
        param: { id: rulesetId },
        json: {
          partialPath: queryPrefix,
          position: queryPrefix.length,
          kind,
          ...(entityType && { entityType }),
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(flatMode && { flat: true }),
          limit: 50,
          page: pageParam,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch completions");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!rulesetId && !disabled,
    staleTime: 5000,
    placeholderData: keepPreviousData,
  });

  // Segment labels from the completions response
  const segmentLabels = useMemo(() => {
    return completionsData?.pages[0]?.segmentLabels ?? {};
  }, [completionsData?.pages]);

  const completions = useMemo(() => {
    const items = completionsData?.pages.flatMap((page) => page.items) ?? [];
    return items.reduce((acc: PathCompletion[], item) => {
      if (!acc.some((c) => c.insertText === item.insertText)) acc.push(item);
      return acc;
    }, []);
  }, [completionsData?.pages]);

  // Detect selected leaf from completions. In flat mode insertText is the full
  // path; in drill mode it's the last segment.
  const fullPath = segments.join(".");
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null;
  const selectedLeaf = useMemo(() => {
    if (flatMode) {
      if (!fullPath) return null;
      return completions.find((c) => c.path === fullPath) ?? null;
    }
    if (!lastSegment) return null;
    return completions.find((c) => c.insertText === lastSegment && c.path) ?? null;
  }, [flatMode, fullPath, lastSegment, completions]);

  // Report the selected leaf completion to the parent (for path info)
  useEffect(() => {
    if (!onSelectedCompletion) return;
    onSelectedCompletion(selectedLeaf);
  }, [selectedLeaf, onSelectedCompletion]);

  const handleNavigate = (option: PathCompletion) => {
    setSearch("");
    if (flatMode && option.path) {
      // Flat search results carry the full path in `path` and the inserted
      // value is also the full path — replace the current path entirely
      // rather than appending.
      onChange(option.path);
    } else if (isComplete) {
      onChange([...segments.slice(0, -1), option.insertText].join("."));
    } else {
      onChange([...segments, option.insertText].join("."));
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    setSearch("");
    onChange(segments.slice(0, index).join("."));
  };

  const handleClear = () => {
    setSearch("");
    onChange("");
  };

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const breadcrumbSegments = segments;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {/* Breadcrumbs */}
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, minHeight: 32 }}>
        {breadcrumbSegments.map((segment, index) => (
          <Box key={index} sx={{ display: "flex", alignItems: "center" }}>
            {index > 0 && (
              <ChevronRight sx={{ fontSize: 16, color: "text.secondary", mx: 0.25 }} />
            )}
            <Chip
              label={segmentLabels[segment] || formatSegment(segment)}
              size="small"
              variant="filled"
              color={isComplete ? "success" : "info"}
              onClick={disabled ? undefined : () => handleBreadcrumbClick(index)}
              sx={{ cursor: disabled ? "default" : "pointer" }}
            />
          </Box>
        ))}
        {breadcrumbSegments.length > 0 && !disabled && (
          <IconButton size="small" onClick={handleClear} sx={{ ml: 0.5 }}>
            <Clear fontSize="small" />
          </IconButton>
        )}
        {breadcrumbSegments.length === 0 && (
          <Skeleton variant="rounded" width={100} height={24} />
        )}
      </Box>
      {/* Search + List */}
      {!disabled && (
        <>
          <Box sx={{ position: "relative", display: "flex", gap: 0.5, alignItems: "center" }}>
            <TextField
              size="small"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
            />
            <Tooltip title={searchEverywhere ? "Searching everywhere — click to limit to this level" : "Searching this level only — click to search everywhere"} arrow>
              <IconButton
                size="small"
                onClick={() => setSearchEverywhere((prev) => !prev)}
                color={searchEverywhere ? "primary" : "default"}
                aria-label="Toggle search scope"
              >
                {searchEverywhere ? <Public fontSize="small" /> : <FilterList fontSize="small" />}
              </IconButton>
            </Tooltip>
            {isLoading && (
              <Box sx={{ position: "absolute", top: "50%", left: "calc(50% - 24px)", transform: "translate(-50%, -50%)" }}>
                <DiceSpinner size="small" />
              </Box>
            )}
          </Box>
          <List
            dense
            sx={{ height: 250, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: 1, overscrollBehavior: "contain" }}
            onScroll={handleScroll}
          >
            {completions.map((option) => {
              const isGroup = option.kind === "group" || option.kind === "category";
              const isSelected = flatMode
                ? selectedLeaf?.path === option.path
                : selectedLeaf?.insertText === option.insertText;
              const flatBreadcrumb = flatMode && option.path
                ? option.path.split(".").map((seg) => segmentLabels[seg] || formatSegment(seg)).join(" › ")
                : null;
              return (
                <Tooltip title={option.detail} placement="right" enterDelay={400} arrow key={option.insertText}>
                  <ListItemButton
                    selected={isSelected}
                    onClick={() => handleNavigate(option)}
                  >
                    <ListItemText
                      primary={
                        flatBreadcrumb ? (
                          <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 400 }}>
                            {flatBreadcrumb}
                          </Typography>
                        ) : (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: isGroup || isSelected ? 600 : 400 }}>
                              {segmentLabels[option.label] || formatSegment(option.label)}
                            </Typography>
                            {isGroup && (
                              <ChevronRight sx={{ fontSize: 16, color: "text.secondary" }} />
                            )}
                          </Box>
                        )
                      }
                    />
                  </ListItemButton>
                </Tooltip>
              );
            })}
            {completions.length === 0 && !isLoading && (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  px: 2,
                  py: 1
                }}>
                No results
              </Typography>
            )}
            {isFetchingNextPage && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                <DiceSpinner size="small" />
              </Box>
            )}
          </List>
        </>
      )}
    </Box>
  );
}
