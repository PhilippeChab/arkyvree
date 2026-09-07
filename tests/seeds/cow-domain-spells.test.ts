import { describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/database/index.ts";
import {
  aptitudesInRules,
  entitySnapshotsInRules,
  powersAptitudesInRules,
  powersInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import {
  DND35_COMPLETE_DIVINE_NAME,
  DND35_RULESET_NAME,
} from "@/database/packages/dnd35/names.ts";

/**
 * Regression: when an extension's domain references a base spell that isn't
 * in the extension's `cowSpells.ts`, the spell is COW'd into the extension
 * on-the-fly (in `seedDomains`). The COW'd copy must preserve the base's
 * "X Spells" aptitude links — otherwise, any fork that extends the extension
 * loses visibility of the spell in its base class spell lists (Wizard Spells,
 * Sorcerer Spells, etc.), because the entity_snapshot causes the base to be
 * excluded from the composed view but the COW'd copy doesn't carry its links.
 */
describe("Extension domain-COW'd spells preserve base class spell-list links", () => {
  test("Complete Divine's Magic Missile (Force Domain) keeps base SRD aptitude links", async () => {
    const [srd] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
    const [cd] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_COMPLETE_DIVINE_NAME));

    const [baseMM] = await db
      .select({ id: powersInRules.id })
      .from(powersInRules)
      .where(and(eq(powersInRules.rulesetId, srd.id), eq(powersInRules.name, "Magic Missile")));
    const [cdMM] = await db
      .select({ id: powersInRules.id })
      .from(powersInRules)
      .where(and(eq(powersInRules.rulesetId, cd.id), eq(powersInRules.name, "Magic Missile")));

    expect(baseMM, "Base SRD must have Magic Missile").toBeDefined();
    expect(cdMM, "CD must have a COW'd Magic Missile (used by Force Domain)").toBeDefined();

    const [snapshot] = await db
      .select({ sourceEntityId: entitySnapshotsInRules.sourceEntityId })
      .from(entitySnapshotsInRules)
      .where(and(
        eq(entitySnapshotsInRules.rulesetId, cd.id),
        eq(entitySnapshotsInRules.forkedEntityId, cdMM.id),
      ));
    expect(snapshot?.sourceEntityId, "CD's Magic Missile must be a COW of base SRD's").toBe(baseMM.id);

    // All "X Spells" aptitude links on base Magic Missile must be present on CD's copy.
    // These are the links that make Magic Missile show up in class spell lists.
    const baseSpellListLinks = await db
      .select({ aptitudeId: powersAptitudesInRules.aptitudeId, aptName: aptitudesInRules.name })
      .from(powersAptitudesInRules)
      .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, powersAptitudesInRules.aptitudeId))
      .where(eq(powersAptitudesInRules.powerId, baseMM.id));

    const cdLinks = await db
      .select({ aptitudeId: powersAptitudesInRules.aptitudeId })
      .from(powersAptitudesInRules)
      .where(eq(powersAptitudesInRules.powerId, cdMM.id));
    const cdLinkIds = new Set(cdLinks.map((l) => l.aptitudeId));

    const missing = baseSpellListLinks.filter((l) => l.aptName.endsWith("Spells") && !cdLinkIds.has(l.aptitudeId));
    expect(missing, `CD's Magic Missile must carry every base "X Spells" aptitude link, missing: ${missing.map((m) => m.aptName).join(", ")}`).toHaveLength(0);

    // And still has its domain-specific link (the whole reason it was COW'd).
    const [forceDomainApt] = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(eq(aptitudesInRules.rulesetId, cd.id), eq(aptitudesInRules.name, "Force Domain Spells")));
    expect(cdLinkIds.has(forceDomainApt.id), "CD's Magic Missile must be linked to Force Domain Spells").toBe(true);
  });

  test("every domain-COW'd spell across all extensions preserves base 'X Spells' links", async () => {
    // Find every power that is a COW of a base-SRD power (via entity_snapshot)
    // and is linked to a "Domain Spells" aptitude — these are the spells cowPower'd
    // by `seedDomains`. For each, verify that every base "X Spells" link is also
    // present on the COW'd copy.
    const [srd] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

    const snapshots = await db
      .select({
        ruleset: rulesetsInRules.name,
        forked: entitySnapshotsInRules.forkedEntityId,
        source: entitySnapshotsInRules.sourceEntityId,
      })
      .from(entitySnapshotsInRules)
      .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, entitySnapshotsInRules.rulesetId))
      .where(and(
        eq(entitySnapshotsInRules.entityType, "powers"),
        inArray(entitySnapshotsInRules.sourceEntityId,
          db.select({ id: powersInRules.id }).from(powersInRules).where(eq(powersInRules.rulesetId, srd.id))),
      ));

    const baseLinksByPower = new Map<string, { aptitudeId: string; aptName: string }[]>();
    const cowLinksByPower = new Map<string, Set<string>>();

    const baseIds = [...new Set(snapshots.map((s) => s.source))];
    const cowIds = snapshots.map((s) => s.forked);

    if (baseIds.length > 0) {
      const baseLinks = await db
        .select({ powerId: powersAptitudesInRules.powerId, aptitudeId: powersAptitudesInRules.aptitudeId, aptName: aptitudesInRules.name })
        .from(powersAptitudesInRules)
        .innerJoin(aptitudesInRules, eq(aptitudesInRules.id, powersAptitudesInRules.aptitudeId))
        .where(inArray(powersAptitudesInRules.powerId, baseIds));
      for (const l of baseLinks) {
        const arr = baseLinksByPower.get(l.powerId) ?? [];
        arr.push({ aptitudeId: l.aptitudeId, aptName: l.aptName });
        baseLinksByPower.set(l.powerId, arr);
      }
    }

    if (cowIds.length > 0) {
      const cowLinks = await db
        .select({ powerId: powersAptitudesInRules.powerId, aptitudeId: powersAptitudesInRules.aptitudeId })
        .from(powersAptitudesInRules)
        .where(inArray(powersAptitudesInRules.powerId, cowIds));
      for (const l of cowLinks) {
        const set = cowLinksByPower.get(l.powerId) ?? new Set<string>();
        set.add(l.aptitudeId);
        cowLinksByPower.set(l.powerId, set);
      }
    }

    // Restrict to COWs that carry at least one "Domain Spells" link — those are
    // the ones produced by `seedDomains` (the path that used to lose base links).
    const domainCowPowers = snapshots.filter((s) => {
      const links = cowLinksByPower.get(s.forked);
      if (!links) return false;
      const baseLinks = baseLinksByPower.get(s.source) ?? [];
      const baseLinkIds = new Set(baseLinks.map((l) => l.aptitudeId));
      // A link is "domain spells" if it's on the COW but not inherited from base.
      // Use the name by looking up in any of our known maps.
      return [...links].some((id) => !baseLinkIds.has(id));
    });

    const failures: string[] = [];
    for (const s of domainCowPowers) {
      const baseLinks = baseLinksByPower.get(s.source) ?? [];
      const cowLinkIds = cowLinksByPower.get(s.forked) ?? new Set<string>();
      const missing = baseLinks.filter((l) => l.aptName.endsWith("Spells") && !cowLinkIds.has(l.aptitudeId));
      if (missing.length > 0) {
        failures.push(`[${s.ruleset}] power ${s.forked} missing base aptitudes: ${missing.map((m) => m.aptName).join(", ")}`);
      }
    }

    expect(failures, `Some domain-COW'd spells lost base class spell-list links:\n${failures.join("\n")}`).toHaveLength(0);
  });
});
