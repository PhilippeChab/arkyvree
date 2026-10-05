import { expect, test } from "bun:test";

import { sortByOptions } from "@/shared/customization/properties.ts";

test("sortByOptions puts values in their options' order, those no option names after them as given", () => {
  const options = ["Verbal", "Somatic", "Material"];
  expect(sortByOptions(["Material", "Chanting", "Verbal", "Dance", "Somatic"], options)).toEqual([
    "Verbal",
    "Somatic",
    "Material",
    "Chanting",
    "Dance",
  ]);
  expect(sortByOptions(["One creature", "You"], null)).toEqual(["One creature", "You"]);
});
