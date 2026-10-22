import RulesError from "@/engine/core/RulesError.ts";
import { isRecord } from "@/shared/isRecord.ts";

import type { LevelPlanRequest, LevelStep, StepMechanic, StepPayloads } from "./mechanics.ts";

/** Whether `value` is a whole number of at least `least`. */
function isCount(value: unknown, least: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= least;
}

/** Whether `item` is one of a payload's items in `mechanic`'s shape (`StepPayloads`). */
function isPayloadItem(mechanic: StepMechanic, item: unknown) {
  switch (mechanic) {
    case "choose":
      return (
        Array.isArray(item) &&
        item.every((option) => isRecord(option) && typeof option.id === "string" && isCount(option.amount, 1))
      );
    case "pick":
      return (
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.pool === "string" &&
        (item.tier === undefined || typeof item.tier === "string")
      );
    case "plan":
      return isRecord(item) && typeof item.track === "string" && isCount(item.position, 1);
    case "spend":
      return isRecord(item) && typeof item.id === "string" && isCount(item.points, 0);
    case "value":
      return isCount(item, 0);
  }
}

/** A plan request's payloads, each read by its step's mechanic (`StepPayloads`): in its mechanic's shape, or refused. */
export default class Payloads {
  /** A payload (`payload`) read as `step`'s, in its mechanic's shape: refused when it isn't. */
  static read<M extends StepMechanic>(
    step: Pick<LevelStep, "name"> & { mechanic: M },
    payload: unknown,
  ): StepPayloads[M] {
    if (!Array.isArray(payload) || !payload.every((item) => isPayloadItem(step.mechanic, item)))
      throw new RulesError("invalid", `The ${step.name} step's answer isn't a ${step.mechanic} step's`);
    return payload as StepPayloads[M];
  }

  /**
   * `step`'s payload in a plan request (`request`), in its mechanic's shape: none when the request gives it none,
   * refused when it isn't in its mechanic's shape.
   */
  static readStep<M extends StepMechanic>(
    request: LevelPlanRequest,
    step: Pick<LevelStep, "name"> & { mechanic: M },
  ): StepPayloads[M] {
    return Payloads.read(step, request.steps[step.name] ?? []);
  }
}
