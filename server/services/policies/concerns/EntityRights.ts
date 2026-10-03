import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may change a ruleset's entities: its owner and its admin and editor contributors. */
export function EntityRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithEntityRights extends Base {
    /**
     * Used by entity services for creating/updating entities (feats, skills, etc.).
     * Owner, Admin, and Editor contributors are allowed.
     */
    canUpdateEntity() {
      if (!this.entity.userId) {
        throw new ForbiddenError("Cannot edit a base ruleset");
      }

      if (!this.isOwner && !this.isAdminContributor && !this.isEditorContributor) {
        throw new ForbiddenError("Cannot edit another user's ruleset");
      }

      if (this.entity.status === "Archived") {
        throw new UnprocessableEntityError("Archived rulesets are read-only");
      }

      return true;
    }

    /**
     * `inUse` means: deleting this entity would orphan a character pick on the
     * current ruleset, any descendant fork, or any host ruleset that subscribes
     * to this one as an extension. Nothing else.
     *
     * Don't include class-side references (klass_level_feats, klass_skills, etc.)
     * — class definitions are author-owned content; if the author deletes a feat
     * their class grants, the FK cascade wipes the grant and the author can fix
     * it. Class-granted feats that a character actually picked are recorded on
     * the character (level_feats_in_character.feat_id), so the character-side
     * check covers that case.
     *
     * The Character* repos' existsBy* methods take { id, rulesetId } and
     * internally join on rulesets to also count characters whose host ruleset
     * either descends from this ruleset (ancestor_ruleset_ids array overlap)
     * or subscribes to it as an extension (extension_ruleset_ids array overlap).
     * Don't include characters from sibling/parent rulesets — they're unrelated.
     *
     * Deletion is allowed on both Draft and Published rulesets — the inUse
     * check + COW tombstones already protect subscribers and characters.
     */
    canDeleteEntity({ inUse = false }: { inUse?: boolean } = {}) {
      this.canUpdateEntity();

      if (inUse) {
        throw new ConflictError("Cannot delete entities from a ruleset in use by characters");
      }

      return true;
    }
  }
  return WithEntityRights;
}
