import { rulesetsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export default async function seed(db: Db) {
  await db.insert(rulesetsInRules).values({
    name: DND35_RULESET_NAME,
    description:
      "The 3.5 System Reference Document is a role-playing game system that allows players to create and control characters in a fantasy world.",
    status: "Published",
    baseRules: "Dungeons & Dragons: 3.5",
    system: true,
    kind: "ruleset",
  });
}
