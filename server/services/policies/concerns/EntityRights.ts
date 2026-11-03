import type { Constructor } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may change a ruleset's entities: its owner and its admin and editor contributors. */
export function EntityRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithEntityRights extends Base {
    /** Who edits the ruleset's entities: its owner and its Admin and Editor contributors, on a ruleset that has one. */
    protected checkEntityEditor() {
      this.checkOwned("edit");

      if (!this.isOwner && !this.isAdminContributor && !this.isEditorContributor)
        throw new ForbiddenError("Cannot edit another user's ruleset");
    }

    /**
     * Deleting an entity, or removing one a save's plan removes (`refusal`: the words its plan gives), refused while
     * it's in use (`inUse`, `EntityUses.refusesDelete`): a character's row naming it (a pick, a level's entry, an
     * inventory entry) on the current ruleset, any descendant fork, or any host ruleset that subscribes to this one as
     * an extension, by any of its equivalents; or a link whose role refuses its target's delete (a class level's base
     * bonus to a save), which the database would refuse, so this answers why.
     *
     * Other links don't count: ruleset content is author-owned; deleting an entity another links to unlinks or deletes
     * the link, as its role's delete rule says (`apply_delete_rules`). An entity a link gives a character that the
     * character actually picked is its pick, so the character-side check covers that case.
     *
     * Characters on sibling or parent rulesets don't count: they're unrelated.
     *
     * Deletion is allowed on both Draft and Published rulesets — the inUse check + COW tombstones already protect
     * subscribers and characters.
     */
    canDeleteEntity({
      inUse = false,
      refusal = "Cannot delete entities from a ruleset in use by characters",
    }: { inUse?: boolean; refusal?: string } = {}) {
      this.canUpdateEntity();

      if (inUse) throw new ConflictError(refusal);

      return true;
    }

    /**
     * Used by entity services for creating/updating entities (feats, skills, etc.).
     * Owner, Admin, and Editor contributors are allowed.
     */
    canUpdateEntity() {
      this.checkEntityEditor();
      this.checkUnarchived();

      return true;
    }
  }
  return WithEntityRights;
}
