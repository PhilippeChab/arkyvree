import { IconButton, List, ListItemButton, ListItemText, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { type Ref, useMemo, useState } from "react";

import { BlankNote, LoadError, NextPageSpinner } from "@/client/src/components/common/index.ts";
import { ChevronRightIcon, ClearIcon, FilterIcon, PublicIcon } from "@/client/src/components/icons/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { firstPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { formatSegment, type PathCompletion, type TargetPathKind } from "@/shared/customization/target.ts";

import { targetCompletionsQuery } from "./customizationQueries.ts";
import { type PathInfo, toPathInfo } from "./pathValues.ts";
import { TargetPathBreadcrumbs } from "./TargetPathBreadcrumbs.tsx";

interface TargetPathBrowserProps {
  entityType?: string;
  /** Its search field's: the target's form field `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  isComplete: boolean;
  kind: TargetPathKind;
  /** The new path, and what it takes when it's a leaf picked from the list. */
  onChange: (value: string, picked?: PathInfo) => void;
  rulesetId: string;
  segments: string[];
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
  onChange,
  inputRef,
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
    placeholderData: keepPreviousData,
  });

  // Segment labels from the completions response
  const segmentLabels = useMemo(() => firstPage(completionsData)?.segmentLabels ?? {}, [completionsData]);

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

  return (
    <Stack spacing={1}>
      <TargetPathBreadcrumbs
        target={segments.join(".")}
        targetLabels={segmentLabels}
        color={isComplete ? "success" : "info"}
        onSegmentClick={handleBreadcrumbClick}
        wrap
      >
        {segments.length === 0 ? (
          <BlankNote>No path picked yet</BlankNote>
        ) : (
          // A unit from the last chip
          <Stack direction="row" sx={{ pl: 0.25 }}>
            <IconButton size="small" aria-label="Clear Path" onClick={handleClear}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
      </TargetPathBreadcrumbs>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputRef={inputRef}
          fullWidth
        />
        <Tooltip
          describeChild
          title={
            searchEverywhere
              ? "Searching everywhere — click to limit to this level"
              : "Searching this level only — click to search everywhere"
          }
        >
          <IconButton
            size="small"
            onClick={() => setSearchEverywhere((prev) => !prev)}
            color={searchEverywhere ? "primary" : "default"}
            aria-label="Search Everywhere"
            aria-pressed={searchEverywhere}
          >
            {searchEverywhere ? <PublicIcon fontSize="small" /> : <FilterIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
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
            <Tooltip describeChild title={option.detail} placement="right" enterDelay={400} key={option.insertText}>
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
        {isLoading && completions.length === 0 && <BlankNote sx={{ px: 2, py: 1 }}>Loading…</BlankNote>}
        {!!error && completions.length === 0 && <LoadError what="Paths" error={error} />}
        {!error && completions.length === 0 && !isLoading && <BlankNote sx={{ px: 2, py: 1 }}>No results</BlankNote>}
        <NextPageSpinner loading={isFetchingNextPage} />
      </List>
    </Stack>
  );
}
