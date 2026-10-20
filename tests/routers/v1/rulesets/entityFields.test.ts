import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk } from "@/tests/support/api.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/entityFields.ts";

/** The keys an entity type's fields may have: those its ruleset declares, and nothing its page adds. */
function declaredKeys(entityType: keyof typeof ENTITY_FIELDS) {
  return new Set(Object.keys(ENTITY_FIELDS[entityType]));
}

/** The keys of each entity's `fields` that its type doesn't declare. */
function undeclared(entities: { fields: Record<string, unknown> }[], entityType: keyof typeof ENTITY_FIELDS) {
  const declared = declaredKeys(entityType);
  return entities.flatMap(({ fields }) => Object.keys(fields).filter((key) => !declared.has(key)));
}

describe("v1 entity fields", () => {
  test("answer what an entity's kind declares, and nothing its page adds, one by one and in pages", async () => {
    const { api } = await createKeyedApi();
    const { featMap, itemMap, klassMap, powerMap, raceMap, rulesetId: id, skillMap } = await getSeedCtx();
    const ruleset = api.v1.rulesets[":id"];
    const query = { limit: "20" };

    const items = [
      await expectOk(ruleset.items[":itemId"].$get({ param: { id, itemId: itemMap.Longsword! } })),
      ...(await expectOk(ruleset.items.$get({ param: { id }, query }))).items,
    ];
    const classId = klassMap.pc!.Wizard!;
    const levels = await expectOk(ruleset.classes[":classId"].levels.$get({ param: { classId, id } }));
    const classes = [
      await expectOk(ruleset.classes[":classId"].$get({ param: { classId, id } })),
      ...(await expectOk(ruleset.classes.$get({ param: { id }, query }))).items,
    ];
    const feats = [
      await expectOk(ruleset.feats[":featId"].$get({ param: { featId: featMap["Power Attack"]!, id } })),
      ...(await expectOk(ruleset.feats.$get({ param: { id }, query }))).items,
    ];
    const races = [
      await expectOk(ruleset.races[":raceId"].$get({ param: { id, raceId: raceMap.pc!.Dwarf! } })),
      ...(await expectOk(ruleset.races.$get({ param: { id }, query }))).items,
    ];
    const skills = [
      await expectOk(ruleset.skills[":skillId"].$get({ param: { id, skillId: skillMap.Climb! } })),
      ...(await expectOk(ruleset.skills.$get({ param: { id }, query }))).items,
    ];
    const spells = [
      await expectOk(ruleset.spells[":spellId"].$get({ param: { id, spellId: powerMap.Fireball! } })),
      ...(await expectOk(ruleset.spells.$get({ param: { id }, query }))).items,
    ];

    expect({
      classes: undeclared(classes, "klasses"),
      feats: undeclared(feats, "feats"),
      items: undeclared(items, "items"),
      levels: undeclared(levels, "klass_levels"),
      races: undeclared(races, "races"),
      skills: undeclared(skills, "skills"),
      spells: undeclared(spells, "powers"),
    }).toEqual({ classes: [], feats: [], items: [], levels: [], races: [], skills: [], spells: [] });
  });
});
