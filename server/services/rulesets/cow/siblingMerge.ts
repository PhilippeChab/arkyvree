import { withCowContext } from "@/server/database/cowContext.ts";
import type { Db } from "@/server/database/index.ts";
import { FeatsAptitudes, Modifiers, PowersAptitudes, Properties, Requirements } from "@/server/repositories/index.ts";

import { copyEntityCustomizations } from "./copy.ts";
import { fetchSiblingCustomizations } from "./customizations.ts";
import type { EntityType } from "./hashing.ts";
import { mergeSiblingRequirements } from "./requirements.ts";

/**
 * Merge sibling data into a COW'd entity. When multiple extensions COW the same
 * base entity, the "winner" is copied first. This function merges unique data
 * from sibling extension copies (requirements, modifiers, aptitude links) so the
 * child fork starts from the full merged view.
 */
// oxlint-disable-next-line arkyvree/function-length -- a long function to split into steps
export async function mergeSiblingData(
  tx: Db,
  targetEntityId: string,
  entityType: EntityType,
  sourceType: string | undefined,
  siblingIds: string[],
  customizationIds?: Map<string, string>,
): Promise<void> {
  // Sibling-loser ids are aliased to their winners in idResolveMap, so the
  // repo proxy would rewrite `Modifiers.findMany({ sourceIds: siblingIds })` to fetch the
  // winner's rows. mergeSiblingData explicitly wants the literal stored
  // loser rows, so it reads through Drizzle directly (the proxy wraps repos
  // for application-code convenience; this is infrastructure copying raw
  // rows by id).
  const siblingCusts = await fetchSiblingCustomizations(tx, siblingIds, entityType, sourceType);

  // 1. Merge sibling requirements as a proper recursive forest merge.
  // Build the target's forest, then for each sibling: deduplicate standalone
  // roots and append intact trees at fresh
  // top-level positions on the target. Top-level AND across all rows combines
  // them: `(target) AND (sibling_1) AND (sibling_2) AND ...`.
  const targetReqs = await Requirements.findMany(tx, { entityIds: [targetEntityId], entityType });
  const newReqs = mergeSiblingRequirements(
    targetReqs,
    [...siblingCusts.values()].map((cust) => cust.requirements),
    targetEntityId,
    entityType,
  );
  if (newReqs.length > 0) {
    const copies = await Requirements.createMany(
      tx,
      newReqs.map((row) => ({ ...row, id: undefined })),
    );
    for (let i = 0; i < newReqs.length; i++) {
      customizationIds?.set(newReqs[i].id, copies[i].id);
    }
  }

  // 2. Merge sibling modifiers (deduplicate by target+value+operator+valueType)
  if (sourceType) {
    const targetModifiers = await Modifiers.findMany(tx, { sourceIds: [targetEntityId], sourceType });
    const existingModKeys = new Set(targetModifiers.map((m) => `${m.target}|${m.value}|${m.operator}|${m.valueType}`));

    for (const [siblingId, sibCust] of siblingCusts) {
      const uniqueModifiers = sibCust.modifiers.filter((m) => {
        const key = `${m.target}|${m.value}|${m.operator}|${m.valueType}`;
        if (existingModKeys.has(key)) return false;
        existingModKeys.add(key);
        return true;
      });

      if (uniqueModifiers.length > 0) {
        const modifierIds = new Set(uniqueModifiers.map((m) => m.id));
        await copyEntityCustomizations(
          tx,
          siblingId,
          targetEntityId,
          entityType,
          {
            modifiers: uniqueModifiers,
            modifierRequirements: sibCust.modifierRequirements.filter((r) => modifierIds.has(r.entityId)),
            properties: [],
            requirements: [],
          },
          customizationIds,
        );
      }
    }
  }

  // 3. Merge sibling properties (deduplicate by type+value)
  const targetProperties = await Properties.findMany(tx, { entityIds: [targetEntityId], entityType });
  const existingPropKeys = new Set(targetProperties.map((p) => `${p.type}|${p.value}`));

  const sourcePropertyIds: string[] = [];
  const newProperties: Array<{
    entityId: string;
    entityType: string;
    type: string;
    value: string;
    description: string | null;
  }> = [];
  for (const [, sibCust] of siblingCusts) {
    for (const prop of sibCust.properties) {
      const key = `${prop.type}|${prop.value}`;
      if (existingPropKeys.has(key)) continue;
      existingPropKeys.add(key);
      sourcePropertyIds.push(prop.id);
      newProperties.push({
        entityId: targetEntityId,
        entityType,
        type: prop.type,
        value: prop.value,
        description: prop.description,
      });
    }
  }

  if (newProperties.length > 0) {
    const copies = await Properties.createMany(tx, newProperties);
    for (let i = 0; i < sourcePropertyIds.length; i++) {
      customizationIds?.set(sourcePropertyIds[i], copies[i].id);
    }
  }

  // 4. Merge sibling aptitude links — sibling reads turn copy-on-write resolution off (loser
  // ids would otherwise be canonicalized to the winner). Existing reads on
  // targetEntityId go through the repo since the new id isn't in idResolveMap.
  if (entityType === "feats") {
    const existingAptitudes = await FeatsAptitudes.findMany(tx, { featId: targetEntityId });
    const existingAptIds = new Set(existingAptitudes.map((a) => a.aptitudeId));
    const newAptitudeLinks: Array<{ featId: string; aptitudeId: string }> = [];
    for (const siblingId of siblingIds) {
      const sibAptitudes = await withCowContext(undefined, () => FeatsAptitudes.findMany(tx, { featId: siblingId }));
      for (const sa of sibAptitudes) {
        if (!existingAptIds.has(sa.aptitudeId)) {
          existingAptIds.add(sa.aptitudeId);
          newAptitudeLinks.push({ featId: targetEntityId, aptitudeId: sa.aptitudeId });
        }
      }
    }

    if (newAptitudeLinks.length > 0) {
      await FeatsAptitudes.createMany(tx, newAptitudeLinks);
    }
  } else if (entityType === "powers") {
    const existingAptitudes = await PowersAptitudes.findMany(tx, { powerId: targetEntityId });
    const existingAptIds = new Set(existingAptitudes.map((a) => a.aptitudeId));

    const newAptitudeLinks: Array<{ powerId: string; aptitudeId: string; level: number | null }> = [];
    for (const siblingId of siblingIds) {
      const sibAptitudes = await withCowContext(undefined, () => PowersAptitudes.findMany(tx, { powerId: siblingId }));
      for (const sa of sibAptitudes) {
        if (!existingAptIds.has(sa.aptitudeId)) {
          existingAptIds.add(sa.aptitudeId);
          newAptitudeLinks.push({ powerId: targetEntityId, aptitudeId: sa.aptitudeId, level: sa.level });
        }
      }
    }

    if (newAptitudeLinks.length > 0) {
      await PowersAptitudes.createMany(tx, newAptitudeLinks);
    }
  }
}
