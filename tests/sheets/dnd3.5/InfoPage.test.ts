import { describe, expect, test } from "bun:test";

import { isValidElement, type ReactNode } from "react";

import DetailedCharacter from "@/server/rulesets/dnd3.5/character/DetailedCharacter.ts";
import InfoPage from "@/server/sheets/dnd3.5/InfoPage.tsx";
import { buildAs } from "@/tests/support/characters.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";

/** The text a page's element tree shows, its components called, each piece in order. */
function textOf(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (typeof node.type === "function") return textOf((node.type as (props: object) => ReactNode)(node.props));
  return textOf(node.props.children);
}

describe("InfoPage", () => {
  test("shows a height and a weight as the player wrote them, free text without a unit added", async () => {
    const detailed = await buildAs(DetailedCharacter, await findSeededCharacter("Bjorn Ironhand"));
    const { physiology } = detailed.components.identity.getIdentity();
    physiology.height = `5'11"`;
    physiology.weight = "82 kg";

    const text = textOf(InfoPage({ detailedCharacter: detailed }));
    const after = (label: string) => text[text.indexOf(label) + 1];
    expect([after("Height:"), after("Weight:")]).toEqual([`5'11"`, "82 kg"]);
  });
});
