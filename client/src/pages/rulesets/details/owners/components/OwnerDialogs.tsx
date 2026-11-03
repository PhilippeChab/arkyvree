import { DialogContentText } from "@mui/material";
import { useController, type UseFormReturn, useWatch } from "react-hook-form";

import {
  CreateDialog,
  DeleteDialog,
  FormTextField,
  OptionToggle,
  SelectField,
} from "@/client/src/components/common/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { formatPositions, type PositionWord, positionWordsOf } from "@/client/src/lib/rulesetLabels.ts";
import { requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";
import { EntitiesAutocomplete } from "@/client/src/pages/rulesets/components/index.ts";
import type { LinkWords } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface AddListedDialogProps {
  form: UseFormReturn<ListedFormData>;
  /**
   * The list it adds to, as the tab read it: its id, which an entity already on it can't be picked for (none: the
   * owner's own list, which the add makes), and its name
   */
  list: { id: string | null; name: string | null } | null;
  onClose: () => void;
  onExited: () => void;
  onSubmit: (data: ListedFormData) => void;
  open: boolean;
  /** The owner's name, which a list the add makes is for */
  ownerName: string;
  pending: boolean;
  /** The role of its entities' links to their lists (its kind's pools' `role`), by which one on the list is known */
  role: string | undefined;
  rulesetId: string;
  /** The tiers an entity takes on the list, as its rules name them */
  tiers: RulesDescription["tiers"];
  /** The kind its entities are of (`counts.type`: 3.5's spells), which it searches */
  type: string;
  words: ListedWords;
}

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

interface RemoveListedDialogProps {
  /** What it removes, by name, and the list it's removed from */
  entityName: string | undefined;
  listName: string | null | undefined;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  /**
   * The removal can be undone from Local Changes: the entity is inherited, or the ruleset's copy of one (its page's
   * `restorableDelete`, which the server answers).
   */
  restorable: boolean;
  words: ListedWords;
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
 * The entities an add to an owner's list sends (3.5's spells to a class's spell list), as its dialog holds them: those
 * picked, by their id and name, and their tier on it (a spell's level).
 */
export interface ListedFormData {
  entities: Pick<EntityRow, "id" | "name">[];
  tier: number;
}

/** What a list's add and removal say, in its rules' words: its entities' (`one`, `many`) and its tiers' (`tier`). */
export interface ListedWords {
  many: string;
  one: string;
  tier: string;
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
 * The add of entities to an owner's list (3.5's spells to a class's spell list): those picked, searched on the server
 * (one already on the list greyed, saying so), and their tier on it, in its rules' words, sent in one save; a list the
 * add makes (the owner's own, where it has none) said to be new.
 */
export function AddListedDialog({
  form,
  list,
  onClose,
  onExited,
  onSubmit,
  open,
  ownerName,
  pending,
  role,
  rulesetId,
  tiers,
  type,
  words,
}: AddListedDialogProps) {
  const many = words.many.toLowerCase();
  const { field: picked, fieldState } = useController({
    control: form.control,
    name: "entities",
    rules: { validate: (entities) => entities.length > 0 || `Pick at least one ${words.one.toLowerCase()}` },
  });
  // An entity on the list already, at any tier, can't be picked again
  const alreadyListed = (entity: EntityRow) =>
    list?.id && entity.links.some((link) => link.role === role && link.toId === list.id)
      ? `Already on ${list.name}`
      : undefined;
  // A list the add makes says so
  const made = list?.id === null ? `, a new list for ${ownerName}` : "";
  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      onExited={onExited}
      title={`Add ${words.many}`}
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel={`Add ${words.many}`}
    >
      <DialogContentText>
        {`Pick the ${many} to add to ${list?.name}${made}, and their ${words.tier.toLowerCase()} on it.`}
      </DialogContentText>
      <EntitiesAutocomplete
        rulesetId={rulesetId}
        type={type}
        label={words.many}
        inputRef={picked.ref}
        error={fieldState.error}
        value={picked.value}
        onChange={picked.onChange}
        unavailable={alreadyListed}
      />
      <SelectField
        control={form.control}
        name="tier"
        label={words.tier}
        rules={requiredRules(`${words.tier} is required`)}
        options={tiers.map(({ label, tier }) => ({ label, value: tier }))}
      />
    </CreateDialog>
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

/** The confirmation of an entity's removal from an owner's list (3.5's spell's from a class's spell list). */
export function RemoveListedDialog({ entityName, listName, restorable, words, ...props }: RemoveListedDialogProps) {
  const what = `${entityName} from ${listName}`;
  return (
    <DeleteDialog
      {...props}
      title={`Remove ${words.one}`}
      message={
        restorable
          ? `Are you sure you want to remove ${what}? You can restore it from Local Changes.`
          : `Are you sure you want to remove ${what}? This action cannot be undone.`
      }
      confirmLabel={`Remove ${words.one}`}
    />
  );
}
