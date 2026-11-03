import { DialogContentText } from "@mui/material";
import { useController, type UseFormReturn, useWatch } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField, OptionToggle } from "@/client/src/components/common/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { formatPositions, type PositionWord, positionWordsOf } from "@/client/src/lib/rulesetLabels.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import type { LinkWords } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface BatchCountFieldProps {
  /** How many it may make at once */
  counts: readonly number[];
  form: UseFormReturn<OwnedCreateFormData>;
  /** Its owned kind's position's word ("Level", "Levels") */
  positionWord: PositionWord;
}

interface BatchTrackFieldProps {
  form: UseFormReturn<OwnedCreateFormData>;
  /** The positions what it makes takes, which a choice's values are said at */
  positions: readonly number[];
  track: BatchTrack;
}

interface CreateOwnedDialogProps {
  /** The ruleset's, whose words its title and its tracks' say */
  baseRules: BaseRules;
  /** How many it may make at once (`listBatchCounts`: 1, 5, 10, 20, up to the last position); one alone offers none */
  counts: readonly number[];
  form: UseFormReturn<OwnedCreateFormData>;
  /** The positions it takes, in order: the owner's next, the first for one (`listOpenPositions`), which it names */
  nextPositions: readonly number[];
  onClose: () => void;
  onSubmit: (data: OwnedCreateFormData) => void;
  open: boolean;
  /** Its owned kind (3.5's `class-levels`), whose word its title and its lead say */
  ownedType: string;
  /** The owner's name, which it says it adds them to */
  ownerName: string;
  pending: boolean;
  /** Its submit waits: what its tracks take hasn't loaded (an amounts track's entities) */
  submitDisabled?: boolean;
  /** The tracks it sets, each a preset or a number across what it makes */
  tracks: readonly BatchTrack[];
}

interface RemoveLinkDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  /**
   * The removal can be undone from Local Changes: the owner is inherited, or a copy of one (its owner's
   * `restorableDelete`).
   */
  restorable: boolean;
  /** Its rules' words: the linked entity's (`one`, "Skill") and the owner's (`owner`, "class"). */
  words: LinkWords;
}

/**
 * A track an owned entity's create sets across what it makes (3.5's base attack bonus, a save, skill points): its key
 * (its choice's, under `choices`), its label, what it starts at (`initial`: a preset's key, or a number), the presets
 * it can follow, or the bounds of the number it sets at each (`min`, `max`, and what that number is, `unitLabel`:
 * "Points a Level").
 */
export interface BatchTrack {
  /** What a choice gives what it makes, at their positions, under its toggle ("+16 at level 16, +18 at level 20") */
  describe?: (choice: number | string, positions: readonly number[]) => string | undefined;
  initial: number | string;
  key: string;
  label: string;
  max: number;
  min: number;
  presets: readonly { key: string; label: string }[];
  unitLabel?: string;
}

/**
 * An owned entity's create form: how many it makes at once (`count`, at the owner's next positions), and what each
 * track follows across them (`choices`, by track: a preset's key, or a number).
 */
export interface OwnedCreateFormData {
  choices: Record<string, number | string>;
  count: number;
}

/** How many owned entities the create makes at once, a toggle of its counts. */
function BatchCountField({ counts, form, positionWord }: BatchCountFieldProps) {
  const { field } = useController({ control: form.control, name: "count" });
  return (
    <OptionToggle
      label={`${positionWord.many} to Create`}
      options={counts.map((each) => ({ label: String(each), value: String(each) }))}
      value={String(field.value)}
      onChange={(next) => field.onChange(Number(next))}
    />
  );
}

/**
 * A track's preset across the owned entities made at once, one of its presets' toggle: what it starts at until one is
 * picked (a track whose entities loaded after the dialog opened holds none yet), and what it gives them under it.
 */
function BatchPresetField({ form, positions, track }: BatchTrackFieldProps) {
  const { field } = useController({ control: form.control, name: `choices.${track.key}` });
  const choice = String(field.value ?? track.initial);
  return (
    <OptionToggle
      label={track.label}
      options={track.presets.map(({ key, label }) => ({ label, value: key }))}
      value={choice}
      onChange={field.onChange}
      caption={track.describe?.(choice, positions)}
    />
  );
}

/** What a track follows across the owned entities made at once: a preset, or its number at each, in its bounds. */
function BatchTrackField({ form, positions, track }: BatchTrackFieldProps) {
  if (track.presets.length > 0) return <BatchPresetField form={form} positions={positions} track={track} />;
  return (
    <FormTextField
      control={form.control}
      name={`choices.${track.key}`}
      rules={wholeNumberRules(track.min, `${track.label} is required`, track.max)}
      number
      label={track.label}
      helperText={track.unitLabel}
      fullWidth
      slotProps={{ htmlInput: { min: track.min, max: track.max } }}
    />
  );
}

/**
 * An owned entity's create (3.5's Create New Level), always at the owner's next positions, which it names ("Adds levels
 * 6 to 15 to Fighter."): one or several at once (`counts`), alike, each track a preset or a number across them
 * (`tracks`), which its parent sends in one request.
 */
export function CreateOwnedDialog({
  open,
  onClose,
  form,
  onSubmit,
  pending,
  baseRules,
  counts,
  nextPositions,
  ownedType,
  ownerName,
  submitDisabled,
  tracks,
}: CreateOwnedDialogProps) {
  const { rules } = useRules(baseRules);
  const positionWord = positionWordsOf(ownedType, rules?.words);
  const count = useWatch({ control: form.control, name: "count" });
  const positions = nextPositions.slice(0, count);

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title={`Create New ${count > 1 ? positionWord.many : positionWord.one}`}
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitDisabled={submitDisabled}
    >
      {positions.length > 0 && (
        <DialogContentText>
          Adds {formatPositions(positions, positionWord).toLowerCase()} to {ownerName}.
        </DialogContentText>
      )}
      {counts.length > 1 && <BatchCountField counts={counts} form={form} positionWord={positionWord} />}
      {tracks.map((track) => (
        <BatchTrackField key={track.key} form={form} positions={positions} track={track} />
      ))}
    </CreateDialog>
  );
}

/** The confirmation of a link's removal from an owner (3.5's class skill's), in its rules' words. */
export function RemoveLinkDialog({ restorable, words, ...props }: RemoveLinkDialogProps) {
  const one = words.one.toLowerCase();
  return (
    <DeleteDialog
      {...props}
      title={`Remove ${words.one}`}
      message={
        restorable
          ? `Are you sure you want to remove this ${one} from the ${words.owner}? You can restore it from Local Changes.`
          : `Are you sure you want to remove this ${one} from the ${words.owner}? This action cannot be undone.`
      }
      confirmLabel={`Remove ${words.one}`}
    />
  );
}
