import { useController, type UseFormReturn, useWatch } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField, OptionToggle } from "@/client/src/components/common/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { type PositionWord, positionWordsOf } from "@/client/src/lib/rulesetLabels.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import {
  EntityFields,
  type OwnedFormData,
  type OwnedLinks,
  type OwnedLists,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { LinkWords } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { useAllAmounts } from "@/client/src/pages/rulesets/hooks/index.ts";
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
  track: BatchTrack;
}

interface CreateOwnedDialogProps {
  /** The ruleset's, whose last position bounds the owned entity's number, and whose fields an owned entity has. */
  baseRules: BaseRules;
  /** How many it may make at once (`listBatchCounts`: 1, 5, 10, 20, up to the last position); one alone offers none */
  counts: readonly number[];
  form: UseFormReturn<OwnedCreateFormData>;
  /** Its owned kind's lists of links: its amounts, which its save sends all of */
  lists: OwnedLists;
  /** The places of its fields its owner's kind leaves out (`omittedPlacesOf`), which its form doesn't show */
  omitted: readonly string[];
  onClose: () => void;
  onSubmit: (data: OwnedCreateFormData) => void;
  open: boolean;
  /** Its owned kind (3.5's `class-levels`), whose fields its form shows and whose word its title says */
  ownedType: string;
  pending: boolean;
  rulesetId: string;
  /** Its submit waits: what several made at once take hasn't loaded (an amounts track's entities) */
  submitDisabled?: boolean;
  /** The tracks several made at once set, each a preset or a number across them */
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
 * A track a create of several owned entities sets across them (3.5's base attack bonus, a save, skill points): its key
 * (its choice's, under `choices`), its label, what it starts at (`initial`: a preset's key, or a number), the presets
 * it can follow, or the bounds of the number it sets at each (`min`, `max`, and what that number is, `unitLabel`:
 * "Points a Level").
 */
export interface BatchTrack {
  initial: number | string;
  key: string;
  label: string;
  max: number;
  min: number;
  presets: readonly { key: string; label: string }[];
  unitLabel?: string;
}

/**
 * An owned entity's create form, past the entity's own: how many it makes at once (`count`, from its `position` on),
 * and what each track follows across them (`choices`, by track: a preset's key, or a number).
 */
export interface OwnedCreateFormData extends OwnedFormData {
  choices: Record<string, number | string>;
  count: number;
}

/**
 * How many owned entities the create makes at once, a toggle of its counts, and which they are under it ("Levels 6 to
 * 15"), from its first position as typed.
 */
function BatchCountField({ counts, form, positionWord }: BatchCountFieldProps) {
  const { field } = useController({ control: form.control, name: "count" });
  const from = useWatch({ control: form.control, name: "position" });
  const count = Number(field.value);
  return (
    <OptionToggle
      label={`${positionWord.many} to Create`}
      options={counts.map((each) => ({ label: String(each), value: String(each) }))}
      value={String(count)}
      onChange={(next) => field.onChange(Number(next))}
      caption={count > 1 && Number.isInteger(from) ? `${positionWord.many} ${from} to ${from + count - 1}` : undefined}
    />
  );
}

/**
 * A track's preset across the owned entities made at once, one of its presets' toggle: what it starts at until one is
 * picked (a track whose entities loaded after the dialog opened holds none yet).
 */
function BatchPresetField({ form, track }: BatchTrackFieldProps) {
  const { field } = useController({ control: form.control, name: `choices.${track.key}` });
  return (
    <OptionToggle
      label={track.label}
      options={track.presets.map(({ key, label }) => ({ label, value: key }))}
      value={String(field.value ?? track.initial)}
      onChange={field.onChange}
    />
  );
}

/** What a track follows across the owned entities made at once: a preset, or its number at each, in its bounds. */
function BatchTrackField({ form, track }: BatchTrackFieldProps) {
  if (track.presets.length > 0) return <BatchPresetField form={form} track={track} />;
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
 * An owned entity's create (3.5's Create New Level): one, its number and its fields, or several at once from its number
 * on (`counts`: "Levels 6 to 15"), each track a preset or a number across them (`tracks`), which its parent sends in
 * one request.
 */
export function CreateOwnedDialog({
  open,
  onClose,
  form,
  onSubmit,
  pending,
  rulesetId,
  baseRules,
  counts,
  lists,
  omitted,
  ownedType,
  submitDisabled,
  tracks,
}: CreateOwnedDialogProps) {
  const { withAll } = useAllAmounts(rulesetId, lists.amounts);
  // Its rules' last position bounds the number (none while they load: the save's check still holds it)
  const { rules } = useRules(baseRules);
  const lastPosition = rules?.progression.lastPosition;
  const positionWord = positionWordsOf(ownedType, rules?.words);
  const position = positionWord.one;
  const count = useWatch({ control: form.control, name: "count" });
  const several = count > 1;
  // The first of several leaves room for the others up to the last position
  const lastFirst = lastPosition === undefined || !several ? lastPosition : lastPosition - count + 1;

  // The endpoint takes an amount of every entity its amounts are of (3.5's every ruleset save), 0 when unset; several
  // made at once send theirs, every amounts track's
  const amountsRole = lists.amounts?.role;
  const handleSubmit = (data: OwnedCreateFormData) =>
    onSubmit(
      amountsRole && !several
        ? {
            ...data,
            links: { ...data.links, [amountsRole]: withAll(data.links?.[amountsRole] ?? []) as OwnedLinks[string] },
          }
        : data,
    );

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title={`Create New ${several ? positionWord.many : position}`}
      form={form}
      onSubmit={handleSubmit}
      pending={pending}
      submitDisabled={several && submitDisabled}
    >
      {counts.length > 1 && <BatchCountField counts={counts} form={form} positionWord={positionWord} />}
      <FormTextField
        control={form.control}
        name="position"
        rules={wholeNumberRules(1, `${position} is required`, lastFirst)}
        number
        label={several ? `First ${position}` : position}
        fullWidth
        slotProps={{
          htmlInput: { min: 1, max: lastFirst },
        }}
      />
      {several ? (
        tracks.map((track) => <BatchTrackField key={track.key} form={form} track={track} />)
      ) : (
        <EntityFields form={form} entityType={ownedType} omitted={omitted} rulesetId={rulesetId} />
      )}
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
