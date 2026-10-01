import { rulesetPickerQuery } from "@/client/src/lib/queries.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";
import { DiceSpinner, Modal, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
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
import { useEffect, useMemo, useState } from "react";

type ExtensionRuleset = RulesetListItem;

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

  const { items: extensions, isLoading: isLoadingExtensions, onScroll } = useListboxQuery({
    ...rulesetPickerQuery("extensions", debouncedSearch),
    enabled: open,
  });

  const options = useMemo(
    () => extensions.filter((ext) => !subscribedExtensionIds.includes(ext.id)),
    [extensions, subscribedExtensionIds],
  );

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
                onScroll,
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
