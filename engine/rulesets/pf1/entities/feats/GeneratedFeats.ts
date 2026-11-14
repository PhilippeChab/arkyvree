import type { FieldsWrite } from "@/engine/core/fields/index.ts";
import type { EntityRemoval, EntityRename, EntityRevival, MadeEntity } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import { FEAT_GENERATED } from "@/vocabulary/pf1/fields/index.ts";

/** What frees names for an entity's feats: the feats that give them up, renamed or removed. */
interface FreedNames {
  removed: EntityRemoval[];
  renamed: EntityRename[];
}

/** A feat a plan makes with an entity: its name and description, its fields, its customizations. */
export type GeneratedFeat = Pick<MadeEntity, "modifiers" | "requirements"> & {
  description: string;
  fields: FieldsWrite;
  name: string;
};

/**
 * A set of feats an entity brings, generated in the pool a ruleset names (`poolSlug`: Pathfinder's general feats'): what a
 * name brings (`featsOf`, a skill's, a school's), made with the entity's plan (`make`), and removed with it by a set
 * that removes its feats (`removeFeat`, which a set exposes when it does).
 */
export default abstract class GeneratedFeats {
  constructor(protected readonly view: RulesetView) {}

  /** What each name brings, kept once described: the view doesn't change under a plan. */
  private readonly brought = new Map<string, GeneratedFeat[]>();

  /** The entity each of the view's feats is of, kept once told (`ownerOf`). */
  private readonly owners = new Map<string, string | undefined>();

  /** The pool the set's feats go in, by its slug. */
  protected abstract readonly poolSlug: string;

  /** The feats `name` brings: each is made unless the view has a feat of its name. */
  protected abstract featsOf(name: string): GeneratedFeat[];

  /** The feats `name` brings (`featsOf`), described once. */
  private broughtBy(name: string): GeneratedFeat[] {
    const brought = this.brought.get(name) ?? this.featsOf(name);
    this.brought.set(name, brought);
    return brought;
  }

  /**
   * The view's feats that may be the set's feat of that `index` (as `featsOf` lists them): the generated ones named as
   * the set names it ("Skill Focus: …"), which their author can't rename.
   */
  private candidates(index: number) {
    const prefix = this.prefixOf(index);
    const feats = Pf1View.of(this.view.rulesetData).feats;
    return feats.filter((feat) => feat.fields[FEAT_GENERATED] === true && feat.name.startsWith(prefix));
  }

  /**
   * The view's generated feat `name` brings (its feat of that `index`): the one that is its own (`ownerOf`), whatever
   * its name (a feat keeps its rules' meaning while its entity is renamed apart from it: a book's skill renamed under
   * the ruleset's copy of it), the one of its name first where two are.
   */
  private findGenerated(name: string, index: number) {
    const own = this.candidates(index).filter((feat) => this.ownerOf(feat, index) === name);
    const named = this.broughtBy(name)[index].name;
    return own.find((feat) => feat.name === named) ?? own[0];
  }

  /** Whether a view's feat gives to what a description does: its modifiers read every path the description's read. */
  private givesTo(feat: { id: string }, described: GeneratedFeat): boolean {
    const read = new Set((this.view.rulesetData.modifiersBySource.get(feat.id) ?? []).map(({ target }) => target));
    return described.modifiers.length > 0 && described.modifiers.every(({ target }) => read.has(target));
  }

  /**
   * Whether a view's feat gives to nothing because the entity its rules name is gone: every rule it stores is left out
   * of the view for that (a deleted entity's feat, restored without it). Not one its author left without rules, nor
   * one whose author's own rule named something else that is gone.
   */
  private isOrphan(feat: { id: string }): boolean {
    const { cow, modifiersBySource, switchedOff } = this.view.rulesetData;
    const id = cow.resolve(feat.id);
    const off = switchedOff.filter((row) => row.of === "modifier" && cow.resolve(row.ownerId) === id);
    // The set's entities are skills: a rule its author gave it, which named something else that is gone, is its author's
    const gone = off.length > 0 && off.every((row) => row.named.entityType === "skills");
    return gone && (modifiersBySource.get(feat.id) ?? []).length === 0;
  }

