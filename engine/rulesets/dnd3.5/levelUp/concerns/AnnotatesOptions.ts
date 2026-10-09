import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/aptitudes/AptitudeTargets.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type LevelUpState from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A slot a feat's modifier adds to (or sets on) a pool. */
export type AptitudeModifier = { aptitudeId: string; operator: string; value: number };

/** What a picker says of its options: whether the character meets their requirements, and the pools they add to. */
export function AnnotatesOptions<B extends Constructor<LevelUpState>>(Base: B) {
  abstract class AnnotatingOptions extends Base {
    /** The candidates, each with whether the character meets its requirements, and the tree of those it fails. */
    protected annotateRequirements<T extends { id: string }>(
      character: Dnd35DetailedCharacter,
      candidates: T[],
    ): (T & { eligible: boolean; requirementTree?: string })[] {
      if (candidates.length === 0) return [];
      return candidates.map((candidate) => {
        const reqs = this.rulesetData.requirementsByEntity.get(candidate.id);
        const eligible = !reqs || reqs.length === 0 || character.areRequirementsMet([reqs]);
        return {
          ...candidate,
          eligible,
          ...(!eligible && reqs ? { requirementTree: character.formatRequirements(reqs) } : {}),
        };
      });
    }

    /** The pools these feats' modifiers add slots to (`aptitudes.<slug>.allowed`), by feat id. */
    protected resolveAptitudeModifiers(featIds: string[]) {
      const result = new Map<string, AptitudeModifier[]>();
      for (const featId of featIds) {
        for (const mod of this.rulesetData.modifiersBySource.get(featId) ?? []) {
          if (mod.sourceType !== "feats") continue;
          const pool = AptitudeTargets.parsePool(mod.target);
          if (pool === undefined) continue;
          const resolvedAptitudeId = this.rulesetData.aptitudeIdBySlug.get(pool);
          const value = LiteralValue.parse(mod.value, "number");
          if (!resolvedAptitudeId || typeof value !== "number") continue;
          let group = result.get(mod.sourceId);
          if (!group) {
            group = [];
            result.set(mod.sourceId, group);
          }
          group.push({ aptitudeId: resolvedAptitudeId, value, operator: mod.operator });
        }
      }
      return result;
    }
  }
  return AnnotatingOptions;
}
