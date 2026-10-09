import { Autocomplete, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from "@mui/material";
import { useMemo, useState } from "react";

import { DialogFooter, Modal, ScrollSafeListbox, ValueChip } from "@/client/src/components/common/index.ts";
import { ExtensionIcon } from "@/client/src/components/icons/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { type RulesetListItem, rulesetPickerQuery } from "@/client/src/lib/queries.ts";

interface SubscribeExtensionDialogProps {
  onClose: () => void;
  onConfirm: (extensionIds: string[]) => void;
  open: boolean;
  pending: boolean;
  subscribedExtensionIds: string[];
}

type SubscribeExtensionFormProps = Omit<SubscribeExtensionDialogProps, "open">;

/** The dialog's content: its selection and search are its own, so each opening starts with none (MUI unmounts it). */
function SubscribeExtensionForm({ onClose, onConfirm, pending, subscribedExtensionIds }: SubscribeExtensionFormProps) {
  const [selected, setSelected] = useState<RulesetListItem[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const {
    items: extensions,
    isLoading: isLoadingExtensions,
    error: extensionsError,
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
            noOptionsText={emptyOptionsText("Extensions", extensionsError)}
            disabled={pending}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getItemProps({ index });
                return <ValueChip color="default" key={key} label={option.name} {...tagProps} />;
              })
            }
            renderInput={(params) => <TextField {...params} label="Select Extensions" />}
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
      <DialogFooter
        onCancel={onClose}
        pending={pending}
        action={{
          label: `Subscribe${selected.length > 1 ? ` (${selected.length})` : ""}`,
          onClick: () => selected.length > 0 && onConfirm(selected.map((s) => s.id)),
          icon: <ExtensionIcon />,
          disabled: selected.length === 0,
        }}
      />
    </>
  );
}

export function SubscribeExtensionDialog({ open, onClose, pending, ...form }: SubscribeExtensionDialogProps) {
  const handleClose = () => {
    if (!pending) onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} slotProps={{ paper: { sx: { minHeight: { xs: undefined, sm: 600 } } } }}>
      <SubscribeExtensionForm onClose={handleClose} pending={pending} {...form} />
    </Modal>
  );
}
