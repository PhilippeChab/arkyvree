import { describe, expect, test } from "bun:test";

import { addClassLevels, addFeats, addPowers } from "@/database/seeds/seedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/character/DetailedCharacter.ts";
import { refreshEntityData } from "@/server/rulesets/dnd3.5/loading/refreshEntityData.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { createSeedCharacter } from "@/tests/support/levelFixtures.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

describe("refreshEntityData", () => {
  const rows = [
    { id: "a", name: "old", description: "old", stackable: false },
    { id: "b", name: "kept", description: "kept", stackable: false },
  ];

  test("refreshes the given fields of the rows it has data for", () => {
    const reference = [{ id: "a", name: "new", description: "new", stackable: true }];
    expect(refreshEntityData(rows, reference, ["description"])).toEqual([{ ...rows[0], description: "new" }, rows[1]]);
  });

  test.each<[string, { id: string; name: string }[], "name"[]]>([
    ["no data", [], ["name"]],
    ["no fields", [{ id: "a", name: "new" }], []],
    ["data for other rows only", [{ id: "c", name: "new" }], ["name"]],
  ])("leaves the rows as they are with %s", (_, reference, keys) => {
    expect(refreshEntityData(rows, reference, keys)).toEqual(rows);
  });
});

// A level picks the inherited feat or spell by its id: the sheet must show the fork's copy of it all the same.
describe("A fork's own description of an inherited", () => {
  test.each([["feat", "fighter", "Fighter", 10] as const, ["spell", "wizard", "Wizard", 4] as const])(
    "%s is on the sheet",
    async (kind, build, klass, hp) => {
      const session = makeSession();
      const fork = await createSeededTestRuleset(session.userId);
      const ctx = await getSeedCtx();
      const forkCtx = { ...ctx, rulesetId: fork.id };
      const description = `Overridden in the fork ${fork.id}`;
      const name = kind === "feat" ? "Toughness" : "Magic Missile";
      if (kind === "feat") await FeatsService.updateFeat(session, fork.id, ctx.featMap[name], { name, description });
      else await PowersService.updatePower(session, fork.id, ctx.powerMap[name], { name, description });

      const characterId = await createSeedCharacter(ctx, build, { rulesetId: fork.id });
      const levelIds = await addClassLevels(db, forkCtx, characterId, klass, [1], [hp]);
      if (kind === "feat")
        await addFeats(db, forkCtx, levelIds, [{ levelIndex: 0, featName: name, aptitude: "General" }]);
      else await addPowers(db, forkCtx, levelIds, [{ levelIndex: 0, powerName: name, aptitude: "Wizard Spells" }]);

      const character = new DetailedCharacter((await Characters.findOne(db, { id: characterId }))!);
      await character.build();
      const levels = Object.values(character.getDetailedCharacterClasses().getCharacterClasses()).flatMap(
        (k) => k.levels,
      );
      const descriptions = new Map(
        levels.flatMap((level) => [...level.feats, ...level.powers]).map((entity) => [entity.name, entity.description]),
      );
      expect(descriptions.get(name)).toBe(description);
    },
  );
});
