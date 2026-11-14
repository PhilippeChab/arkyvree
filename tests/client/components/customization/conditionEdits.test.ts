import { describe, expect, test } from "bun:test";

import { toConditionEdit } from "@/client/src/components/customization/conditionEdits.ts";

/** A modifier's edit form, as its dialog opened on it before its feat was renamed. */
const OPENED = { operator: "add", target: "feats.mightyswing.possessed", value: "{{ [classes.fighter.level] }}" };

describe("a condition's edit, as its dialog sends it", () => {
  test("leaves out its target and its value while they're as the dialog opened on them", () => {
    expect(toConditionEdit({ ...OPENED, operator: "subtract" }, OPENED)).toEqual({ operator: "subtract" });
    expect(toConditionEdit(OPENED, OPENED)).toEqual({ operator: "add" });
  });

  test("sends a target or a value its author changed, each on its own", () => {
    expect(toConditionEdit({ ...OPENED, value: "2" }, OPENED)).toEqual({ operator: "add", value: "2" });
    expect(toConditionEdit({ ...OPENED, target: "skills.climb.misc" }, OPENED)).toEqual({
      operator: "add",
      target: "skills.climb.misc",
    });
  });

  test("keeps a requirement's level, and sends a group's chaining operator alone", () => {
    const opened = { level: "1", operator: "equal", target: "identity.physiology.race.name", value: "Dwarf" };
    expect(toConditionEdit({ ...opened, operator: "not_equal" }, opened)).toEqual({
      level: "1",
      operator: "not_equal",
    });
    // A condition made a group: its form sends no condition
    const group: { chainingOperator?: string; level: string; target?: string } = { level: "1", chainingOperator: "or" };
    expect(toConditionEdit(group, opened)).toEqual({ level: "1", chainingOperator: "or" });
  });
});
