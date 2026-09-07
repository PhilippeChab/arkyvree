import { ScrollSafeListbox, DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
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
  Typography,
} from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useMemo, useState } from "react";

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
      setSelected([]);
      setSearch("");
    }
  }, [open]);

  const { data, isLoading: isLoadingExtensions, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.lists, "extensions", debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets.$get({
        query: {
          scope: "extensions",
          limit: "10",
          page: pageParam.toString(),
          ...(debouncedSearch && { search: debouncedSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch extensions");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open,
  });

  const options = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.items) ?? [];
    return all.filter((ext) => !subscribedExtensionIds.includes(ext.id));
  }, [data, subscribedExtensionIds]);

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      (target as unknown as Record<string, () => void>).__lockScroll?.();
      fetchNextPage();
    }
  };

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
      <DialogTitle>
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Subscribe to Extensions
        </Typography>
      </DialogTitle>
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
      <DialogActions sx={{ px: 3, py: 2 }}>
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
