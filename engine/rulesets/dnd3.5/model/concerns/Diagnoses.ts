import type { RulesIssue } from "@/engine/core/RulesError.ts";
import { ALLOWED_ALL } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
  InventoryEntry,
} from "@/engine/rulesets/dnd3.5/model/loading/CustomizedEntities.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { MAX_SPELL_LEVEL } from "@/shared/dnd3.5/spells.ts";
import type { Klass, Modifier } from "@/shared/relations.ts";

/** An aptitude pool's (or one of its spell levels') slots. */
type AptitudeSlots = { allowed: number; available: number; spent: number };

/**
 * A 3.5 character's diagnostics, which core's validation reads (`Validates`): the issues its rules flag (its pools'
 * slots, its skill points and ranks, a general feat with no pool, a row from outside its source chain), and the names
 * its issues give.
 */
export function Diagnoses<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Diagnosing extends Base {
    private getDiagnosticsIndex() {
      if (this.diagnosticsIndex) return this.diagnosticsIndex;
      const featsById = new Map<string, CustomizedFeat>();
      for (const f of this.data.feats) featsById.set(f.id, f);
      const powersById = new Map<string, CustomizedPower>();
      for (const p of this.data.powers) powersById.set(p.id, p);
      const klassLevelsById = new Map<string, CustomizedClassLevel>();
      for (const kl of this.data.klassLevels) klassLevelsById.set(kl.id, kl);
      const rulesetKlassesById = new Map<string, Klass>();
      for (const k of this.rulesetData.klasses) rulesetKlassesById.set(k.id, k);
      const inventoryByItemId = new Map<string, InventoryEntry>();
      for (const inv of this.data.inventory) {
        inventoryByItemId.set(inv.item.id, inv);
        if (inv.item.sourceItemId) inventoryByItemId.set(inv.item.sourceItemId, inv);
      }

      // Flat modifier.id → owning entity index. Built once by iterating every
      // entity that owns modifiers so resolveModifierSourceName becomes O(1).
      const modifierOwner = new Map<string, { name: string; type: string }>();
      for (const feat of this.data.feats)
        for (const m of feat.modifiers) modifierOwner.set(m.id, { name: feat.name, type: "feats" });

      for (const inv of this.data.inventory)
        for (const m of inv.item.modifiers) modifierOwner.set(m.id, { name: inv.item.name, type: "items" });

      if (this.data.race.modifiers)
        for (const m of this.data.race.modifiers) modifierOwner.set(m.id, { name: this.data.race.name, type: "races" });

      for (const kl of this.data.klassLevels) {
        const klass = rulesetKlassesById.get(kl.klassId);
        const label = klass ? `${klass.name} Level ${kl.level}` : `Level ${kl.level}`;
        for (const m of kl.modifiers) modifierOwner.set(m.id, { name: label, type: "klass_levels" });
      }
      for (const power of this.data.powers)
        for (const m of power.modifiers) modifierOwner.set(m.id, { name: power.name, type: "powers" });

      this.diagnosticsIndex = {
        featsById,
        powersById,
        klassLevelsById,
        rulesetKlassesById,
        inventoryByItemId,
        modifierOwner,
      };
      return this.diagnosticsIndex;
    }

    /** The pools' slots unspent or overspent, then the skill points and ranks: what the 3.5 rules flag first. */
    protected findRulesetIssues(): RulesIssue[] {
      const issues: RulesIssue[] = [];

      // Check aptitudes: each should have available === 0
      const slotIssue = (name: string, { allowed, spent, available }: AptitudeSlots) => {
        if (allowed === ALLOWED_ALL || available === 0) return;
        issues.push({
          category: "aptitudes",
          message:
            available > 0
              ? `${name}: ${available} unspent slot(s) (${spent}/${allowed})`
              : `${name}: overspent by ${Math.abs(available)} (${spent}/${allowed})`,
        });
      };
      const aptitudes = this.components.aptitudes.getAptitudes();
      for (const [key, aptitude] of Object.entries(aptitudes)) {
        if (this.components.aptitudes.isLeveledAptitude(key)) {
          const aptitudeObj = aptitude as Record<string, unknown>;
          for (let level = 0; level <= MAX_SPELL_LEVEL; level++) {
            const levelData = aptitudeObj[String(level)] as AptitudeSlots | undefined;
            if (levelData) slotIssue(`${aptitude.name} (level ${level})`, levelData);
          }
        } else {
          slotIssue(aptitude.name, aptitude);
        }
      }

      const { budget, ranks } = this.getSkillValidationIssues();
      return [...issues, ...budget, ...ranks];
    }

    /** A general feat with no pool to count toward, and each row from outside the character's source chain. */
    protected findSourceIssues(): RulesIssue[] {
      const issues: RulesIssue[] = [];

      const sourceChain = (rulesetId: string, name: string, entityType: string) => {
        if (!this.data.validRulesetIds.has(rulesetId)) {
          issues.push({
            category: "integrity",
            message: `${entityType} "${name}" belongs to a ruleset not in this character's source chain`,
            entityName: name,
            entityType,
          });
        }
      };
      const unplacedGeneralFeats = this.components.aptitudes.getUnplacedGeneralFeats();
      if (unplacedGeneralFeats > 0) {
        issues.push({
          category: "integrity",
          message: `The ruleset has no ${LevelRules.GENERAL_FEATS_APTITUDE} aptitude: this character's ${unplacedGeneralFeats} general feat(s) count toward none`,
        });
      }
      sourceChain(this.data.race.rulesetId, this.data.race.name, "races");
      for (const klass of this.data.klasses) sourceChain(klass.rulesetId, klass.name, "klasses");
      for (const skill of this.data.skills) sourceChain(skill.rulesetId, skill.name, "skills");
      for (const feat of this.data.feats) sourceChain(feat.rulesetId, feat.name, "feats");
      for (const power of this.data.powers) sourceChain(power.rulesetId, power.name, "powers");
      for (const inv of this.data.inventory) sourceChain(inv.item.rulesetId, inv.item.name, "items");

      return issues;
    }

    protected getSkillValidationIssues(): { budget: RulesIssue[]; ranks: RulesIssue[] } {
      const budget: RulesIssue[] = [];
      const { available, spent, total } = this.components.skills.getSkillBudget();
      if (available > 0) {
        budget.push({ category: "skills", message: `${available} unspent skill point(s) (${spent}/${total})` });
      } else if (available < 0) {
        budget.push({
          category: "skills",
          message: `Overspent by ${Math.abs(available)} skill point(s) (${spent}/${total})`,
        });
      }
      const characterLevel = this.components.identity.getIdentity().meta.level;
      const ranks = this.components.skills.getValidationIssues(characterLevel);
      return { budget, ranks };
    }

    override resolveEntityName(entityId: string, entityType: string): string | undefined {
      const idx = this.getDiagnosticsIndex();
      switch (entityType) {
        case "races":
          if (this.data.race.id === entityId) return this.data.race.name;
          break;
        case "feats":
          return idx.featsById.get(entityId)?.name;
        case "powers":
          return idx.powersById.get(entityId)?.name;
        case "items":
          return idx.inventoryByItemId.get(entityId)?.item.name;
        case "klasses":
          return idx.rulesetKlassesById.get(entityId)?.name;
        case "modifiers": {
          const mod =
            this.data.modifiers.find((m) => m.id === entityId) ??
            this.components.spellcasting.getBonusKlassLevelModifiers().find((m) => m.id === entityId);
          if (mod) return this.resolveEntityName(mod.sourceId, mod.sourceType);

          break;
        }
        case "characters":
          if (this.character.id === entityId) return this.character.name;
          break;
        case "klass_levels": {
          const kl = idx.klassLevelsById.get(entityId);
          if (kl) {
            const klass = idx.rulesetKlassesById.get(kl.klassId);
            return klass ? `${klass.name} Level ${kl.level}` : `Level ${kl.level}`;
          }
          const attribution = this.components.spellcasting.getBonusKlassLevelAttribution().get(entityId);
          if (attribution) return attribution;
          const bonusKl = this.components.spellcasting.getBonusKlassLevels().find((k) => k.id === entityId);
          if (bonusKl) {
            const klass = idx.rulesetKlassesById.get(bonusKl.klassId);
            return klass ? `${klass.name} Level ${bonusKl.level} (bonus)` : `Level ${bonusKl.level} (bonus)`;
          }
          break;
        }
      }
      return undefined;
    }

    override resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined {
      const name = this.resolveEntityName(modifier.sourceId, modifier.sourceType);
      if (name) return { name, type: modifier.sourceType };
      return this.getDiagnosticsIndex().modifierOwner.get(modifier.id);
    }
  }

  return Diagnosing;
}
