import { expect, test } from "bun:test";

import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";

const optionsOf = (type: string) => (type === "COMPONENT" ? ["Verbal", "Somatic", "Material"] : null);

test("groupPropertyValues lists a type's values in its options' order, those no option names after them as given", () => {
  const rows = [
    ["COMPONENT", "Material"],
    ["TARGET", "One creature"],
    ["COMPONENT", "Chanting"],
    ["COMPONENT", "Verbal"],
    ["TARGET", "You"],
    ["COMPONENT", "Somatic"],
  ].map(([type, value]) => ({ type, value }));
  expect(groupPropertyValues(rows, optionsOf)).toEqual({
    COMPONENT: ["Verbal", "Somatic", "Material", "Chanting"],
    TARGET: ["One creature", "You"],
  });
});

test("formatPropertyValues joins each type's values in its options' order, a value added at the end included", () => {
  expect(formatPropertyValues({ COMPONENT: ["Somatic", "Material", "Verbal"], TARGET: ["You"] }, optionsOf)).toEqual({
    COMPONENT: "Verbal, Somatic, Material",
    TARGET: "You",
  });
});
