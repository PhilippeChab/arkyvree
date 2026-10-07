import {
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DiceSpinner, LoadError, NextPageSpinner } from "@/client/src/components/common/index.ts";
import { ChevronRightIcon, ClearIcon, FilterListIcon, PublicIcon } from "@/client/src/components/icons/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { firstPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { formatSegment, type PathCompletion, type TargetPathKind } from "@/shared/customization/target.ts";

import { targetCompletionsQuery } from "./customizationQueries.ts";
import { type PathInfo, toPathInfo } from "./pathValues.ts";

interface TargetPathBrowserProps {
  rulesetId: string;
  kind: TargetPathKind;
  entityType?: string;
  segments: string[];
  isComplete: boolean;
  disabled?: boolean;
  /** The new path, and what it takes when it's a leaf picked from the list. */
  onChange: (value: string, picked?: PathInfo) => void;
}

/** A leaf's path and what it takes, which its completion carries; none for a group. */
function pickedOf(option: PathCompletion) {
  const { path, valueType, operators } = option;
  if (option.kind !== "property" || !path || !valueType || !operators) return undefined;
  return toPathInfo({ ...option, path, valueType, operators });
}

export function TargetPathBrowser({
  rulesetId,
  kind,
  entityType,
  segments,
  isComplete,
  disabled,
  onChange,
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
    if (isComplete && segments.length > 1) return segments.slice(0, -1).join(".") + ".";

    return segments.join(".") + ".";
  }, [segments, isComplete]);

  const {
    data: completionsData,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...targetCompletionsQuery(rulesetId, kind, entityType, browsePrefix, debouncedSearch, flatMode),
    enabled: !disabled,
    placeholderData: keepPreviousData,
  });

  // Segment labels from the completions response
  const segmentLabels = useMemo(() => {
    return firstPage(completionsData)?.segmentLabels ?? {};
  }, [completionsData]);

  const completions = useMemo(() => {
    const items = pageItems(completionsData);
    return items.reduce((acc: PathCompletion[], item) => {
      if (!acc.some((c) => c.insertText === item.insertText)) acc.push(item);
      return acc;
    }, []);
  }, [completionsData]);

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

  const handleNavigate = (option: PathCompletion) => {
    setSearch("");
    const picked = pickedOf(option);
    if (picked) {
      onChange(picked.path, picked);
    } else if (flatMode && option.path) {
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

  const handleScroll = createListboxScrollHandler({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const breadcrumbSegments = segments;

  return (
    <Stack spacing={1}>
      {/* Breadcrumbs: a segment's chevron a quarter unit from its chip, three from the chip before */}
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 0.5, minHeight: 32 }}>
        {breadcrumbSegments.map((segment, index) => (
          <Stack key={index} direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
            {index > 0 && <ChevronRightIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
            <Chip
              label={segmentLabels[segment] || formatSegment(segment)}
              size="small"
              variant="filled"
              color={isComplete ? "success" : "info"}
              onClick={disabled ? undefined : () => handleBreadcrumbClick(index)}
              sx={{ cursor: disabled ? "default" : "pointer" }}
            />
          </Stack>
        ))}
        {breadcrumbSegments.length > 0 && !disabled && (
          // A unit from the last chip
          <Stack direction="row" sx={{ pl: 0.25 }}>
            <IconButton size="small" aria-label="Clear Path" onClick={handleClear}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
        {breadcrumbSegments.length === 0 && <Skeleton variant="rounded" width={100} height={24} />}
      </Stack>
      {/* Search + List */}
      {!disabled && (
        <>
          <Stack direction="row" spacing={0.5} sx={{ position: "relative", alignItems: "center" }}>
            <TextField
              size="small"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
            />
            <Tooltip
              describeChild
              title={
                searchEverywhere
                  ? "Searching everywhere — click to limit to this level"
                  : "Searching this level only — click to search everywhere"
              }
              arrow
            >
              <IconButton
                size="small"
                onClick={() => setSearchEverywhere((prev) => !prev)}
                color={searchEverywhere ? "primary" : "default"}
                aria-label="Search Everywhere"
                aria-pressed={searchEverywhere}
              >
                {searchEverywhere ? <PublicIcon fontSize="small" /> : <FilterListIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            {isLoading && (
              <Box
                sx={{ position: "absolute", top: "50%", left: "calc(50% - 24px)", transform: "translate(-50%, -50%)" }}
              >
                <DiceSpinner size="small" />
              </Box>
            )}
          </Stack>
          <List
            dense
            sx={{
              height: 250,
              overflowY: "auto",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              overscrollBehavior: "contain",
            }}
            onScroll={handleScroll}
          >
            {completions.map((option) => {
              const isGroup = option.kind === "group" || option.kind === "category";
              const isSelected = flatMode
                ? selectedLeaf?.path === option.path
                : selectedLeaf?.insertText === option.insertText;
              const flatBreadcrumb =
                flatMode && option.path
                  ? option.path
                      .split(".")
                      .map((seg) => segmentLabels[seg] || formatSegment(seg))
                      .join(" › ")
                  : null;
              return (
                <Tooltip
                  describeChild
                  title={option.detail}
                  placement="right"
                  enterDelay={400}
                  arrow
                  key={option.insertText}
                >
                  <ListItemButton selected={isSelected} onClick={() => handleNavigate(option)}>
                    <ListItemText
                      primary={
                        flatBreadcrumb ? (
                          <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 400 }}>
                            {flatBreadcrumb}
                          </Typography>
                        ) : (
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Typography variant="body2" sx={{ fontWeight: isGroup || isSelected ? 600 : 400 }}>
                              {segmentLabels[option.label] || formatSegment(option.label)}
                            </Typography>
                            {isGroup && <ChevronRightIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
                          </Stack>
                        )
                      }
                    />
                  </ListItemButton>
                </Tooltip>
              );
            })}
            {!!error && completions.length === 0 && <LoadError what="Paths" error={error} />}
            {!error && completions.length === 0 && !isLoading && (
              <Typography variant="body2" sx={{ color: "text.secondary", px: 2, py: 1 }}>
                No results
              </Typography>
            )}
            <NextPageSpinner loading={isFetchingNextPage} />
          </List>
        </>
      )}
    </Stack>
  );
}
