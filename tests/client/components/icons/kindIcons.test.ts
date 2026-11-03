import { expect, test } from "bun:test";

import { EntityIcon, kindIcon } from "@/client/src/components/icons/index.ts";
import { Engine } from "@/engine/index.ts";

test("every kind a module describes shows its own picture, and a name the client doesn't know a generic one", () => {
  for (const rules of Object.values(Engine.rules().describeAll()))
    for (const kind of rules.kinds) expect(kindIcon(kind.icon)).not.toBe(EntityIcon);
  expect(kindIcon("unknown")).toBe(EntityIcon);
});
