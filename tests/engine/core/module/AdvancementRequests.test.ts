import { describe, expect, test } from "bun:test";

import { AdvancementRequests, type AdvancementStep, type StepMechanic } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { thrownBy } from "@/tests/support/errors.ts";

/** Requests no view is read for, of a character with no advancements, in a word of their own. */
const REQUESTS = new AdvancementRequests({} as RulesetData, [], { many: "Circles", one: "Circle" });

/** A step of `mechanic`'s named `name`, as a ruleset of no game's lists it: its words aren't read. */
function stepOf(name: string, mechanic: StepMechanic) {
  return { label: name, mechanic, name, words: {} } as AdvancementStep;
}

describe("An advancement's request", () => {
  test("refuses in its ruleset's word an advancement the character hasn't", () => {
    expect(thrownBy(() => REQUESTS.findAdvancement("none"))).toEqual(
      new RulesError("not-found", "Character circle not found"),
    );
  });

  test("refuses in its ruleset's word a step its advancement hasn't", () => {
    expect(thrownBy(() => REQUESTS.resolvePlan([], { steps: { charms: [] } }))).toEqual(
      new RulesError("invalid", "The circle has no charms step"),
    );
    expect(thrownBy(() => REQUESTS.resolveStepPicker([], "charms", { plan: { steps: {} } }))).toEqual(
      new RulesError("not-found", "Circle step not found"),
    );
  });

  test("refuses a key its step's mechanic doesn't take, each by its place, as a body's validation does", () => {
    const steps = [
      stepOf("path", "plan"),
      stepOf("gifts", "choose"),
      stepOf("lore", "spend"),
      stepOf("charms", "pick"),
    ];
    const payloads = {
      charms: [{ id: "a", note: "x", pool: "b", tier: "1" }],
      gifts: [[{ amount: 1, id: "a" }], [{ amount: 1, by: 2, id: "a" }]],
      lore: [{ id: "a", points: 1, rank: 2, why: "" }],
      path: [{ position: 3, track: "a" }],
    };
    const issue = (category: string, mechanic: StepMechanic) => ({
      category,
      message: `Not a key of a ${mechanic} step's answer`,
    });
    // At each entry's place: a plan's, a choice's at its advancement, and a spend's keys each by its own
    expect(thrownBy(() => REQUESTS.resolvePlan(steps, { steps: { path: payloads.path } }))).toEqual(
      new RulesError("invalid", "Request validation failed", [issue("steps.path.0.position", "plan")]),
    );
    expect(thrownBy(() => REQUESTS.resolvePlan(steps, { steps: { gifts: payloads.gifts } }))).toEqual(
      new RulesError("invalid", "Request validation failed", [issue("steps.gifts.1.0.by", "choose")]),
    );
    expect(
      thrownBy(() => REQUESTS.resolveSave(steps.slice(2), { steps: { charms: [], lore: payloads.lore } })),
    ).toEqual(
      new RulesError("invalid", "Request validation failed", [
        issue("steps.lore.0.rank", "spend"),
        issue("steps.lore.0.why", "spend"),
      ]),
    );
    // A picker's plan is its body's `plan`
    const picker = { plan: { steps: { charms: payloads.charms } } };
    expect(thrownBy(() => REQUESTS.resolveStepPicker(steps, "charms", picker))).toEqual(
      new RulesError("invalid", "Request validation failed", [issue("plan.steps.charms.0.note", "pick")]),
    );
  });
});
