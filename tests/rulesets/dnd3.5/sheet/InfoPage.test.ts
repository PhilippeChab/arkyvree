import { describe, expect, test } from "bun:test";

import { isValidElement, type ReactNode } from "react";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Characters } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import InfoPage from "@/server/rulesets/dnd3.5/sheet/InfoPage.tsx";

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
    const { items } = await Characters.findPage(
      db,
      { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly },
      { limit: 100, page: 1 },
    );
    const detailed = new DetailedCharacter(items.find((c) => c.name === "Bjorn Ironhand")!);
    await detailed.build();
    const { physiology } = detailed.getDetailedCharacterIdentity().getIdentity();
    physiology.height = `5'11"`;
    physiology.weight = "82 kg";

    const text = textOf(InfoPage({ detailedCharacter: detailed }));
    const after = (label: string) => text[text.indexOf(label) + 1];
    expect([after("Height:"), after("Weight:")]).toEqual([`5'11"`, "82 kg"]);
  });
});
