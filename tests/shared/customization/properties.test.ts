import { expect, test } from "bun:test";

import { formatPropertyValues } from "@/shared/customization/properties.ts";

function optionsOf(type: string) {
  return type === "COMPONENT" ? ["Verbal", "Somatic", "Material"] : null;
}

test("formatPropertyValues joins each type's values in its options' order, a value added at the end included", () => {
  expect(formatPropertyValues({ COMPONENT: ["Somatic", "Material", "Verbal"], TARGET: ["You"] }, optionsOf)).toEqual({
    COMPONENT: "Verbal, Somatic, Material",
    TARGET: "You",
  });
});
