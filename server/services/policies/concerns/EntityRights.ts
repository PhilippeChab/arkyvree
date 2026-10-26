import type { Constructor } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may change a ruleset's entities: its owner and its admin and editor contributors. */
export function EntityRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithEntityRights extends Base {
    /**
     * `inUse` means: deleting this entity would orphan a character's row naming it (a link, a level's track, a pick, an
     * inventory entry) on the current ruleset, any descendant fork, or any host ruleset that subscribes to this one as
     * an extension (`EntityReferences.exists`). Nothing else.
     *
     * Don't include an entity's links (a class level's grants, a class's skills, etc.): ruleset content is
     * author-owned; if the author deletes an entity another links to, its role's delete rule unlinks or deletes the
     * link (`apply_delete_rules`), or refuses the delete, and the author can fix it. An entity a link gives a character
     * that the character actually picked is its pick, so the character-side check covers that case.
     *
     * Characters on sibling or parent rulesets don't count: they're unrelated.
     *
     * Deletion is allowed on both Draft and Published rulesets — the inUse check + COW tombstones already protect
     * subscribers and characters.
     */
    canDeleteEntity({ inUse = false }: { inUse?: boolean } = {}) {
      this.canUpdateEntity();

      if (inUse) throw new ConflictError("Cannot delete entities from a ruleset in use by characters");

      return true;
    }

    /**
     * Used by entity services for creating/updating entities (feats, skills, etc.).
     * Owner, Admin, and Editor contributors are allowed.
     */
    canUpdateEntity() {
      if (!this.entity.userId) throw new ForbiddenError("Cannot edit a base ruleset");

      if (!this.isOwner && !this.isAdminContributor && !this.isEditorContributor)
        throw new ForbiddenError("Cannot edit another user's ruleset");

      if (this.entity.status === "Archived") throw new UnprocessableEntityError("Archived rulesets are read-only");

      return true;
    }
  }
  return WithEntityRights;
}
