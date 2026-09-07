import { eq, inArray } from "drizzle-orm";
import {
  aptitudesInRules,
  featsAptitudesInRules,
  featsInRules,
  powersAptitudesInRules,
  powersInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { copySpellListLinksFromBase, cowPower } from "@/database/packages/dnd35/seed-utils/seed-powers.ts";
import {
  modifiersInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";

// ---------------------------------------------------------------------------
// gateSpellSlotModifiers — add class-level requirements to spell slot modifiers
// ---------------------------------------------------------------------------

export async function gateSpellSlotModifiers(
  db: Db,
  insertedModifiers: { id: string; sourceId: string; target: string }[],
  classTarget: string,
  spellLevels: Record<number, number>,
): Promise<void> {
  const modifierRequirements: {
    entityId: string;
    entityType: string;
    level: string;
    target: string;
    operator: string;
    value: string;
    valueType: string;
  }[] = [];

  for (const mod of insertedModifiers) {
    const match = mod.target.match(/^aptitudes\.\w+\.(\d+)\.(uses|allowed)$/);
    if (!match) continue;

    const spellLevel = Number(match[1]);
    const requiredLevel = spellLevels[spellLevel];
    if (requiredLevel == null || requiredLevel <= 1) continue;

    modifierRequirements.push({
      entityId: mod.id,
      entityType: "modifiers",
      level: "1",
      target: classTarget,
      operator: "greater_than_or_equal",
      value: String(requiredLevel),
      valueType: "number",
    });
  }

  if (modifierRequirements.length > 0) {
    await db.insert(requirementsInCustomization).values(modifierRequirements);
  }
}

// ---------------------------------------------------------------------------
// seedDomains — domain seeding steps: feats, aptitudes, modifiers, gating,
//               new powers, spell links (steps 3-11 of v2/domains/seed.ts)
// ---------------------------------------------------------------------------

export async function seedDomains(
  db: Db,
  rulesetId: string,
  domains: DomainDefinition[],
  ctx: {
    aptMap: Record<string, string>;
    powerMap: Record<string, string>;
    clericDomainAptId: string;
    clericSpellLevels: Record<number, number>;
  },
): Promise<Record<string, string>> {
  if (domains.length === 0) return {};

  const { aptMap, clericDomainAptId, clericSpellLevels } = ctx;

  // 0. Build powerMap: start with caller's map, then load all powers already in
  //    this extension (includes spells COW'd by cowSpellsIntoExtension earlier)
  const ownPowers = await db
    .select({ id: powersInRules.id, name: powersInRules.name })
    .from(powersInRules)
    .where(eq(powersInRules.rulesetId, rulesetId));
  const powerMap = { ...ctx.powerMap };
  for (const p of ownPowers) {
    if (!powerMap[p.name]) powerMap[p.name] = p.id;
  }

  // Load ancestor powers for COW — domain spells referencing ancestor spells
  // need to be COW'd into this extension, not linked directly
  const ancestorPowerMap = new Map<string, string>(); // name → ancestor power ID
  const [ruleset] = await db
    .select({ ancestorRulesetIds: rulesetsInRules.ancestorRulesetIds })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.id, rulesetId));

  if (ruleset?.ancestorRulesetIds.length) {
    const ancestorPowers = await db
      .select({ id: powersInRules.id, name: powersInRules.name })
      .from(powersInRules)
      .where(inArray(powersInRules.rulesetId, ruleset.ancestorRulesetIds));
    for (const p of ancestorPowers) {
      if (!powerMap[p.name]) ancestorPowerMap.set(p.name, p.id);
    }
  }

  // 1. Insert per-domain spell aptitudes
  const insertedApts = await db
    .insert(aptitudesInRules)
    .values(
      domains.map((d) => ({ rulesetId, name: `${d.name} Domain Spells` })),
    )
    .returning({ id: aptitudesInRules.id, name: aptitudesInRules.name });

  for (const a of insertedApts) {
    aptMap[a.name] = a.id;
  }

  // 2. Insert domain feats
  const insertedFeats = await db
    .insert(featsInRules)
    .values(
      domains.map((d) => ({
        rulesetId,
        name: `${d.name} Domain`,
        description: d.description,
      })),
    )
    .returning({ id: featsInRules.id, name: featsInRules.name });

  const featMap = Object.fromEntries(insertedFeats.map((f) => [f.name, f.id]));

  // 3. Link all domain feats to "Cleric Domain" aptitude
  await db.insert(featsAptitudesInRules).values(
    insertedFeats.map((f) => ({ featId: f.id, aptitudeId: clericDomainAptId })),
  );

  // 4. Insert modifiers: domain spell slots + domain-specific modifiers
  const modifiers: {
    sourceId: string;
    sourceType: string;
    target: string;
    value: string;
    valueType: string;
    operator: string;
  }[] = [];

  for (const d of domains) {
    const featId = featMap[`${d.name} Domain`];
    const slug = stripSeparators(d.name) + "domainspells";

    for (let sl = 1; sl <= 9; sl++) {
      modifiers.push({
        sourceId: featId,
        sourceType: "feats",
        target: `aptitudes.${slug}.${sl}.uses`,
        value: "1",
        valueType: "number",
        operator: "add",
      });
      modifiers.push({
        sourceId: featId,
        sourceType: "feats",
        target: `aptitudes.${slug}.${sl}.allowed`,
        value: "-1",
        valueType: "number",
        operator: "set",
      });
    }

    if (d.modifiers) {
      for (const m of d.modifiers) {
        modifiers.push({ sourceId: featId, sourceType: "feats", ...m });
      }
    }
  }

  const insertedModifiers = await db
    .insert(modifiersInCustomization)
    .values(modifiers)
    .returning({ id: modifiersInCustomization.id, sourceId: modifiersInCustomization.sourceId, target: modifiersInCustomization.target });

  // 7. Gate domain spell modifiers by cleric spell progression
  await gateSpellSlotModifiers(db, insertedModifiers, "classes.cleric.level", clericSpellLevels);

  // 8. Link domain spells to domain spell aptitudes
  //    COW ancestor powers on first use so the extension owns its copies
  const aptitudeLinks: { powerId: string; aptitudeId: string; level: number }[] = [];
  const cowCache = new Map<string, string>(); // ancestor power ID → COW'd copy ID

  // Build case-insensitive power lookup (domain spell names may differ in casing from DB)
  const powerMapCI = new Map<string, string>();
  for (const [name, id] of Object.entries(powerMap)) {
    powerMapCI.set(name.toLowerCase(), id);
  }
  const ancestorPowerMapCI = new Map<string, string>();
  for (const [name, id] of ancestorPowerMap.entries()) {
    ancestorPowerMapCI.set(name.toLowerCase(), id);
  }

  const aptLinkSeen = new Set<string>();
  for (const d of domains) {
    const aptId = aptMap[`${d.name} Domain Spells`];
    for (const spell of d.spells) {
      let powerId = powerMapCI.get(spell.name.toLowerCase());

      // COW ancestor power if not already in this extension
      if (!powerId) {
        const ancestorId = ancestorPowerMapCI.get(spell.name.toLowerCase());
        if (ancestorId) {
          let cowId = cowCache.get(ancestorId);
          if (!cowId) {
            const result = await cowPower(db, ancestorId, rulesetId);
            if (!result) continue;
            cowId = result;
            // Preserve base's class/domain spell-list visibility on the COW.
            // Without this, COWing for a domain list silently removes the
            // spell from Wizard Spells / Sorcerer Spells / etc. in any fork.
            await copySpellListLinksFromBase(db, ancestorId, cowId);
            cowCache.set(ancestorId, cowId);
            powerMapCI.set(spell.name.toLowerCase(), cowId);
          }
          powerId = cowId;
        }
      }

      if (!powerId) {
        console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${d.name} Domain)`);
        continue;
      }
      const key = `${powerId}:${aptId}`;
      if (aptLinkSeen.has(key)) continue;
      aptLinkSeen.add(key);
      aptitudeLinks.push({ powerId, aptitudeId: aptId, level: spell.level });
    }
  }

  if (aptitudeLinks.length > 0) {
    await db.insert(powersAptitudesInRules).values(aptitudeLinks);
  }

  return featMap;
}
