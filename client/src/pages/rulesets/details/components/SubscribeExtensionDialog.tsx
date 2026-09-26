import { ScrollSafeListbox, DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Extension as ExtensionIcon } from "@mui/icons-material";
import {
  Autocomplete,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useMemo, useState } from "react";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";

type RulesetsResponse = InferResponseType<typeof rpc.api.rulesets.$get>;
type RulesetsPaginated = Exclude<RulesetsResponse, { error: string }>;
type ExtensionRuleset = RulesetsPaginated["items"][number];

interface SubscribeExtensionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (extensionIds: string[]) => void;
  isLoading: boolean;
  subscribedExtensionIds: string[];
}

export function SubscribeExtensionDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  subscribedExtensionIds,
}: SubscribeExtensionDialogProps) {
  const [selected, setSelected] = useState<ExtensionRuleset[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (!open) {
      // oxlint-disable-next-line react/set-state-in-effect
      setSelected([]);
      setSearch("");
    }
  }, [open]);

  const { data, isLoading: isLoadingExtensions, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.lists, "extensions", debouncedSearch],
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.rulesets.$get({
        query: {
          scope: "extensions",
          limit: "10",
          page: pageParam.toString(),
          ...(debouncedSearch && { search: debouncedSearch }),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open,
  });

  const options = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.items) ?? [];
    return all.filter((ext) => !subscribedExtensionIds.includes(ext.id));
  }, [data, subscribedExtensionIds]);

  const handleScroll = createListboxScrollHandler({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const handleClose = () => {
    if (isLoading) return;
    setSelected([]);
    setSearch("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidth="md"
      slotProps={{ paper: { sx: { minHeight: { xs: undefined, sm: 600 } } } }}
    >
      <DialogTitle>Subscribe to Extensions</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            Add content from official sourcebooks or community-published
            extensions. Extension entities will be available in your ruleset
            via inheritance.
          </DialogContentText>
          <Autocomplete
            multiple
            disableCloseOnSelect
            filterSelectedOptions
            options={options}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            value={selected}
            onChange={(_, newValue) => setSelected(newValue)}
            onInputChange={(_, inputValue, reason) => {
              if (reason === "input") setSearch(inputValue);
            }}
            filterOptions={(x) => x}
            loading={isLoadingExtensions}
            disabled={isLoading}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getItemProps({ index });
                return <Chip key={key} label={option.name} size="small" {...tagProps} />;
              })
            }
            renderInput={(params) => (
              <TextField {...params} label="Select extensions" />
            )}
            fullWidth
            slotProps={{
              listbox: {
                component: ScrollSafeListbox,

                ...{
                  onScroll: handleScroll,
                  style: { maxHeight: 280 },
                }
              }
            }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={() => selected.length > 0 && onConfirm(selected.map((s) => s.id))}
          variant="contained"
          disabled={selected.length === 0 || isLoading}
          startIcon={<ExtensionIcon />}
        >
          <DiceSpinner size="small" loading={isLoading}>{`Subscribe${selected.length > 1 ? ` (${selected.length})` : ""}`}</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}
