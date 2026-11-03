import { describe, expect, test } from "bun:test";

import { templateOptions } from "@/client/src/pages/rulesets/components/forms/templateOptions.ts";

const TOOL_TEMPLATES = [
  { id: "club", name: "Club" },
  { id: "dagger", name: "Dagger" },
];

describe("an item's template select", () => {
  test("offers no template until its type's load", () => {
    expect(templateOptions(undefined, "ring", "Ring of Blades")).toEqual([]);
  });

  test.each([undefined, "", "dagger"])("offers its type's templates while it holds %p", (held) => {
    expect(templateOptions(TOOL_TEMPLATES, held, "Dagger")).toEqual([
      { value: "club", label: "Club" },
      { value: "dagger", label: "Dagger" },
    ]);
  });

  test("shows a held template of another type, which can't be picked again", () => {
    expect(templateOptions(TOOL_TEMPLATES, "ring", "Ring of Blades").at(-1)).toEqual({
      value: "ring",
      label: "Ring of Blades (of another type)",
      disabled: true,
    });
    expect(templateOptions([], "lost", undefined)).toEqual([
      { value: "lost", label: "Template (of another type)", disabled: true },
    ]);
  });
});
