/** How a 3.5 package seeds its content: the system ruleset it creates, and the core rules or an extension's book in it. */

import type { CorePackage, ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { CORE } from "@/content/dnd3.5/packages/core.ts";
import type { Db } from "@/server/database/index.ts";

import { RulesetSeeder } from "./RulesetSeeder.ts";

/**
 * Seeds a 3.5 package: the core rules into the core ruleset it creates, or an extension's book into the extension of
 * them it creates, the book's domains opening their spell levels at the core cleric's.
 */
export async function seedDnd35Package(db: Db, definition: CorePackage | ExtensionPackage) {
  if (definition.type === "base_ruleset") {
    const seeder = await RulesetSeeder.createCore(db, definition.ruleset);
    await seeder.seedCore(definition.content);
    return;
  }
  const seeder = await RulesetSeeder.createExtension(db, definition.ruleset);
  await seeder.seedBook(definition.content, CORE.classes);
}