  /**
   * Whether a view's feat (one of the set's of that `index`) is still as the app made it under the name it holds: the
   * app's words for that name, and the rules the set gives it, no other.
   */
  private isStock(feat: { description: string | null; id: string; name: string }, index: number): boolean {
    const described = this.broughtBy(feat.name.slice(this.prefixOf(index).length))[index];
    const owner = this.ownerOf(feat, index);
    if (owner === undefined || feat.description !== described.description) return false;
    const given = new Set(this.broughtBy(owner)[index].modifiers.map(({ target }) => target));
    const read = (this.view.rulesetData.modifiersBySource.get(feat.id) ?? []).map(({ target }) => target);
    return read.every((target) => given.has(target));
  }

  /**
   * The entity a view's feat (one of the set's of that `index`) is of, by its name: the one it gives to. One its
   * author had give to several is the one of them it's named after, and no one's when it's named after none: the
   * app then leaves it as its author made it.
   */
  private ownerOf(feat: { id: string; name: string }, index: number): string | undefined {
    const key = `${index}|${feat.id}`;
    if (this.owners.has(key)) return this.owners.get(key);
    const giving = this.ownerNames().filter((owner) => this.givesTo(feat, this.broughtBy(owner)[index]));
    const owner = giving.length > 1 ? giving.find((name) => this.broughtBy(name)[index].name === feat.name) : giving[0];
    this.owners.set(key, owner);
    return owner;
  }

  /** What the set names its feat of that `index` before its entity's name ("Skill Focus: "). */
  private prefixOf(index: number): string {
    return this.broughtBy("")[index].name;
  }

  /** The names of the view's feats. */
  private get shown(): Set<string> {
    return new Set(Pf1View.of(this.view.rulesetData).feats.map((feat) => feat.name));
  }

  /**
   * What frees the names `name` brings of the set's generated feats that hold them without being its own:
   * - another entity's (`ownerOf`), which stands under a name that isn't its entity's, is renamed to what its own
   *   entity brings, where the view shows no feat of that name, or where the renamed entity's own feat leaves it in
   *   the same plan; where that name is taken, it has no name of its own to go to, and is removed if it's still as
   *   the app made it (`isStock`), and kept under the name it has if its author changed it;
   * - one whose rules all name an entity that is gone (a deleted entity's, restored without it) is removed, unless the
   *   entity made stands for that one (`standsIn`: a skill created under a deleted skill's name), whose feat it then
   *   is again.
   * A removal is refused (`inUse`) while a character picked the feat. A feat made by hand under such a name, or one
   * its author gave other rules, keeps it. The entity a rename renames (`renaming`, by its name) is left to the rename.
   */
  protected free(name: string, inUse: string, renaming?: string, standsIn = false): FreedNames {
    const { shown } = this;
    const freed: FreedNames = { removed: [], renamed: [] };
    for (const [index, described] of this.broughtBy(name).entries()) {
      const holder = this.candidates(index).find((feat) => feat.name === described.name);
      if (!holder) continue;
      const owner = this.ownerOf(holder, index);
      if (owner === name || (owner !== undefined && owner === renaming)) continue;
      if (owner === undefined) {
        if (!standsIn && this.isOrphan(holder)) freed.removed.push({ id: holder.id, inUse, type: "feats" });
        continue;
      }
      const own = this.broughtBy(owner)[index];
      // The name the renamed entity's own feat leaves in the same plan is free for it (two entities whose feats hold
      // each other's names, a book having renamed both under the ruleset's copies)
      const leaving = renaming === undefined ? undefined : this.findGenerated(renaming, index);
      const left = leaving?.name === own.name && leaving.id !== holder.id && leaving.name !== described.name;
      if (!left && shown.has(own.name)) {
        // Only one still as the app made it goes: what its author gave it stays, under the name it has
        if (this.isStock(holder, index)) freed.removed.push({ id: holder.id, inUse, type: "feats" });
        continue;
      }
      shown.add(own.name);
      freed.renamed.push({
        description: own.description,
        id: holder.id,
        name: own.name,
        previousDescription: described.description,
        type: "feats",
      });
    }
    return freed;
  }

