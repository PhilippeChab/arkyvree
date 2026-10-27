import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const BONUS = { target: "abilities.strength.misc", value: "2", operator: "add" };

describe("CharacterModifiersService", () => {
  test("changes a character's own modifier alone: another's is not found", async () => {
    const { user, session } = await createTestUser();
    const character = await createTestCharacter(user.id);
    const other = await createTestCharacter(user.id);
    const modifier = await CharacterModifiersService.createModifier(session, character.id, BONUS);

    for (const [characterId, modifierId] of [
      [other.id, modifier.id],
      [character.id, NIL_UUID],
    ]) {
      expect(CharacterModifiersService.updateModifier(session, characterId, modifierId, BONUS)).rejects.toThrow(
        NotFoundError,
      );
      expect(CharacterModifiersService.deleteModifier(session, characterId, modifierId)).rejects.toThrow(NotFoundError);
    }

    const updated = await CharacterModifiersService.updateModifier(session, character.id, modifier.id, {
      ...BONUS,
      value: "3",
    });
    expect(updated).toMatchObject({ id: modifier.id, value: "3" });
    expect((await CharacterModifiersService.deleteModifier(session, character.id, modifier.id)).id).toBe(modifier.id);
  });
});
