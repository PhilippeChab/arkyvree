import { expect, test } from "bun:test";

import { formatFieldName, formatFieldValues } from "@/shared/customization/fields.ts";

function optionsOf(field: string) {
  return field === "COMPONENT" ? ["Verbal", "Somatic", "Material"] : null;
}

test("formatFieldValues joins each field's values in its options' order, a value added at the end included", () => {
  expect(formatFieldValues({ COMPONENT: ["Somatic", "Material", "Verbal"], TARGET: ["You"] }, optionsOf)).toEqual({
    COMPONENT: "Verbal, Somatic, Material",
    TARGET: "You",
  });
});

test("formatFieldName labels a field from its constant's name", () => {
  expect(formatFieldName("CHARM_SCHOOL")).toBe("Charm School");
  expect(formatFieldName("PERK_FAMILY")).toBe("Perk Family");
});
