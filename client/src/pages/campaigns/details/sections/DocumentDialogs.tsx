import {
  Alert,
  Button,
  Checkbox,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormHelperText,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { useState } from "react";
import { useController, type UseFormReturn } from "react-hook-form";

import {
  CreateDialog,
  DeleteDialog,
  DialogFooter,
  EditDialog,
  ExpandArrow,
  LoadError,
  Modal,
  NameField,
  SelectField,
  TextAreaField,
} from "@/client/src/components/common/index.ts";
import { AttachFileIcon, DeleteIcon, FolderIcon, MoveIcon } from "@/client/src/components/icons/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { DOCUMENT_VISIBILITY_OPTIONS, MAX_DOCUMENT_NAME_LENGTH } from "@/shared/campaignDocuments.ts";

import {
  type AudienceChange,
  type CampaignDocument,
  describeContents,
  describeDocumentFile,
  describeFileRefusal,
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_ICONS,
  type DocumentFile,
  type DocumentFormData,
  findMoveTargets,
  isAudienceChanged,
  listFolder,
  previewAudience,
  readDocumentIconKind,
  VISIBILITY_DESCRIPTIONS,
} from "./documents.ts";

interface AudienceNoteProps {
  change: AudienceChange;
  /** What the dialog does: "Creating", "Saving", "Moving". */
  doing: string;
  /** Why the tree it's worked out of didn't load, said in its place. */
  loadError?: unknown;
}

interface DeleteDocumentDialogProps {
  item: CampaignDocument | null;
  items: readonly CampaignDocument[];
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
}

interface DocumentFileFieldProps {
  /** The file the document holds, which an edit keeps unless another is picked or it's removed. */
  current: DocumentFile | null;
  disabled: boolean;
  form: UseFormReturn<DocumentFormData>;
}

interface DocumentFormDialogProps {
  form: UseFormReturn<DocumentFormData>;
  /** The item it edits (none for a new one), the file it holds, and where a new one goes. */
  item: Pick<CampaignDocument, "id" | "kind" | "name"> & { file?: DocumentFile | null; parentId: string | null };
  items: readonly CampaignDocument[];
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (data: DocumentFormData) => void;
  open: boolean;
  pending: boolean;
  /** The seats a user holds, by their names, whom the change is said to show or hide it from. */
  playerNames: ReadonlyMap<string, string>;
  /** The campaign's players' seats, by their names, a Selected item's choices, an empty one among them. */
  seatNames: ReadonlyMap<string, string>;
  /** Why the campaign's seats didn't load, which its players' choice says. */
  seatsError: unknown;
  /** Why the campaign's tree didn't load, said in place of whom the change shows it to. */
  treeError?: unknown;
  /** Whether its form shows a document's text: an edit from the tab, which hasn't read it, doesn't. */
  withText: boolean;
}

interface FolderBranchProps {
  folderId: string | null;
  items: readonly CampaignDocument[];
  targets: ReadonlySet<string | null>;
}

interface FolderLabelProps {
  name: string;
}

interface MoveDocumentDialogProps {
  item: CampaignDocument;
  items: readonly CampaignDocument[];
  onClose: () => void;
  onExited: () => void;
  onMove: (parentId: string | null) => void;
  open: boolean;
  pending: boolean;
  /** The seats a user holds, by their names, whom the move is said to show or hide it from. */
  playerNames: ReadonlyMap<string, string>;
}

interface ReaderSelectProps {
  disabled: boolean;
  form: UseFormReturn<DocumentFormData>;
  /** Why the campaign's seats didn't load: said under it. */
  loadError: unknown;
  seatNames: ReadonlyMap<string, string>;
}

/** The tree's top, as the move's tree names it: the Documents tab's own level. */
const TOP = "top";

/**
 * Who a change shows an item to and hides it from, before it's saved; nothing when it changes neither, and why it
 * can't say when the tree didn't load (`loadError`).
 */
function AudienceNote({ change, doing, loadError }: AudienceNoteProps) {
  if (loadError) return <LoadError what="Documents" error={loadError} />;
  const { gained, lost } = change;
  if (gained.length === 0 && lost.length === 0) return null;
  const shows = gained.length > 0 && `shows it to ${gained.join(", ")}`;
  const hides = lost.length > 0 && `hides it from ${lost.join(", ")}`;
  return (
    <Alert severity={gained.length > 0 ? "warning" : "info"}>
      {doing} it {[shows, hides].filter(Boolean).join(" and ")}
    </Alert>
  );
}

/**
 * A document's file, a picture or a PDF: one picked to upload once its form is saved (`file`), checked as it's picked;
 * the one it holds, kept, or removed once it's saved (`removeFile`), which Undo takes back.
 */
function DocumentFileField({ current, disabled, form }: DocumentFileFieldProps) {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const {
    field: { ref, value: picked, onChange: setPicked },
    fieldState,
  } = useController({
    control: form.control,
    name: "file",
    rules: { validate: (file) => (file && describeFileRefusal(file)) || true },
  });
  const {
    field: { value: removed, onChange: setRemoved },
  } = useController({ control: form.control, name: "removeFile" });
  const kept = removed ? null : current;
  const shown = picked ? { name: picked.name, byteSize: picked.size, contentType: picked.type } : kept;
  const ShownIcon = DOCUMENT_ICONS[readDocumentIconKind({ kind: "Document", file: shown })];
  const said = picked
    ? `${describeDocumentFile(shown!)} · uploaded when saved`
    : kept
      ? describeDocumentFile(kept)
      : removed
        ? `${current?.name} is removed when saved`
        : "A picture (PNG, JPEG, WebP, GIF) or a PDF, 10 MB at most";

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Button
          ref={ref}
          variant="outlined"
          startIcon={<AttachFileIcon />}
          onClick={() => fileInput?.click()}
          disabled={disabled}
          sx={{ flexShrink: 0 }}
        >
          {shown ? "Replace File" : "Attach File"}
        </Button>
        {shown && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <ShownIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
              {shown.name}
            </Typography>
            <Tooltip title="Remove File">
              <span>
                <IconButton
                  size="small"
                  aria-label="Remove File"
                  disabled={disabled}
                  onClick={() => {
                    setPicked(null);
                    setRemoved(!!current);
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <FormHelperText error={!!fieldState.error} sx={{ mt: 0 }}>
          {fieldState.error?.message ?? said}
        </FormHelperText>
        {removed && !picked && (
          <Button size="small" onClick={() => setRemoved(false)} disabled={disabled}>
            Undo
          </Button>
        )}
      </Stack>
      <input
        ref={setFileInput}
        type="file"
        accept={DOCUMENT_FILE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again fires its change
          event.target.value = "";
          if (!file) return;
          setPicked(file);
          void form.trigger("file");
        }}
      />
    </Stack>
  );
}

/** A folder's branch of the move's tree: its folders, each one it can take enabled, and theirs where they have some. */
function FolderBranch({ folderId, items, targets }: FolderBranchProps) {
  return listFolder(items, folderId)
    .filter((item) => item.kind === "Folder")
    .map((folder) => (
      <TreeItem
        key={folder.id}
        itemId={folder.id}
        label={<FolderLabel name={folder.name} />}
        disabled={!targets.has(folder.id)}
      >
        {items.some((item) => item.parentId === folder.id && item.kind === "Folder") && (
          <FolderBranch folderId={folder.id} items={items} targets={targets} />
        )}
      </TreeItem>
    ));
}

/** A folder of the move's tree: its icon before its name. */
function FolderLabel({ name }: FolderLabelProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <FolderIcon fontSize="small" sx={{ color: "text.secondary" }} />
      {name}
    </Stack>
  );
}

/**
 * The seats a Selected item admits, picked among the campaign's players: one at least once whom it admits changes, so
 * an edit that leaves them alone saves, even with none left.
 */
function ReaderSelect({ form, seatNames, disabled, loadError }: ReaderSelectProps) {
  const {
    field: { ref, value, onChange, onBlur, name },
    fieldState,
  } = useController({
    control: form.control,
    name: "readerIds",
    rules: {
      validate: (ids, data) =>
        data.visibility !== "Selected" ||
        ids.length > 0 ||
        !isAudienceChanged(data, { ...data, ...form.formState.defaultValues } as DocumentFormData) ||
        "Pick at least one player",
    },
  });
  return (
    <TextField
      name={name}
      onBlur={onBlur}
      inputRef={ref}
      select
      fullWidth
      label="Players"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={!!fieldState.error || !!loadError}
      helperText={fieldState.error?.message ?? (loadError ? loadFailureMessage("Players", loadError) : undefined)}
      disabled={disabled}
      slotProps={{
        select: {
          multiple: true,
          renderValue: (ids) => (ids as string[]).map((id) => seatNames.get(id) ?? "").join(", "),
        },
      }}
    >
      {[...seatNames].map(([id, seatName]) => (
        <MenuItem key={id} value={id}>
          <Checkbox checked={value.includes(id)} size="small" sx={{ py: 0 }} />
          {seatName}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * Confirms a folder's or a document's delete: a folder's says what goes with it, never moved up to its folder, where a
 * Private folder's contents would show.
 */
export function DeleteDocumentDialog({ item, items, open, onClose, onConfirm, pending }: DeleteDocumentDialogProps) {
  const contents = item?.kind === "Folder" ? describeContents(items, item.id) : "";
  const goes = contents ? ` Everything in it is deleted too: ${contents}.` : "";
  return (
    <DeleteDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      pending={pending}
      title={`Delete ${item?.kind ?? "Document"}`}
      message={`Are you sure you want to delete ${item?.name ?? "it"}?${goes} This action cannot be undone.`}
    />
  );
}

/**
 * Creates or edits a folder or a document: its name, a document's text and file, and whom it admits, a Selected one's
 * players picked. What the change shows it to or hides it from is said at its top before it's saved (`previewAudience`).
 */
export function DocumentFormDialog({
  form,
  item,
  items,
  mode,
  open,
  onClose,
  onSubmit,
  pending,
  playerNames,
  seatNames,
  seatsError,
  treeError,
  withText,
}: DocumentFormDialogProps) {
  const [visibility, readerIds] = form.watch(["visibility", "readerIds"]);
  const change = previewAudience(items, item, { parentId: item.parentId, visibility, readerIds }, playerNames);
  const Wrapper = mode === "create" ? CreateDialog : EditDialog;
  return (
    <Wrapper
      open={open}
      onClose={onClose}
      title={mode === "create" ? `Create New ${item.kind}` : `Edit ${item.kind}`}
      form={form}
      onSubmit={onSubmit}
      pending={pending}
    >
      <AudienceNote change={change} doing={mode === "create" ? "Creating" : "Saving"} loadError={treeError} />
      <NameField control={form.control} name="name" max={MAX_DOCUMENT_NAME_LENGTH} autoFocus disabled={pending} />
      {withText && <TextAreaField control={form.control} name="body" label="Text" rows={8} disabled={pending} />}
      {item.kind === "Document" && <DocumentFileField current={item.file ?? null} disabled={pending} form={form} />}
      <SelectField
        control={form.control}
        name="visibility"
        label="Visibility"
        disabled={pending}
        helperText={VISIBILITY_DESCRIPTIONS[visibility]}
        options={DOCUMENT_VISIBILITY_OPTIONS}
      />
      {visibility === "Selected" && (
        <ReaderSelect form={form} seatNames={seatNames} disabled={pending} loadError={seatsError} />
      )}
    </Wrapper>
  );
}

/**
 * Moves a folder or a document into another folder, or to the top: the folders it can't go in (itself, one of its own,
 * one too deep for what it holds) are shown but disabled, and who the move shows it to or hides it from is said at its
 * top. Mounted while it's open, its pick its own.
 */
export function MoveDocumentDialog({
  item,
  items,
  open,
  onClose,
  onExited,
  onMove,
  pending,
  playerNames,
}: MoveDocumentDialogProps) {
  const [picked, setPicked] = useState<string>(item.parentId ?? TOP);
  const targets = findMoveTargets(items, item);
  const parentId = picked === TOP ? null : picked;
  const change = previewAudience(items, item, { parentId }, playerNames);
  const expanded = items.filter((folder) => folder.kind === "Folder").map(({ id }) => id);
  return (
    <Modal open={open} onClose={pending ? undefined : onClose} slotProps={{ transition: { onExited } }}>
      <DialogTitle>Move {item.kind}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <AudienceNote change={change} doing="Moving" />
          <DialogContentText>Pick the folder {item.name} goes in.</DialogContentText>
          <SimpleTreeView
            aria-label="Folders"
            slots={{
              collapseIcon: () => <ExpandArrow open />,
              expandIcon: () => <ExpandArrow open={false} />,
            }}
            defaultExpandedItems={[TOP, ...expanded]}
            selectedItems={picked}
            onSelectedItemsChange={(_event, id) => id && setPicked(id)}
          >
            <TreeItem itemId={TOP} label={<FolderLabel name="Top Level" />}>
              <FolderBranch folderId={null} items={items} targets={targets} />
            </TreeItem>
          </SimpleTreeView>
        </Stack>
      </DialogContent>
      <DialogFooter
        onCancel={onClose}
        pending={pending}
        action={{
          label: "Move",
          icon: <MoveIcon />,
          disabled: parentId === item.parentId,
          onClick: () => onMove(parentId),
        }}
      />
    </Modal>
  );
}
