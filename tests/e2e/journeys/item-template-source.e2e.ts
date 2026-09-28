import type { InferResponseType } from "hono/client";
import type { rpc } from "@/client/src/services/rpc.ts";
import { test, expect } from "@/tests/e2e/fixtures.ts";
import { forkCoreRuleset, signIn } from "@/tests/e2e/helpers.ts";

type Templates = InferResponseType<(typeof rpc.api.rulesets)[":id"]["templates"]["$get"], 200>;
type EditedItem = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"][":itemId"]["$put"], 200>;
type DuplicatedItem = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"][":itemId"]["duplicate"]["$post"], 200>;

for (const width of [375, 1280]) {
  test.describe(`Item template editor at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("templates stay editable without a source selector, while variants retain it", async ({ page, ownerUser }) => {
      await signIn(page, ownerUser.email, ownerUser.password);
      const forkId = await forkCoreRuleset(page, `Template source ${width} ${Date.now()}`);

      const templatesResponse = await page.request.get(`/api/rulesets/${forkId}/templates?type=Weapon`);
      expect(templatesResponse.ok()).toBe(true);
      const templates: Templates = await templatesResponse.json();
      const mace = templates.find((item) => item.name === "Heavy Mace");
      if (!mace) throw new Error("Heavy Mace seed template not found");

      await page.goto(`/rulesets/${forkId}/items/${mace.id}/customization`);
      await expect(page.locator('input[name="name"]')).toHaveValue("Heavy Mace");
      await expect(page.getByText("Weapon Template", { exact: true })).toHaveCount(0);
      await page.locator('textarea[name="description"]').fill("Homebrew heavy mace template");
      const saved = page.waitForResponse((response) =>
        response.url().includes(`/api/rulesets/${forkId}/items/`)
        && response.request().method() === "PUT",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saveResponse = await saved;
      expect(saveResponse.ok()).toBe(true);
      const edited: EditedItem = await saveResponse.json();
      expect(edited.isTemplate).toBe(true);
      expect(edited.sourceItemId).toBeNull();
      expect(edited.description).toBe("Homebrew heavy mace template");

      await page.reload();
      await expect(page.locator('textarea[name="description"]')).toHaveValue("Homebrew heavy mace template");
      await expect(page.getByText("Weapon Template", { exact: true })).toHaveCount(0);

      const duplicateResponse = await page.request.post(`/api/rulesets/${forkId}/items/${edited.id}/duplicate`, {
        data: { name: "Heavy Mace +3", type: "Weapon" },
      });
      expect(duplicateResponse.ok()).toBe(true);
      const copy: DuplicatedItem = await duplicateResponse.json();
      expect(copy.isTemplate).toBe(false);
      expect(copy.sourceItemId).toBe(edited.id);

      await page.goto(`/rulesets/${forkId}/items/${copy.id}/customization`);
      await expect(page.locator('input[name="name"]')).toHaveValue("Heavy Mace +3");
      await expect(page.getByRole("combobox", { name: "Weapon Template" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Weapon Template" })).toHaveText("Heavy Mace");
    });
  });
}