  /** The names that bring the set's feats, as the view has them (its skills'): none for a set whose feats stay. */
  protected ownerNames(): string[] {
    return [];
  }

  /**
   * The generated feats `name` brought, which a plan removes, refused (`inUse`) while picked: none the view has none
   * of, and never one made by hand under such a name, nor another entity's.
   */
  protected removeOf(name: string, inUse: string): EntityRemoval[] {
    return this.broughtBy(name).flatMap((_, index) => {
      const feat = this.findGenerated(name, index);
      return feat ? [{ id: feat.id, inUse, type: "feats" }] : [];
    });
  }

  /**
   * What a restore of the entity `name` (`ownerId`, as the view the restore leaves has it) writes of its feats: each
   * takes the name its entity brings again (restored with it, `restoring`, where it's the ruleset's untouched copy of
   * the feat of that name); and, for an entity the ruleset had deleted (`deleted`), the feats deleted with it show
   * again with it. A restore removes nothing, and frees no name: where another feat holds that name, the entity's own
   * keeps the one it has. A feat its author deleted by hand stays deleted when a change to its entity is restored.
   */
  alignTo(name: string, ownerId: string, deleted: boolean): { renamed: EntityRename[]; restored: EntityRevival[] } {
    const { shown } = this;
    const renamed: EntityRename[] = [];
    const restored: EntityRevival[] = [];
    for (const [index, brought] of this.broughtBy(name).entries()) {
      const feat = this.findGenerated(name, index);
      if (!feat) {
        if (deleted) {
          const prefix = this.prefixOf(index);
          restored.push({ name: brought.name, ownerId, ownerType: "skills", prefix, type: "feats" });
        }
        continue;
      }
      if (feat.name === brought.name || shown.has(brought.name)) continue;
      const previous = this.broughtBy(feat.name.slice(this.prefixOf(index).length))[index];
      renamed.push({
        description: brought.description,
        id: feat.id,
        name: brought.name,
        previousDescription: previous.description,
        restoring: true,
        type: "feats",
      });
    }
    return { renamed, restored };
  }

  /**
   * The feats `name` brings, as entities a plan makes in the set's pool: none when the ruleset has no such pool, and
   * none of those whose name its view shows (its own or its chain's; one it deleted, a tombstone hides, doesn't count),
   * so a set the ruleset holds part of gets the rest. A name the same plan frees (`freed`: the feats it renames or
   * removes) isn't shown. One made for an entity that takes a name (`standalone`: a renamed skill's) stands for no
   * deleted feat of that name, which was another entity's.
   */
  make(name: string, freed: readonly { id: string }[] = [], standalone = false): MadeEntity[] {
    const { rulesetData } = this.view;
    const pf1 = Pf1View.of(rulesetData);
    // The pool the rules name, whatever the ruleset calls it now
    const aptitudeId = rulesetData.named("aptitudes", this.poolSlug)?.id;
    if (!aptitudeId) return [];
    const vacated = new Set(freed.map((feat) => feat.id));
    const shown = new Set(pf1.feats.flatMap((feat) => (vacated.has(feat.id) ? [] : feat.name)));
    const feats = this.broughtBy(name).filter((feat) => !shown.has(feat.name));
    return feats.map(({ description, fields, modifiers, name: featName, requirements }) => ({
      links: [{ links: [{ toId: aptitudeId }], role: "listedIn", toType: "aptitudes" }],
      modifiers,
      requirements,
      row: {
        description,
        fields: { ...fields.fields, [FEAT_GENERATED]: true },
        links: fields.links,
        name: featName,
      },
      standalone,
      type: "feats",
    }));
  }

