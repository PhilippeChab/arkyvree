import type { RulesIssue } from "@/engine/core/RulesError.ts";
import { ALLOWED_ALL } from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudeTargets.ts";
import type CharacterState from "@/engine/rulesets/dnd5.2/model/CharacterState.ts";
import type { CustomizedClassLevel } from "@/engine/rulesets/dnd5.2/model/loading/loadedEntities.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Feat, Klass, Spell } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";
import { capitalize } from "@/shared/text.ts";

/**
 * A D&D 5th Edition character's diagnostics, which core's validation reads (`Validates`): the issues its rules flag (its pools'
 * slots, its skill points and ranks, a general feat with no pool), the rows core checks come from its source chain, and
 * the names of its entities its issues give, past those core names.
 */
export function Diagnoses<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Diagnosing extends Base {
    /** The pools' slots unspent or overspent, then the armor worn without its training: what the 2024 rules flag. */
    protected override findRulesetIssues(): RulesIssue[] {
      const issues: RulesIssue[] = [];

      // Each pool should have available === 0. An issue carries its pool: its aptitude, and its spell level (`tier`).
      for (const { id, name, spellLevel, allowed, spent, available } of this.components.aptitudes.getSlotPools()) {
        if (allowed === ALLOWED_ALL || available === 0) continue;
        const pool = spellLevel === undefined ? name : `${name} (level ${spellLevel})`;
        issues.push({
          category: "aptitudes",
          message:
            available > 0
              ? `${pool}: ${available} unspent slot(s) (${spent}/${allowed})`
              : `${pool}: overspent by ${Math.abs(available)} (${spent}/${allowed})`,
          entityId: id,
          entityName: name,
          entityType: "aptitudes",
          tier: spellLevel,
        });
      }

      return [...issues, ...this.findArmorIssues()];
    }

    /** The character's species, background, classes, feats and spells, which its source chain must hold. */
    protected override listEntityRows() {
      const { background, species, classes, feats, spells } = this.data;
      const entities = <E>(held: { entity: E }[]) => held.map(({ entity }) => entity);
      return {
        species: [species],
        backgrounds: background ? [background] : [],
        classes,
        feats: entities(feats),
        spells: entities(spells),
      };
    }

    /**
     * Its species, its background, a feat or a spell it has, any class of the ruleset, and a class level of its own, by
     * name.
     */
    protected override nameEntity(entityId: string, entityType: string): string | undefined {
      const idx = this.getDiagnosticsIndex();
      switch (entityType) {
        case "species":
          if (this.data.species.id === entityId) return this.data.species.name;
          break;
        case "backgrounds":
          if (this.data.background?.id === entityId) return this.data.background.name;
          break;
        case "feats":
          return idx.featsById.get(entityId)?.name;
        case "spells":
          return idx.spellsById.get(entityId)?.name;
        case "classes":
          return idx.rulesetClassesById.get(entityId)?.name;
        case "class-levels": {
          const kl = idx.classLevelsById.get(entityId);
          if (!kl) break;
          const klass = idx.rulesetClassesById.get(kl.ownerId);
          const position = this.rulesetData.positionNameOf("class-levels", kl.position);
          return klass ? `${klass.name} ${position}` : position;
        }
      }
      return undefined;
    }

    override resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined {
      const name = this.resolveEntityName(modifier.sourceId, modifier.sourceType);
      if (name) return { name, type: modifier.sourceType };
      return this.getDiagnosticsIndex().modifierOwner.get(modifier.id);
    }

    private getDiagnosticsIndex() {
      if (this.diagnosticsIndex) return this.diagnosticsIndex;
      const featsById = new Map<string, Feat>();
      for (const { entity } of this.data.feats) featsById.set(entity.id, entity);
      const spellsById = new Map<string, Spell>();
      for (const { entity } of this.data.spells) spellsById.set(entity.id, entity);
      const classLevelsById = new Map<string, CustomizedClassLevel>();
      for (const kl of this.data.classLevels) classLevelsById.set(kl.id, kl);
      const rulesetClassesById = new Map<string, Klass>();
      for (const k of Dnd52View.of(this.rulesetData).classes) rulesetClassesById.set(k.id, k);

      // Flat modifier.id → owning entity index. Built once by iterating every
      // entity that owns modifiers so resolveModifierSourceName becomes O(1).
      const modifierOwner = new Map<string, { name: string; type: string }>();
      for (const feat of this.data.feats)
        for (const m of feat.modifiers) modifierOwner.set(m.id, { name: feat.entity.name, type: "feats" });

      for (const inv of this.data.inventory)
        for (const m of inv.item.modifiers) modifierOwner.set(m.id, { name: inv.item.name, type: "items" });

      for (const [source, type] of [
        [this.data.species, "species"],
        [this.data.background, "backgrounds"],
      ] as const)
        for (const m of source?.modifiers ?? []) modifierOwner.set(m.id, { name: source!.name, type });

      for (const kl of this.data.classLevels) {
        const klass = rulesetClassesById.get(kl.ownerId);
        const position = this.rulesetData.positionNameOf("class-levels", kl.position);
        const label = klass ? `${klass.name} ${position}` : position;
        for (const m of kl.modifiers) modifierOwner.set(m.id, { name: label, type: "class-levels" });
      }
      for (const spell of this.data.spells)
        for (const m of spell.modifiers) modifierOwner.set(m.id, { name: spell.entity.name, type: "spells" });

      this.diagnosticsIndex = {
        featsById,
        spellsById,
        classLevelsById,
        rulesetClassesById,
        modifierOwner,
      };
      return this.diagnosticsIndex;
    }

    /**
     * The armor the character wears without its training, as the SRD 5.2.1's Armor Training says: Disadvantage on every
     * D20 Test of Strength or Dexterity, and no spellcasting. A sheet tells it as an issue, which the rules don't refuse.
     */
    protected findArmorIssues(): RulesIssue[] {
      const { armor } = this.components.combat.getCombat();
      if (armor.trained) return [];
      const category = capitalize(armor.category);
      const message = `No training with ${category} armor: Disadvantage on Strength and Dexterity tests, and no spellcasting`;
      return [{ category: "combat", message }];
    }
  }

  return Diagnosing;
}
