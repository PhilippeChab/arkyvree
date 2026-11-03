import { describe, expect, test } from "bun:test";

import { withRulesetScopes } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { describeCharacterCards } from "@/server/services/characters/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("describeCharacterCards", () => {
  test("describes each character in its ruleset's view, and one whose ruleset it didn't read as unknown", async () => {
    const { user } = await createTestUser();
    const [read, unread] = [await createTestCharacter(user.id), await createTestCharacter(user.id)];

    const cards = await withRulesetScopes(db, [read.rulesetId], async (views) =>
      describeCharacterCards(views, [read, { ...unread, rulesetId: crypto.randomUUID() }], [], new Set()),
    );
    expect(cards.get(read.id)).toEqual({
      id: read.id,
      name: read.name,
      description: read.description,
      chips: [{ label: "Human", partial: true, tone: "secondary" }],
    });
    expect(cards.get(unread.id)).toEqual({
      id: unread.id,
      name: unread.name,
      description: unread.description,
      chips: [{ label: "Unknown", partial: true, tone: "secondary" }],
    });
  });

  test("describes a partly seen character, read or not, with its name and no description", async () => {
    const { user } = await createTestUser();
    const description = "A scar runs down her left cheek";
    const [read, unread] = [
      await createTestCharacter(user.id, { description }),
      await createTestCharacter(user.id, { description }),
    ];

    const cards = await withRulesetScopes(db, [read.rulesetId], async (views) =>
      describeCharacterCards(
        views,
        [read, { ...unread, rulesetId: crypto.randomUUID() }],
        [],
        new Set([read.id, unread.id]),
      ),
    );
    for (const character of [read, unread])
      expect(cards.get(character.id)).toMatchObject({ id: character.id, name: character.name, description: null });
  });
});
