import { expect, test } from "bun:test";
import seedCharacters from "@/database/seeds/characters.ts";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Characters } from "@/server/repositories/index.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";

const seedUsersCharacters = async () =>
  (await Characters.findMany(db, { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 })).items;

test("The test data seeds the seed user's characters, each valid", async () => {
  const before = await seedUsersCharacters();
  await seedCharacters(db);
  const seeded = (await seedUsersCharacters()).filter((character) => !before.some(({ id }) => id === character.id));

  expect(seeded.map((character) => character.name).sort()).toEqual([
    "Aldric Dawnbringer", "Bjorn Ironhand", "Elara Starweaver", "Fenn Ashwalker", "Grak Thunderfist", "Kael Stormborn",
    "Lyra Shadowstep", "Melody Silverveil", "Rowan Thornwalker", "Theron Lightbringer", "Vex Flamecaller", "Zen Whitepetal",
  ]);
  for (const character of seeded) {
    const detailed = new DetailedCharacter(character);
    await detailed.build();
    expect({ name: character.name, validation: detailed.validate() }).toEqual({ name: character.name, validation: { valid: true, issues: [] } });
  }
}, 30_000);