  /**
   * A feat a restore showed again (`feat`, as the view the restore leaves has it), named as its own entity brings it:
   * a generated feat's name follows its entity's, never its author's hand, so one the restore gave its source's name
   * takes its entity's again. Refused where its entity has another such feat (a deleted one, restored once the
   * entity had been given a new one), and where its entity is gone while another has its name. None for a feat that
   * isn't the set's, or is no entity's, or whose entity's name another feat holds.
   */
  realign(feat: { id: string; name: string }): EntityRename[] {
    const index = this.broughtBy("").findIndex((described) => feat.name.startsWith(described.name));
    if (index < 0) return [];
    const owner = this.ownerOf(feat, index);
    if (owner === undefined) {
      // Its own entity gone, it would stand, giving nothing, under the name another entity's feat takes
      const taken = this.ownerNames().some((name) => this.broughtBy(name)[index].name === feat.name);
      if (taken && this.isOrphan(feat)) {
        throw new RulesError(
          "conflict",
          `${feat.name} was made for a skill this ruleset deleted, and another skill has that name now: it can't be restored`,
        );
      }
      return [];
    }
    const other = this.candidates(index).find((own) => own.id !== feat.id && this.ownerOf(own, index) === owner);
    if (other) throw new RulesError("conflict", `${owner} has ${other.name} already: delete it to restore this feat`);
    const { description, name } = this.broughtBy(owner)[index];
    if (name === feat.name || this.shown.has(name)) return [];
    // The description the app gave it under the name it holds: other words (a book's author's, the ruleset's) stay
    const held = this.broughtBy(feat.name.slice(this.prefixOf(index).length))[index];
    return [{ description, id: feat.id, name, previousDescription: held.description, type: "feats" }];
  }

  /**
   * The feats `oldName` brought, as `newName` brings them: each renamed, keeping its identity, so what names it and
   * who picked it follow; or removed (refused, `inUse`, while picked) where the ruleset has another feat of its new
   * name, made by hand, which stays. Another entity's generated feat that holds the new name gives it up first (`free`).
   */
  rename(oldName: string, newName: string, inUse: string): FreedNames {
    const freed = this.free(newName, inUse, oldName);
    const vacated = new Set([...freed.removed, ...freed.renamed].map((feat) => feat.id));
    const shown = new Set(
      Pf1View.of(this.view.rulesetData).feats.flatMap((feat) => (vacated.has(feat.id) ? [] : feat.name)),
    );
    const next = this.broughtBy(newName);
    const removed: EntityRemoval[] = [...freed.removed];
    const renamed: EntityRename[] = [...freed.renamed];
    for (const [index, old] of this.broughtBy(oldName).entries()) {
      const feat = this.findGenerated(oldName, index);
      const { description, name } = next[index];
      // One that holds its new name already (its skill renamed under it) is left as it is: no copy made of it
      if (!feat || name === feat.name) continue;
      if (shown.has(name)) {
        // Held by a feat made by hand, the name stays its own, and the entity's own feat goes, as it always did; held
        // by another entity's feat its author changed (`free` left it), both stay, each under the name it has
        const holder = this.candidates(index).find((other) => other.name === name);
        if (!holder || this.ownerOf(holder, index) === undefined) removed.push({ id: feat.id, inUse, type: "feats" });
        continue;
      }
      // The description it had under the name it holds, which may not be its entity's old one (a book's feat,
      // renamed with the book's skill under the ruleset's copy of it)
      const held = feat.name === old.name ? old : this.broughtBy(feat.name.slice(this.prefixOf(index).length))[index];
      renamed.push({ description, id: feat.id, name, previousDescription: held.description, type: "feats" });
    }
    return { removed, renamed };
  }
}
