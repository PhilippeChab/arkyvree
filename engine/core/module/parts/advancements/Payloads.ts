import RulesError, { type RulesIssue } from "@/engine/core/RulesError.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type {
  AdvancementPlanRequest,
  AdvancementStep,
  ChosenOption,
  PickedEntity,
  PlannedAdvancement,
  SpentPoints,
  StepMechanic,
  StepPayloads,
} from "./mechanics.ts";

/** What a payload entry's key holds: a whole number from 0 or from 1, text, or text when it's given. */
type EntryValue = "count" | "count from 1" | "optional text" | "text";

/**
 * The keys a payload's entries take, by mechanic, each with what it holds (`StepPayloads`): a `choose` step's options',
 * a `pick`'s, a `plan`'s and a `spend`'s entries' (a `value` step's are numbers). An entry is in its mechanic's shape
 * when each holds its value, and takes no other key. Each list names every key of its entry's type.
 */
const ENTRY_KEYS: {
  choose: Record<keyof ChosenOption, EntryValue>;
  pick: Record<keyof PickedEntity, EntryValue>;
  plan: Record<keyof PlannedAdvancement, EntryValue>;
  spend: Record<keyof SpentPoints, EntryValue>;
} = {
  choose: { amount: "count from 1", id: "text" },
  pick: { id: "text", pool: "text", tier: "optional text" },
  plan: { track: "text" },
  spend: { id: "text", points: "count" },
};

/**
 * A payload's entries (`payload`, in `mechanic`'s shape), each with its place in the request (`at`, under the payload's
 * own place): a `choose` step's options, at each advancement; each item otherwise, a `value` step's none.
 */
function entriesOf(mechanic: StepMechanic, payload: unknown[], at: string[]) {
  if (mechanic === "value") return [];
  if (mechanic !== "choose") return payload.map((entry, i) => ({ at: [...at, String(i)], entry: entry as object }));
  return payload.flatMap((options, i) =>
    (options as object[]).map((entry, j) => ({ at: [...at, String(i), String(j)], entry })),
  );
}

/** Whether `value` is a whole number of at least `least`. */
function isCount(value: unknown, least: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= least;
}

/** Whether `entry` is an entry of `keys`' (its mechanic's, `ENTRY_KEYS`): each key holding its value. */
function isEntry(keys: Record<string, EntryValue>, entry: unknown) {
  return isRecord(entry) && Object.entries(keys).every(([key, value]) => isEntryValue(value, entry[key]));
}

/** Whether `value` is what an entry's key of `kind` holds. */
function isEntryValue(kind: EntryValue, value: unknown) {
  switch (kind) {
    case "count":
      return isCount(value, 0);
    case "count from 1":
      return isCount(value, 1);
    case "optional text":
      return value === undefined || typeof value === "string";
    case "text":
      return typeof value === "string";
  }
}

/** Whether `item` is one of a payload's items in `mechanic`'s shape (`StepPayloads`). */
function isPayloadItem(mechanic: StepMechanic, item: unknown) {
  switch (mechanic) {
    case "choose":
      return Array.isArray(item) && item.every((option) => isEntry(ENTRY_KEYS.choose, option));
    case "value":
      return isCount(item, 0);
    default:
      return isEntry(ENTRY_KEYS[mechanic], item);
  }
}

/**
 * The keys a payload's entries give (`payload`, in `mechanic`'s shape, at `at`) that its mechanic's entries don't take
 * (`ENTRY_KEYS`), each an issue at its place, as a body's field its entity hasn't is (`steps.feats.0.note`).
 */
function unknownKeysOf(mechanic: StepMechanic, payload: unknown[], at: string[]): RulesIssue[] {
  if (mechanic === "value") return [];
  const known = ENTRY_KEYS[mechanic];
  return entriesOf(mechanic, payload, at).flatMap(({ at: place, entry }) =>
    Object.keys(entry)
      .filter((key) => !Object.hasOwn(known, key))
      .map((key) => ({ category: [...place, key].join("."), message: `Not a key of a ${mechanic} step's answer` })),
  );
}

/**
 * A plan request's payloads, each read by its step's mechanic (`StepPayloads`): in its mechanic's shape, with no key it
 * doesn't take, or refused.
 */
export default class Payloads {
  /**
   * A payload (`payload`) read as `step`'s, in its mechanic's shape: refused when it isn't, and then, as invalid as a
   * body's validation refuses a field its entity hasn't, each key an entry gives that its mechanic's don't take, at its
   * place under its request's steps (`path`: a plan's `steps`, a picker's `plan.steps`).
   */
  static read<M extends StepMechanic>(
    step: Pick<AdvancementStep, "name"> & { mechanic: M },
    payload: unknown,
    path: readonly string[] = ["steps"],
  ): StepPayloads[M] {
    if (!Array.isArray(payload) || !payload.every((item) => isPayloadItem(step.mechanic, item)))
      throw new RulesError("invalid", `The ${step.name} step's answer isn't a ${step.mechanic} step's`);
    const unknown = unknownKeysOf(step.mechanic, payload, [...path, step.name]);
    if (unknown.length > 0) throw new RulesError("invalid", "Request validation failed", unknown);
    return payload as StepPayloads[M];
  }

  /**
   * `step`'s payload in a plan request (`request`), in its mechanic's shape: none when the request gives it none,
   * refused when it isn't in its mechanic's shape.
   */
  static readStep<M extends StepMechanic>(
    request: Pick<AdvancementPlanRequest, "steps">,
    step: Pick<AdvancementStep, "name"> & { mechanic: M },
  ): StepPayloads[M] {
    return Payloads.read(step, request.steps[step.name] ?? []);
  }
}
