import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { db } from "@/server/database/index.ts";
import { eq } from "drizzle-orm";
import { rulesetExtensionsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import { getSeedContext, addClassLevels, addPowers, SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

/** Narrow a Hono test-client response to its success body, failing if not ok. */
async function jsonOk<T extends Response>(response: T): Promise<T extends { json(): Promise<infer U> } ? Exclude<U, { error: string }> : never> {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(error)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return response.json() as any;
}

describe("character levels", () => {
  const api = testClient<Application>(application);
  const headers = { cookie: "session-id=00000000-0000-4000-8000-000000000123" };

  let seedCtx: SeedContext;

  async function getCtx(): Promise<SeedContext> {
    if (!seedCtx) {
      seedCtx = await getSeedContext(db);
    }
    return seedCtx;
  }

  async function createSeedCharacter(cookie: string): Promise<{ characterId: string; ctx: SeedContext }> {
    const c = await getCtx();

    const abilityScores: Record<string, number> = {
      Strength: 16, Dexterity: 14, Constitution: 14,
      Intelligence: 12, Wisdom: 10, Charisma: 8,
    };
    const abilities: Record<string, number> = {};
    for (const [name, score] of Object.entries(abilityScores)) {
      abilities[c.abilityMap[name]] = score;
    }

    const response = await api.api.characters.$post(
      {
        json: {
          rulesetId: c.rulesetId,
          raceId: c.raceMap.pc["Human"],
          name: `Test Character ${Math.random().toString(36).substr(2, 9)}`,
          xp: 0,
          alignment: "Neutral Good" as const,
          abilities,
          age: 25,
          gender: "Male" as const,
          height: "180",
          weight: "80",
        },
      },
      { headers: { cookie } },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create character: ${error.message}`);
    }

    const character = await response.json();
    return { characterId: character.id, ctx: c };
  }

  // Fighter L1, Human, INT 12: (2+1+1)*4 = 16 skill points, 2 General feats, 1 Fighter Bonus Feat
  function fighterLevel1Picks(c: SeedContext) {
    return {
      skills: {
        [c.skillMap["Climb"]]: 4,
        [c.skillMap["Intimidate"]]: 4,
        [c.skillMap["Jump"]]: 4,
        [c.skillMap["Swim"]]: 4,
      },
      feats: {
        [c.aptMap["General"]]: [c.featMap["Power Attack"], c.featMap["Cleave"]],
        [c.aptMap["Fighter Bonus Feat"]]: [c.featMap["Improved Initiative"]],
      },
      powers: {},
    };
  }

  /**
   * Wraps the finalize endpoint with a single-level plan so call sites
   * stay concise. Returns the HTTP response as-is; the body is an array of
   * created levels, so consumers typically destructure `[level]` from `jsonOk`.
   */
  async function finalizeOneLevelRequest(
    characterId: string,
    params: {
      klassId: string;
      level: number;
      hp: number;
      abilityId: string | null;
      skills: Record<string, number>;
      feats: Record<string, string[]>;
      powers: Record<string, string[]>;
    },
    reqHeaders?: { cookie: string },
  ) {
    const body = {
      param: { characterId },
      json: {
        levels: [{ klassId: params.klassId, level: params.level, hp: params.hp, abilityId: params.abilityId }],
        skills: params.skills,
        feats: params.feats,
        powers: params.powers,
      },
    };
    return reqHeaders
      ? api.api.characters.levels[":characterId"]["finalize"].$post(body, { headers: reqHeaders })
      : api.api.characters.levels[":characterId"]["finalize"].$post(body);
  }

  // Fighter L2 (character level 2): (2+1+1)*1 = 4 skill points, 0 General feats, 1 Fighter Bonus Feat
  function fighterLevel2Picks(c: SeedContext) {
    return {
      skills: {
        [c.skillMap["Climb"]]: 1,
        [c.skillMap["Swim"]]: 1,
        [c.skillMap["Jump"]]: 1,
        [c.skillMap["Intimidate"]]: 1,
      },
      feats: {
        [c.aptMap["Fighter Bonus Feat"]]: [c.featMap["Dodge"]],
      },
      powers: {},
    };
  }

  describe("GET /available-classes", () => {
    test("should return available classes for a character", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["available-classes"].$get(
        { param: { characterId }, query: {} },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get available classes: ${error.message}`);
      }

      const data = await response.json();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThanOrEqual(1);

      const fighter = data.items.find((k) => k.id === c.klassMap.pc["Fighter"]);
      expect(fighter).toBeDefined();
      expect(fighter!.nextLevel).toBe(1);
      expect(fighter!.eligible).toBe(true);
    });

    test("should reject unauthenticated requests", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["available-classes"].$get({
        param: { characterId },
        query: {},
      });

      expect(response.status).toBe(401);
    });

    test("should return 404 for non-existent character", async () => {
      const response = await api.api.characters.levels[":characterId"]["available-classes"].$get(
        { param: { characterId: "00000000-0000-0000-0000-000000000000" }, query: {} },
        { headers },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("level up lifecycle", () => {
    test("should get available classes, finalize level, and check leveled-up attributes", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Step 1: Get available classes
      const classesResponse = await api.api.characters.levels[":characterId"]["available-classes"].$get(
        { param: { characterId }, query: {} },
        { headers },
      );

      if (!classesResponse.ok) {
        const error = await classesResponse.json();
        throw new Error(`Failed to get available classes: ${error.message}`);
      }

      const classes = await classesResponse.json();
      expect(classes.items.length).toBeGreaterThanOrEqual(1);

      const selectedClass = classes.items.find((k) => k.id === classId);
      expect(selectedClass).toBeDefined();

      // Step 2: Finalize level 1 with valid picks
      const picks = fighterLevel1Picks(c);
      const finalizeResponse = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks },
        headers,
      );

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.json();
        throw new Error(`Failed to finalize level: ${error.message}`);
      }

      const [newLevel] = await finalizeResponse.json();
      expect(newLevel).toBeDefined();
      expect(newLevel.characterId).toBe(characterId);
      expect(newLevel.hp).toBe(8);

      // Step 3: Check leveled-up attributes (at level 1, should not be available)
      const attributesResponse = await api.api.characters.levels[":characterId"]["attribute-slots"].$get(
        { param: { characterId }, query: {} },
        { headers },
      );

      if (!attributesResponse.ok) {
        const error = await attributesResponse.json();
        throw new Error(`Failed to get leveled-up attributes: ${error.message}`);
      }

      const attributes = await attributesResponse.json();
      expect(attributes).toBeDefined();
      expect(attributes.isAvailable).toBe(false);

      // Step 4: Verify the class next level incremented
      const classesAfterResponse = await api.api.characters.levels[":characterId"]["available-classes"].$get(
        { param: { characterId }, query: {} },
        { headers },
      );

      if (!classesAfterResponse.ok) {
        const error = await classesAfterResponse.json();
        throw new Error(`Failed to get available classes after level: ${error.message}`);
      }

      const classesAfter = await classesAfterResponse.json();
      const classAfterLevel = classesAfter.items.find((k) => k.id === classId);
      expect(classAfterLevel).toBeDefined();
      expect(classAfterLevel!.nextLevel).toBe(2);
    });

    test("should get leveled-up skills for class and level", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["skill-slots"].$get(
        {
          param: { characterId },
          query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get leveled-up skills: ${error.message}`);
      }

      const data = await response.json();
      expect(data).toBeDefined();
      // Human Fighter L1, INT 12 (+1 mod): (2+1+1)*4 = 16 skill points
      expect(data.skillPointsToSpend).toBe(16);
      expect(data.totalCharacterLevel).toBe(1);
      expect(Array.isArray(data.skills)).toBe(true);
    });

    test("should get leveled-up feats for class and level", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
        {
          param: { characterId },
          query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get leveled-up feats: ${error.message}`);
      }

      const data = await response.json();
      expect(data).toBeDefined();
      // Human Fighter L1: 2 General feats (1 base + 1 human), 1 Fighter Bonus Feat = 3 total
      expect(data.featsToSelect).toBe(3);
      expect(Array.isArray(data.autoGrantedFeats)).toBe(true);
      const generalPool = Object.values(data.aptitudePools).find((p) => p.name === "General");
      expect(generalPool).toBeDefined();
      expect(generalPool!.available).toBe(2);
      const fighterPool = Object.values(data.aptitudePools).find((p) => p.name === "Fighter Bonus Feat");
      expect(fighterPool).toBeDefined();
      expect(fighterPool!.available).toBe(1);
    });

    test("should get leveled-up powers for class and level", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["power-slots"].$get(
        {
          param: { characterId },
          query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get leveled-up powers: ${error.message}`);
      }

      const data = await response.json();
      expect(data).toBeDefined();
      expect(typeof data.powersToSelect).toBe("number");
      expect(Array.isArray(data.autoGrantedPowers)).toBe(true);
      expect(typeof data.aptitudePools).toBe("object");
    });

    test("should finalize multiple levels sequentially", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Level 1
      const picks1 = fighterLevel1Picks(c);
      const level1Response = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks1 },
        headers,
      );
      expect(level1Response.status).toBe(200);

      // Level 2
      const picks2 = fighterLevel2Picks(c);
      const level2Response = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 2, hp: 6, abilityId: null, ...picks2 },
        headers,
      );
      expect(level2Response.status).toBe(200);

      // Verify available classes show next level as 3
      const classesResponse = await api.api.characters.levels[":characterId"]["available-classes"].$get(
        { param: { characterId }, query: {} },
        { headers },
      );

      if (!classesResponse.ok) {
        const error = await classesResponse.json();
        throw new Error(`Failed to get available classes: ${error.message}`);
      }

      const classes = await classesResponse.json();
      const fighter = classes.items.find((k) => k.id === classId);
      expect(fighter).toBeDefined();
      expect(fighter!.nextLevel).toBe(3);
    });
  });

  describe("available feats and powers", () => {
    test("should get available feats", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["available-feats"].$get(
        {
          param: { characterId },
          query: { aptitudeId: c.aptMap["General"], klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get available feats: ${error.message}`);
      }

      const data = await response.json();
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.page).toBe("number");
    });

    test("should get available powers", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["available-powers"].$get(
        {
          param: { characterId },
          query: { aptitudeId: c.aptMap["General"], klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get available powers: ${error.message}`);
      }

      const data = await response.json();
      expect(data).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.page).toBe("number");
    });

    test("should not exclude spells from a different class aptitude (multiclass)", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      // Add a Cleric level with "Detect Magic" picked as a Cleric spell
      const clericLevelIds = await addClassLevels(db, c, characterId, "Cleric", [1], [8]);
      await addPowers(db, c, clericLevelIds, [
        { levelIndex: 0, powerName: "Detect Magic", aptitude: "Cleric Spells" },
      ]);

      // Query available Wizard spells — "Detect Magic" should still be available
      // since it was picked under a different aptitude (Cleric Spells, not Wizard Spells)
      const response = await api.api.characters.levels[":characterId"]["available-powers"].$get(
        {
          param: { characterId },
          query: {
            aptitudeId: c.aptMap["Wizard Spells"],
            klassId: c.klassMap.pc["Wizard"],
            level: "1",
            powerLevel: "0",
            search: "Detect Magic",
          },
        },
        { headers },
      );

      const data = await jsonOk(response);
      const names = data.items.map((p: { name: string }) => p.name);
      expect(names).toContain("Detect Magic");
    });

    test("should not return duplicate spells from sibling extensions", async () => {
      // Create a forked ruleset with extensions enabled (same pattern as aptitudeDedup.test.ts)
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const extLinks = await db.select({ id: rulesetExtensionsInRules.extensionId })
        .from(rulesetExtensionsInRules)
        .where(eq(rulesetExtensionsInRules.rulesetId, fork.rulesetId!));
      if (extLinks.length > 0) {
        await db.update(rulesetsInRules)
          .set({ extensionRulesetIds: extLinks.map((e) => e.id) })
          .where(eq(rulesetsInRules.id, fork.id));
      }
      invalidateRuleset(fork.id);

      const ruleset = (await Rulesets.findOne(db, { id: fork.id }))!;
      expect(ruleset.extensionRulesetIds.length).toBeGreaterThan(0);

      // Create a character on the forked ruleset
      const c = await getCtx();
      const abilityScores: Record<string, number> = {
        Strength: 10, Dexterity: 10, Constitution: 10,
        Intelligence: 16, Wisdom: 16, Charisma: 10,
      };
      const abilities: Record<string, number> = {};
      for (const [name, score] of Object.entries(abilityScores)) {
        abilities[c.abilityMap[name]] = score;
      }
      const charResponse = await api.api.characters.$post(
        {
          json: {
            rulesetId: fork.id,
            raceId: c.raceMap.pc["Human"],
            name: `Dedup Test ${Math.random().toString(36).substr(2, 9)}`,
            xp: 0,
            alignment: "Neutral Good" as const,
            abilities,
            age: 25,
            gender: "Male" as const,
            height: "180",
            weight: "80",
          },
        },
        { headers },
      );
      const character = await jsonOk(charResponse);

      // Fetch all cantrips for Wizard Spells — should have no duplicate names
      const response = await api.api.characters.levels[":characterId"]["available-powers"].$get(
        {
          param: { characterId: character.id },
          query: {
            aptitudeId: c.aptMap["Wizard Spells"],
            klassId: c.klassMap.pc["Wizard"],
            level: "1",
            powerLevel: "0",
            limit: "100",
          },
        },
        { headers },
      );

      const data = await jsonOk(response);
      const names = data.items.map((p: { name: string }) => p.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    test("should exclude spells already picked under the same aptitude", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      // Add a Wizard level with "Detect Magic" picked as a Wizard spell
      const wizardLevelIds = await addClassLevels(db, c, characterId, "Wizard", [1], [4]);
      await addPowers(db, c, wizardLevelIds, [
        { levelIndex: 0, powerName: "Detect Magic", aptitude: "Wizard Spells" },
      ]);

      // Query available Wizard cantrips — "Detect Magic" should NOT appear
      const response = await api.api.characters.levels[":characterId"]["available-powers"].$get(
        {
          param: { characterId },
          query: {
            aptitudeId: c.aptMap["Wizard Spells"],
            klassId: c.klassMap.pc["Wizard"],
            level: "2",
            powerLevel: "0",
            search: "Detect Magic",
          },
        },
        { headers },
      );

      const data = await jsonOk(response);
      const names = data.items.map((p: { name: string }) => p.name);
      expect(names).not.toContain("Detect Magic");
    });

    test("should show spells on extension-specific aptitudes even when another extension copy wins", async () => {
      // Create a forked ruleset with extensions enabled
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const extLinks = await db.select({ id: rulesetExtensionsInRules.extensionId })
        .from(rulesetExtensionsInRules)
        .where(eq(rulesetExtensionsInRules.rulesetId, fork.rulesetId!));
      if (extLinks.length > 0) {
        await db.update(rulesetsInRules)
          .set({ extensionRulesetIds: extLinks.map((e) => e.id) })
          .where(eq(rulesetsInRules.id, fork.id));
      }
      invalidateRuleset(fork.id);

      const ruleset = (await Rulesets.findOne(db, { id: fork.id }))!;
      expect(ruleset.extensionRulesetIds.length).toBeGreaterThan(0);

      // Create a character on the forked ruleset
      const c = await getCtx();
      const abilityScores: Record<string, number> = {
        Strength: 10, Dexterity: 10, Constitution: 10,
        Intelligence: 16, Wisdom: 16, Charisma: 10,
      };
      const abilities: Record<string, number> = {};
      for (const [name, score] of Object.entries(abilityScores)) {
        abilities[c.abilityMap[name]] = score;
      }
      const charResponse = await api.api.characters.$post(
        {
          json: {
            rulesetId: fork.id,
            raceId: c.raceMap.pc["Human"],
            name: `ExtApt Test ${Math.random().toString(36).substr(2, 9)}`,
            xp: 0,
            alignment: "Neutral Good" as const,
            abilities,
            age: 25,
            gender: "Male" as const,
            height: "180",
            weight: "80",
          },
        },
        { headers },
      );
      const character = await jsonOk(charResponse);

      // "Blackguard Spells" is an extension-specific aptitude from Complete Divine.
      // Spells COW'd by multiple extensions should still appear here even if
      // the CD copy is the "loser" — DISTINCT ON keeps the only copy with this link.
      const blackguardApt = c.aptMap["Blackguard Spells"];
      if (blackguardApt) {
        const response = await api.api.characters.levels[":characterId"]["available-powers"].$get(
          {
            param: { characterId: character.id },
            query: {
              aptitudeId: blackguardApt,
              klassId: c.klassMap.pc["Blackguard"] ?? c.klassMap.pc["Wizard"],
              level: "1",
              limit: "100",
            },
          },
          { headers },
        );

        const data = await jsonOk(response);
        // Should have spells and no duplicates
        const names = data.items.map((p: { name: string }) => p.name);
        const uniqueNames = new Set(names);
        expect(names.length).toBe(uniqueNames.size);
        expect(data.items.length).toBeGreaterThan(0);
      }
    });
  });

  describe("authentication", () => {
    test("should reject unauthenticated finalize request", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await finalizeOneLevelRequest(characterId, {
        klassId: c.klassMap.pc["Fighter"],
        level: 1,
        hp: 8,
        abilityId: null,
        skills: {},
        feats: {},
        powers: {},
      });

      expect(response.status).toBe(401);
    });

    test("should reject unauthenticated skill-slots request", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["skill-slots"].$get({
        param: { characterId },
        query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
      });

      expect(response.status).toBe(401);
    });

    test("should reject unauthenticated feat-slots request", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["feat-slots"].$get({
        param: { characterId },
        query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
      });

      expect(response.status).toBe(401);
    });

    test("should reject unauthenticated power-slots request", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["power-slots"].$get({
        param: { characterId },
        query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
      });

      expect(response.status).toBe(401);
    });

    test("should reject unauthenticated delete request", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"].$delete({
        param: { characterId },
      });

      expect(response.status).toBe(401);
    });

    test("should reject unauthenticated attribute-slots request", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"]["attribute-slots"].$get({
        param: { characterId },
        query: {},
      });

      expect(response.status).toBe(401);
    });
  });

  describe("non-existent resources", () => {
    test("should return 404 for non-existent character on skill-slots", async () => {
      const c = await getCtx();

      const response = await api.api.characters.levels[":characterId"]["skill-slots"].$get(
        {
          param: { characterId: "00000000-0000-0000-0000-000000000000" },
          query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should return 404 for non-existent character on finalize", async () => {
      const c = await getCtx();

      const response = await finalizeOneLevelRequest(
        "00000000-0000-0000-0000-000000000000",
        {
          klassId: c.klassMap.pc["Fighter"],
          level: 1,
          hp: 8,
          abilityId: null,
          skills: {},
          feats: {},
          powers: {},
        },
        headers,
      );

      expect(response.status).toBe(404);
    });

    test("should return 404 for non-existent class level on finalize", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);

      const response = await finalizeOneLevelRequest(
        characterId,
        {
          klassId: c.klassMap.pc["Fighter"],
          level: 999,
          hp: 8,
          abilityId: null,
          skills: {},
          feats: {},
          powers: {},
        },
        headers,
      );

      expect(response.status).toBe(404);
    });

    test("should return 404 for non-existent character on feat-slots", async () => {
      const c = await getCtx();

      const response = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
        {
          param: { characterId: "00000000-0000-0000-0000-000000000000" },
          query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should return 404 for non-existent character on power-slots", async () => {
      const c = await getCtx();

      const response = await api.api.characters.levels[":characterId"]["power-slots"].$get(
        {
          param: { characterId: "00000000-0000-0000-0000-000000000000" },
          query: { klassId: c.klassMap.pc["Fighter"], level: "1" },
        },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should return 404 for non-existent character on attribute-slots", async () => {
      const response = await api.api.characters.levels[":characterId"]["attribute-slots"].$get(
        { param: { characterId: "00000000-0000-0000-0000-000000000000" }, query: {} },
        { headers },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("get level", () => {
    test("should return level data with skills, feats, and powers", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Finalize level 1
      const picks = fighterLevel1Picks(c);
      const finalizeResponse = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 7, abilityId: null, ...picks },
        headers,
      );

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.json();
        throw new Error(`Failed to finalize level: ${error.message}`);
      }

      const [newLevel] = await finalizeResponse.json();

      // GET the level
      const response = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: newLevel.id } },
        { headers },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get level: ${error.message}`);
      }

      const data = await response.json();
      expect(data.characterLevelId).toBe(newLevel.id);
      expect(data.klassId).toBe(classId);
      expect(data.level).toBe(1);
      expect(data.hp).toBe(7);
      expect(data.abilityId).toBeNull();

      // Verify skills match what was submitted
      expect(data.skills[c.skillMap["Climb"]]).toBe(4);
      expect(data.skills[c.skillMap["Intimidate"]]).toBe(4);
      expect(data.skills[c.skillMap["Jump"]]).toBe(4);
      expect(data.skills[c.skillMap["Swim"]]).toBe(4);

      // Verify feats are present under their aptitudes
      const generalFeats = data.feats[c.aptMap["General"]];
      expect(generalFeats).toBeDefined();
      expect(generalFeats.length).toBe(2);
      const generalFeatIds = generalFeats.map((f: { id: string }) => f.id);
      expect(generalFeatIds).toContain(c.featMap["Power Attack"]);
      expect(generalFeatIds).toContain(c.featMap["Cleave"]);

      const bonusFeats = data.feats[c.aptMap["Fighter Bonus Feat"]];
      expect(bonusFeats).toBeDefined();
      expect(bonusFeats.length).toBe(1);
      expect(bonusFeats[0].id).toBe(c.featMap["Improved Initiative"]);
    });

    test("should return 404 for non-existent character level", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: "00000000-0000-0000-0000-000000000000" } },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should reject unauthenticated request", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"][":characterLevelId"].$get({
        param: { characterId, characterLevelId: "00000000-0000-0000-0000-000000000000" },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("update level", () => {
    test("should update a level's HP, skills, and feats", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Finalize level 1
      const picks = fighterLevel1Picks(c);
      const finalizeResponse = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks },
        headers,
      );

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.json();
        throw new Error(`Failed to finalize level: ${error.message}`);
      }

      const [newLevel] = await finalizeResponse.json();

      // Update the level with different HP and different skill allocation
      const updateResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: newLevel.id },
          json: {
            hp: 5,
            abilityId: null,
            skills: {
              [c.skillMap["Climb"]]: 3,
              [c.skillMap["Intimidate"]]: 3,
              [c.skillMap["Jump"]]: 4,
              [c.skillMap["Swim"]]: 4,
              [c.skillMap["Handle Animal"]]: 2,
            },
            feats: picks.feats,
            powers: {},
          },
        },
        { headers },
      );

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(`Failed to update level: ${error.message}`);
      }

      expect(updateResponse.status).toBe(200);

      // Verify the update by getting the level
      const getResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: newLevel.id } },
        { headers },
      );

      if (!getResponse.ok) {
        const error = await getResponse.json();
        throw new Error(`Failed to get level: ${error.message}`);
      }

      const data = await getResponse.json();
      expect(data.hp).toBe(5);
      expect(data.skills[c.skillMap["Jump"]]).toBe(4);
      expect(data.skills[c.skillMap["Swim"]]).toBe(4);
      expect(data.skills[c.skillMap["Climb"]]).toBe(3);
      expect(data.skills[c.skillMap["Intimidate"]]).toBe(3);
    });

    test("should reject HP outside hit die range", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Finalize level 1
      const picks = fighterLevel1Picks(c);
      const finalizeResponse = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks },
        headers,
      );

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.json();
        throw new Error(`Failed to finalize level: ${error.message}`);
      }

      const [newLevel] = await finalizeResponse.json();

      // Try to update with HP > hit die (Fighter hd = 10)
      const response = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: newLevel.id },
          json: {
            hp: 11,
            abilityId: null,
            skills: picks.skills,
            feats: picks.feats,
            powers: {},
          },
        },
        { headers },
      );

      expect(response.status).toBe(400);
    });

    test("should return 404 for non-existent character level", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: "00000000-0000-0000-0000-000000000000" },
          json: {
            hp: 5,
            abilityId: null,
            skills: {},
            feats: {},
            powers: {},
          },
        },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should reject unauthenticated request", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"][":characterLevelId"].$put({
        param: { characterId, characterLevelId: "00000000-0000-0000-0000-000000000000" },
        json: {
          hp: 5,
          abilityId: null,
          skills: {},
          feats: {},
          powers: {},
        },
      });

      expect(response.status).toBe(401);
    });

    test("should swap feats when editing a level", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Finalize L1 with Power Attack + Cleave (General), Improved Initiative (Fighter Bonus)
      const picks = fighterLevel1Picks(c);
      const finalizeResponse = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks },
        headers,
      );
      const [level1] = await jsonOk(finalizeResponse);

      // Edit L1: swap Cleave for Toughness (General), swap Improved Initiative for Combat Reflexes (Fighter Bonus)
      const updateResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: level1.id },
          json: {
            hp: 8,
            abilityId: null,
            skills: picks.skills,
            feats: {
              [c.aptMap["General"]]: [c.featMap["Power Attack"], c.featMap["Toughness"]],
              [c.aptMap["Fighter Bonus Feat"]]: [c.featMap["Combat Reflexes"]],
            },
            powers: {},
          },
        },
        { headers },
      );

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(`Failed to update level: ${error.message}`);
      }

      // Verify via GET that old feats are gone and new feats are present
      const getResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: level1.id } },
        { headers },
      );
      const data = await jsonOk(getResponse);
      const generalFeatIds = data.feats[c.aptMap["General"]].map((f: { id: string }) => f.id);
      expect(generalFeatIds).toContain(c.featMap["Power Attack"]);
      expect(generalFeatIds).toContain(c.featMap["Toughness"]);
      expect(generalFeatIds).not.toContain(c.featMap["Cleave"]);

      const bonusFeatIds = data.feats[c.aptMap["Fighter Bonus Feat"]].map((f: { id: string }) => f.id);
      expect(bonusFeatIds).toContain(c.featMap["Combat Reflexes"]);
      expect(bonusFeatIds).not.toContain(c.featMap["Improved Initiative"]);
    });

    test("should edit a non-last level without breaking later levels", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Finalize L1 and L2
      const picks1 = fighterLevel1Picks(c);
      const l1Response = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks1 },
        headers,
      );
      const [level1] = await jsonOk(l1Response);

      const picks2 = fighterLevel2Picks(c);
      const l2Response = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 2, hp: 6, abilityId: null, ...picks2 },
        headers,
      );
      const [level2] = await jsonOk(l2Response);

      // Edit L1: change skill allocation (shift points from Climb to Swim)
      const editResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: level1.id },
          json: {
            hp: 7,
            abilityId: null,
            skills: {
              [c.skillMap["Climb"]]: 2,
              [c.skillMap["Intimidate"]]: 4,
              [c.skillMap["Jump"]]: 4,
              [c.skillMap["Swim"]]: 4,
              [c.skillMap["Handle Animal"]]: 2,
            },
            feats: picks1.feats,
            powers: {},
          },
        },
        { headers },
      );

      if (!editResponse.ok) {
        const error = await editResponse.json();
        throw new Error(`Failed to edit level 1: ${error.message}`);
      }

      // Verify L1 has updated data
      const l1Get = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: level1.id } },
        { headers },
      );
      const l1Data = await jsonOk(l1Get);
      expect(l1Data.hp).toBe(7);
      expect(l1Data.skills[c.skillMap["Climb"]]).toBe(2);
      expect(l1Data.skills[c.skillMap["Swim"]]).toBe(4);

      // Verify L2 is still intact
      const l2Get = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: level2.id } },
        { headers },
      );
      const l2Data = await jsonOk(l2Get);
      expect(l2Data.hp).toBe(6);
      expect(l2Data.skills[c.skillMap["Climb"]]).toBe(1);
      const l2BonusFeatIds = l2Data.feats[c.aptMap["Fighter Bonus Feat"]].map((f: { id: string }) => f.id);
      expect(l2BonusFeatIds).toContain(c.featMap["Dodge"]);
    });

    test("should return scoped feat pools when editing with characterLevelId", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Finalize L1 and L2
      const picks1 = fighterLevel1Picks(c);
      const l1Response = await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks1 },
        headers,
      );
      const [level1] = await jsonOk(l1Response);

      const picks2 = fighterLevel2Picks(c);
      await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 2, hp: 6, abilityId: null, ...picks2 },
        headers,
      );

      // Query feat pools WITH characterLevelId (edit mode) — scoped to L1's baseline
      const editModeResponse = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
        {
          param: { characterId },
          query: {
            klassId: classId,
            level: "1",
            characterLevelId: level1.id,
          },
        },
        { headers },
      );
      const editModeData = await jsonOk(editModeResponse);

      // Edit mode should give back L1's slots so the user can re-fill them
      // L1 had 2 General feats and 1 Fighter Bonus Feat — edit scoping frees those slots
      const editGeneralPool = Object.values(editModeData.aptitudePools).find((p: { name: string }) => p.name === "General");
      expect(editGeneralPool).toBeDefined();
      expect(editGeneralPool!.available).toBeGreaterThan(0);
      const editFighterPool = Object.values(editModeData.aptitudePools).find((p: { name: string }) => p.name === "Fighter Bonus Feat");
      expect(editFighterPool).toBeDefined();
      expect(editFighterPool!.available).toBe(1);

      // Query WITHOUT characterLevelId for the same level — pools include L1's picks as spent
      const unscopedResponse = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
        {
          param: { characterId },
          query: { klassId: classId, level: "1" },
        },
        { headers },
      );
      const unscopedData = await jsonOk(unscopedResponse);
      const unscopedGeneralPool = Object.values(unscopedData.aptitudePools).find((p: { name: string }) => p.name === "General");
      expect(unscopedGeneralPool).toBeDefined();

      // The unscoped query counts L1's picks as spent, so it has fewer available slots
      expect(editGeneralPool!.spent).toBeLessThan(unscopedGeneralPool!.spent);
    });

    test("Ranger L2 edit should show Combat Style pool, L1 should not", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const rangerId = c.klassMap.pc["Ranger"];

      // Ranger L1 Human: 2 General feats (1 base + 1 Human bonus), Track auto-granted free
      // Skills: (6+1+1)*4 = 32 points
      const rangerL1Skills = {
        [c.skillMap["Hide"]]: 4,
        [c.skillMap["Move Silently"]]: 4,
        [c.skillMap["Listen"]]: 4,
        [c.skillMap["Spot"]]: 4,
        [c.skillMap["Survival"]]: 4,
        [c.skillMap["Search"]]: 4,
        [c.skillMap["Knowledge (Nature)"]]: 4,
        [c.skillMap["Climb"]]: 4,
      };

      const l1Response = await finalizeOneLevelRequest(
        characterId,
        {
          klassId: rangerId,
          level: 1,
          hp: 8,
          abilityId: null,
          skills: rangerL1Skills,
          feats: {
            [c.aptMap["General"]]: [c.featMap["Point Blank Shot"], c.featMap["Toughness"]],
            [c.aptMap["Favored Enemy"]]: [c.featMap["Favored Enemy: Humanoid (Goblinoid)"]],
          },
          powers: {},
        },
        headers,
      );

      const [level1] = await jsonOk(l1Response);

      // Ranger L2: 0 General feats, 1 Ranger Combat Style pick
      // Skills: (6+1+1)*1 = 8 points
      const rangerL2Skills = {
        [c.skillMap["Hide"]]: 1,
        [c.skillMap["Move Silently"]]: 1,
        [c.skillMap["Listen"]]: 1,
        [c.skillMap["Spot"]]: 1,
        [c.skillMap["Survival"]]: 1,
        [c.skillMap["Climb"]]: 1,
        [c.skillMap["Swim"]]: 1,
        [c.skillMap["Search"]]: 1,
      };

      const l2Response = await finalizeOneLevelRequest(
        characterId,
        {
          klassId: rangerId,
          level: 2,
          hp: 7,
          abilityId: null,
          skills: rangerL2Skills,
          feats: {
            [c.aptMap["Ranger Combat Style (2nd)"]]: [c.featMap["Rapid Shot"]],
          },
          powers: {},
        },
        headers,
      );

      const [level2] = await jsonOk(l2Response);

      // Editing L2: should show Ranger Combat Style pool
      const l2FeatsResponse = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
        {
          param: { characterId },
          query: { klassId: rangerId, level: "2", characterLevelId: level2.id },
        },
        { headers },
      );
      const l2FeatsData = await jsonOk(l2FeatsResponse);
      const combatStylePool = Object.values(l2FeatsData.aptitudePools).find(
        (p: { name: string }) => p.name === "Ranger Combat Style (2nd)",
      );
      expect(combatStylePool).toBeDefined();
      expect(combatStylePool!.available).toBeGreaterThan(0);

      // Editing L1: should NOT show Ranger Combat Style pool
      const l1FeatsResponse = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
        {
          param: { characterId },
          query: { klassId: rangerId, level: "1", characterLevelId: level1.id },
        },
        { headers },
      );
      const l1FeatsData = await jsonOk(l1FeatsResponse);
      const l1CombatStylePool = Object.values(l1FeatsData.aptitudePools).find(
        (p: { name: string }) => p.name === "Ranger Combat Style (2nd)",
      );
      // L1 should have no Combat Style pool (or it should have 0 available)
      if (l1CombatStylePool) {
        expect(l1CombatStylePool.available).toBe(0);
      }

      // Edit L2: re-submit with same Archery pick but different HP
      const editResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: level2.id },
          json: {
            hp: 5,
            abilityId: null,
            skills: rangerL2Skills,
            feats: {
              [c.aptMap["Ranger Combat Style (2nd)"]]: [c.featMap["Rapid Shot"]],
            },
            powers: {},
          },
        },
        { headers },
      );

      if (!editResponse.ok) {
        const error = await editResponse.json();
        throw new Error(`Failed to edit Ranger L2: ${error.message}`);
      }

      // Verify the edit: HP changed, Combat Style pick preserved
      const l2Get = await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
        { param: { characterId, characterLevelId: level2.id } },
        { headers },
      );
      const l2Data = await jsonOk(l2Get);
      expect(l2Data.hp).toBe(5);
      const combatStyleFeats = l2Data.feats[c.aptMap["Ranger Combat Style (2nd)"]];
      expect(combatStyleFeats).toBeDefined();
      expect(combatStyleFeats.length).toBe(1);
      expect(combatStyleFeats[0].id).toBe(c.featMap["Rapid Shot"]);
    });

    test("batch-added levels return character-wide pool counts and survive editing the middle one", async () => {
      // Regression: batch finalize → edit middle level. Edit-slot endpoints
      // exclude only the level being edited (matching updateLevel's
      // projection), so pool counts reflect character-wide totals minus
      // what's already allocated at the other levels.
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Batch-finalize Fighter L1+L2+L3 in a single call (same shape as the
      // batch-add wizard). Slot grants per character level:
      //   General: L1=2 (1 base + 1 Human), L2=0, L3=1 (per-3-char-levels) = 3 total
      //   Fighter Bonus Feat: L1=1, L2=1, L3=0 (only odd levels after L1) = 2 total
      //   Skills: 16 + 4 + 4 = 24 points.
      const batchResponse = await api.api.characters.levels[":characterId"]["finalize"].$post(
        {
          param: { characterId },
          json: {
            levels: [
              { klassId: classId, level: 1, hp: 8, abilityId: null },
              { klassId: classId, level: 2, hp: 6, abilityId: null },
              { klassId: classId, level: 3, hp: 6, abilityId: null },
            ],
            skills: {
              [c.skillMap["Climb"]]: 6,
              [c.skillMap["Jump"]]: 6,
              [c.skillMap["Swim"]]: 6,
              [c.skillMap["Intimidate"]]: 6,
            },
            feats: {
              [c.aptMap["General"]]: [
                c.featMap["Power Attack"],
                c.featMap["Cleave"],
                c.featMap["Toughness"],
              ],
              [c.aptMap["Fighter Bonus Feat"]]: [
                c.featMap["Improved Initiative"],
                c.featMap["Dodge"],
              ],
            },
            powers: {},
          },
        },
        { headers },
      );
      const created = await jsonOk(batchResponse);
      expect(created).toHaveLength(3);
      const [l1, l2, l3] = created;

      // Each character level's edit-mode feat-slots query should return
      // exactly the slots that level grants on its own — not the cumulative
      // pool, not zero.
      async function editFeatSlots(level: number, characterLevelId: string) {
        const resp = await api.api.characters.levels[":characterId"]["feat-slots"].$get(
          {
            param: { characterId },
            query: { klassId: classId, level: String(level), characterLevelId },
          },
          { headers },
        );
        return jsonOk(resp);
      }

      const l1Slots = await editFeatSlots(1, l1.id);
      const l2Slots = await editFeatSlots(2, l2.id);
      const l3Slots = await editFeatSlots(3, l3.id);

      // Total character-wide: General allowed=3 (1 base + 1 Human at char L1,
      // +1 at char L3); Fighter Bonus Feat allowed=2 (Fighter L1, L2).
      // `available` = total − spent at non-edited levels.
      const generalOf = (slots: typeof l1Slots) =>
        Object.values(slots.aptitudePools).find((p) => p.name === "General");
      const bonusOf = (slots: typeof l1Slots) =>
        Object.values(slots.aptitudePools).find((p) => p.name === "Fighter Bonus Feat");

      // L1 saved: 2 general (Power Attack, Cleave), 1 Fighter Bonus (Improved Initiative).
      // L2 saved: 0 general, 1 Fighter Bonus (Dodge). L3 saved: 1 general (Toughness), 0 Fighter Bonus.
      expect(generalOf(l1Slots)?.allowed).toBe(3);
      expect(generalOf(l1Slots)?.available).toBe(2); // 3 − 1 (Toughness@L3)
      expect(bonusOf(l1Slots)?.allowed).toBe(2);
      expect(bonusOf(l1Slots)?.available).toBe(1); // 2 − 1 (Dodge@L2)

      expect(generalOf(l2Slots)?.allowed).toBe(3);
      expect(generalOf(l2Slots)?.available).toBe(0); // 3 − 3 (L1's 2 + L3's 1)
      expect(bonusOf(l2Slots)?.allowed).toBe(2);
      expect(bonusOf(l2Slots)?.available).toBe(1); // 2 − 1 (Improved Initiative@L1)

      expect(generalOf(l3Slots)?.allowed).toBe(3);
      expect(generalOf(l3Slots)?.available).toBe(1); // 3 − 2 (L1's 2)
      expect(bonusOf(l3Slots)?.allowed).toBe(2);
      expect(bonusOf(l3Slots)?.available).toBe(0); // 2 − 2 (L1 + L2)

      // Edit the middle level and verify L1 + L3 stay intact.
      const editResponse = await api.api.characters.levels[":characterId"][":characterLevelId"].$put(
        {
          param: { characterId, characterLevelId: l2.id },
          json: {
            hp: 4,
            abilityId: null,
            skills: {
              [c.skillMap["Listen"]]: 1,
              [c.skillMap["Spot"]]: 1,
              [c.skillMap["Climb"]]: 1,
              [c.skillMap["Swim"]]: 1,
            },
            feats: {
              [c.aptMap["Fighter Bonus Feat"]]: [c.featMap["Combat Reflexes"]],
            },
            powers: {},
          },
        },
        { headers },
      );
      if (!editResponse.ok) {
        const error = await editResponse.json();
        throw new Error(`Edit middle level failed: ${error.message}`);
      }

      const refetch = async (id: string) =>
        jsonOk(await api.api.characters.levels[":characterId"][":characterLevelId"].$get(
          { param: { characterId, characterLevelId: id } },
          { headers },
        ));

      const l2After = await refetch(l2.id);
      expect(l2After.hp).toBe(4);
      const l2BonusFeats = l2After.feats[c.aptMap["Fighter Bonus Feat"]].map((f: { id: string }) => f.id);
      expect(l2BonusFeats).toEqual([c.featMap["Combat Reflexes"]]);

      const l1After = await refetch(l1.id);
      expect(l1After.hp).toBe(8);
      const l1BonusFeats = l1After.feats[c.aptMap["Fighter Bonus Feat"]].map((f: { id: string }) => f.id);
      expect(l1BonusFeats).toContain(c.featMap["Improved Initiative"]);

      const l3After = await refetch(l3.id);
      expect(l3After.hp).toBe(6);
      // L3 has no Fighter Bonus Feat slot, so the third General pick lands here.
      const l3General2 = l3After.feats[c.aptMap["General"]].map((f: { id: string }) => f.id);
      expect(l3General2).toContain(c.featMap["Toughness"]);
    });
  });

  describe("remove level", () => {
    test("should remove the last level from a character", async () => {
      const { characterId, ctx: c } = await createSeedCharacter(headers.cookie);
      const classId = c.klassMap.pc["Fighter"];

      // Add two levels with valid picks
      const picks1 = fighterLevel1Picks(c);
      await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 1, hp: 8, abilityId: null, ...picks1 },
        headers,
      );

      const picks2 = fighterLevel2Picks(c);
      await finalizeOneLevelRequest(
        characterId,
        { klassId: classId, level: 2, hp: 6, abilityId: null, ...picks2 },
        headers,
      );

      // Remove the last level
      const deleteResponse = await api.api.characters.levels[":characterId"].$delete(
        { param: { characterId } },
        { headers },
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(`Failed to remove level: ${error.message}`);
      }

      const deleteResult = await deleteResponse.json();
      expect(deleteResult.success).toBe(true);

      // Verify class now shows next level as 2 (was 3 before removal)
      const classesResponse = await api.api.characters.levels[":characterId"]["available-classes"].$get(
        { param: { characterId }, query: {} },
        { headers },
      );

      if (!classesResponse.ok) {
        const error = await classesResponse.json();
        throw new Error(`Failed to get available classes: ${error.message}`);
      }

      const classes = await classesResponse.json();
      const fighter = classes.items.find((k) => k.id === classId);
      expect(fighter).toBeDefined();
      expect(fighter!.nextLevel).toBe(2);
    });

    test("should return 404 when removing level from character with no levels", async () => {
      const { characterId } = await createSeedCharacter(headers.cookie);

      const response = await api.api.characters.levels[":characterId"].$delete(
        { param: { characterId } },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should return 404 when removing level for non-existent character", async () => {
      const response = await api.api.characters.levels[":characterId"].$delete(
        { param: { characterId: "00000000-0000-0000-0000-000000000000" } },
        { headers },
      );

      expect(response.status).toBe(404);
    });
  });
});
