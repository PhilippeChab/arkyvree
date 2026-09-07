import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { db } from "@/server/database/index.ts";
import { Items } from "@/server/repositories/index.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("inventory router", () => {
  const api = testClient<Application>(application);
  const headers = { cookie: "session-id=00000000-0000-4000-8000-000000000123" };

  async function getCharacterAndItem() {
    // Get a character via the seeded user
    const listRes = await api.api.characters.$get({ query: {} }, { headers });
    const characters = await listRes.json() as { items: Array<{ id: string }> };
    const characterId = characters.items[0].id;

    // Get its rulesetId from the detail endpoint
    const detailRes = await api.api.characters[":id"].$get(
      { param: { id: characterId } },
      { headers },
    );
    const character = await detailRes.json() as { rulesetId: string };

    // Create an item directly in the DB (avoids ruleset ownership issues)
    const items = await Items.create(db, {
      rulesetId: character.rulesetId,
      name: `Test Item ${Math.random().toString(36).substr(2, 9)}`,
      description: "Test item for inventory",
      weight: "5",
      costGp: "10",
    });
    // Raw DB writes bypass the service invalidation path; invalidate so the
    // next read picks up the new item via the composed cache.
    invalidateRuleset(character.rulesetId);

    return { characterId, itemId: items[0].id };
  }

  describe("GET /api/characters/inventory/:characterId", () => {
    test("should return inventory for character", async () => {
      const { characterId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"].$get(
        { param: { characterId } },
        { headers },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("should reject unauthenticated requests", async () => {
      const { characterId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"].$get({
        param: { characterId },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/characters/inventory/:characterId", () => {
    test("should add item to inventory", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"].$post(
        {
          param: { characterId },
          json: { itemId, quantity: 5, equipped: false, location: null, totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      const data = await response.json();
      expect(data.quantity).toBe(5);
      expect(data.equipped).toBe(false);
    });

    test("should add equipped item with location", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"].$post(
        {
          param: { characterId },
          json: { itemId, quantity: 1, equipped: true, location: "Trinket", totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      const data = await response.json();
      expect(data.equipped).toBe(true);
      expect(data.location).toBe("Trinket");
    });

    test("should add item with charges", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"].$post(
        {
          param: { characterId },
          json: { itemId, quantity: 1, equipped: false, location: null, totalCharges: 50, remainingCharges: 50 },
        },
        { headers },
      );

      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      const data = await response.json();
      expect(data.totalCharges).toBe(50);
      expect(data.remainingCharges).toBe(50);
    });

    test("should reject duplicate item", async () => {
      const { characterId, itemId } = await getCharacterAndItem();
      const body = { itemId, quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null } as const;

      await api.api.characters.inventory[":characterId"].$post(
        { param: { characterId }, json: body },
        { headers },
      );

      const response = await api.api.characters.inventory[":characterId"].$post(
        { param: { characterId }, json: body },
        { headers },
      );

      expect(response.status).toBe(400);
    });

    test("should reject unauthenticated requests", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"].$post({
        param: { characterId },
        json: { itemId, quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/characters/inventory/:characterId/:itemId", () => {
    test("should update inventory item", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      await api.api.characters.inventory[":characterId"].$post(
        {
          param: { characterId },
          json: { itemId, quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      const response = await api.api.characters.inventory[":characterId"][":itemId"].$put(
        {
          param: { characterId, itemId },
          json: { quantity: 10, equipped: true, location: "Trinket", totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      const data = await response.json();
      expect(data.quantity).toBe(10);
      expect(data.equipped).toBe(true);
      expect(data.location).toBe("Trinket");
    });

    test("should return 404 for item not in inventory", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"][":itemId"].$put(
        {
          param: { characterId, itemId },
          json: { quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should reject unauthenticated requests", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"][":itemId"].$put({
        param: { characterId, itemId },
        json: { quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/characters/inventory/:characterId/:itemId", () => {
    test("should remove item from inventory", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      await api.api.characters.inventory[":characterId"].$post(
        {
          param: { characterId },
          json: { itemId, quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      const response = await api.api.characters.inventory[":characterId"][":itemId"].$delete(
        { param: { characterId, itemId } },
        { headers },
      );

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    test("should return 404 for item not in inventory", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"][":itemId"].$delete(
        { param: { characterId, itemId } },
        { headers },
      );

      expect(response.status).toBe(404);
    });

    test("should reject unauthenticated requests", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      const response = await api.api.characters.inventory[":characterId"][":itemId"].$delete({
        param: { characterId, itemId },
      });

      expect(response.status).toBe(401);
    });

    test("should not return removed item in subsequent GET", async () => {
      const { characterId, itemId } = await getCharacterAndItem();

      await api.api.characters.inventory[":characterId"].$post(
        {
          param: { characterId },
          json: { itemId, quantity: 1, equipped: false, location: null, totalCharges: null, remainingCharges: null },
        },
        { headers },
      );

      await api.api.characters.inventory[":characterId"][":itemId"].$delete(
        { param: { characterId, itemId } },
        { headers },
      );

      const getResponse = await api.api.characters.inventory[":characterId"].$get(
        { param: { characterId } },
        { headers },
      );

      expect(getResponse.status).toBe(200);
      const data = await getResponse.json();
      const found = (data as Array<{ itemId: string }>).find((e) => e.itemId === itemId);
      expect(found).toBeUndefined();
    });
  });
});
