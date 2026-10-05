import { expect, test } from "bun:test";

import { formatPropertyValues } from "@/shared/customization/properties.ts";

test("formatPropertyValues joins a type's values in its options' order, those no option names after them as given", () => {
  const optionsOf = (type: string) => (type === "COMPONENT" ? ["Verbal", "Somatic", "Material"] : null);
  const rows = [
    ["COMPONENT", "Material"],
    ["TARGET", "One creature"],
    ["COMPONENT", "Chanting"],
    ["COMPONENT", "Verbal"],
    ["TARGET", "You"],
    ["COMPONENT", "Somatic"],
  ].map(([type, value]) => ({ type, value }));
  expect(formatPropertyValues(rows, optionsOf)).toEqual({
    COMPONENT: "Verbal, Somatic, Material, Chanting",
    TARGET: "One creature, You",
  });
});
