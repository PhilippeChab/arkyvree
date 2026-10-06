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
import { useMemo, useState } from "react";

import { DiceSpinner, Modal, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { rulesetPickerQuery } from "@/client/src/lib/queries.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";

type ExtensionRuleset = RulesetListItem;

interface SubscribeExtensionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (extensionIds: string[]) => void;
  isLoading: boolean;
  subscribedExtensionIds: string[];
}

/** The dialog's content: its selection and search are its own, so each opening starts with none (MUI unmounts it). */
function SubscribeExtensionForm({
  onClose,
  onConfirm,
  isLoading,
  subscribedExtensionIds,
}: Omit<SubscribeExtensionDialogProps, "open">) {
  const [selected, setSelected] = useState<ExtensionRuleset[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const {
    items: extensions,
    isLoading: isLoadingExtensions,
    onScroll,
  } = useListboxQuery(rulesetPickerQuery("extensions", debouncedSearch));

  const options = useMemo(
    () => extensions.filter((ext) => !subscribedExtensionIds.includes(ext.id)),
    [extensions, subscribedExtensionIds],
  );

  return (
    <>
      <DialogTitle>Subscribe to Extensions</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            Add content from official sourcebooks or community-published extensions. Extension entities will be
            available in your ruleset via inheritance.
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
            renderInput={(params) => <TextField {...params} label="Select extensions" />}
            fullWidth
            slotProps={{
              listbox: {
                component: ScrollSafeListbox,
                onScroll,
              },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={() => selected.length > 0 && onConfirm(selected.map((s) => s.id))}
          variant="contained"
          disabled={selected.length === 0 || isLoading}
          startIcon={<ExtensionIcon />}
        >
          <DiceSpinner
            size="small"
            loading={isLoading}
          >{`Subscribe${selected.length > 1 ? ` (${selected.length})` : ""}`}</DiceSpinner>
        </Button>
      </DialogActions>
    </>
  );
}

export function SubscribeExtensionDialog({ open, onClose, isLoading, ...form }: SubscribeExtensionDialogProps) {
  const handleClose = () => {
    if (!isLoading) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidth="md"
      slotProps={{ paper: { sx: { minHeight: { xs: undefined, sm: 600 } } } }}
    >
      <SubscribeExtensionForm onClose={handleClose} isLoading={isLoading} {...form} />
    </Modal>
  );
}
