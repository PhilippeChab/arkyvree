/** A class's spell lists' spells: what adding spells to one of its lists, or removing one from it, writes. */

import type { ListCreatePlan, ListEntriesPlan, MadeEntity } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import SpellEntity from "@/engine/rulesets/dnd3.5/entities/spells/SpellEntity.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import type ClassTable from "./ClassTable.ts";

/** A list spells are added to: its id, its name, and the aptitude a first add makes for it (`made`, at that id). */
interface AddedList {
  id: string;
  made?: MadeEntity;
  name: string;
}

/** A spell's place on a list: the list (`toId`, an aptitude) and its level there (`tier`). */
interface Listing {
  tier: number | null;
  toId: string;
}

/**
 * A class's spell lists (`klass`, as the view has it: those its table gives, `ClassTable.describeSpellLists`, its own
 * first), and what adding spells to one of them at a spell level, or removing one from it, writes: each spell's edit,
 * its lists as the view composes them with the one changed, as the spell's page saves them (`SpellEntity.planEdit`:
 * an inherited spell's save copies it), its name, its description and its fields as they are. An add to the class's
 * own list (named for it, "Witch Spells") makes it first where the ruleset has none, as making it with no spells does
 * (`planOwnList`, from the class's Spells tab). The class itself isn't written.
 */
export default class ClassSpellLists {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
    private readonly table: ClassTable,
  ) {}

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.view.rulesetData);
  }

  /**
   * One of the class's spell lists (`listId`, its id or its source's), as its table gives it: refused as not found for
   * a list it doesn't give slots in ("Spell list not found for Wizard").
   */
  private findList(listId: string): AddedList {
    const id = this.view.rulesetData.canonicalize(listId);
    const list = this.table.describeSpellLists().find((each) => each.id === id);
    if (!list) throw new RulesError("not-found", `Spell list not found for ${this.klass.name}`);
    return list;
  }

  /**
   * A spell's lists, as the view composes them (its siblings' among them), each its list and its level there: those the
   * view holds alone, each by the id it knows it by (a list the ruleset deleted dropped, one a remade list stands for
   * resolved to it), each once.
   */
  private listingsOf(spell: Spell): Listing[] {
    const { rulesetData } = this.view;
    const listings = new Map<string, Listing>();
    for (const { tier, toId } of this.dnd35.listLinksOf(spell.id)) {
      const list = rulesetData.find("aptitudes", toId);
      if (list && !listings.has(list.id)) listings.set(list.id, { tier: tier ?? null, toId: list.id });
    }
    return [...listings.values()];
  }

  /**
   * The class's own spell list (`ClassTable.describeOwnList`: "Witch Spells"), and the aptitude to make for it at a new
   * id, which the spells' links name, while the ruleset has none (`made`). Refused as a conflict when the aptitude of
   * its name is a feat pool, which a list of spells can't be, and when the class casts from other lists, which its
   * Spell List shows instead of its own: an add goes to one of them.
   */
  private ownList(): AddedList {
    const { klass, table } = this;
    const own = table.describeOwnList();
    if (own.id !== null && table.holdsFeats(own.id))
      throw new RulesError("conflict", `${own.name} is a feat pool, so it can't be ${klass.name}'s spell list`);
    const lists = table.describeSpellLists();
    if (lists.length > 0 && !lists.some((list) => list.id === own.id))
      throw new RulesError("conflict", `${klass.name} casts from other spell lists: add the spells to one of them`);
    if (own.id !== null) return { id: own.id, name: own.name };
    const id = crypto.randomUUID();
    const row = { description: "", id, name: own.name };
    return { id, made: { links: [], modifiers: [], requirements: [], row, type: "aptitudes" }, name: own.name };
  }

  /**
   * A spell's edit that sets its lists (`listings`), as its page's save writes it: its name and its description as they
   * are, its fields left out (kept), refused as its page's save is (a list the view's feats use); and its place on a
   * list the add makes (`made`), which the view doesn't have yet, past them.
   */
  private planListings(spell: Spell, listings: Listing[], made?: Listing) {
    const form = { description: spell.description, links: { listedIn: listings }, name: spell.name };
    const plan = new SpellEntity(this.view).planEdit(spell.id, form);
    if (!made) return plan;
    const links = plan.links?.map((set) => (set.role === "listedIn" ? { ...set, links: [...set.links, made] } : set));
    return { ...plan, links };
  }

  /**
   * Adding spells (`spellIds`, each its id or its source's) to one of the class's lists (`listId`; none: its own list,
   * made first where the ruleset has none, `ownList`) at a spell level (`tier`): the list it makes, each spell's edit,
   * its other lists kept, and what its activity records (the class's and the list's names, the level, the spells'
   * names). Refused as invalid for a level past the rules' bounds (by `tier`), a spell the ruleset doesn't have, or
   * one given twice; as a conflict for a spell already on the list, at any level, and as `ownList` refuses its own.
   */
  planAdd(listId: string | undefined, spellIds: string[], tier: number | undefined): ListEntriesPlan {
    const list = listId === undefined ? this.ownList() : this.findList(listId);
    const level = RulesError.parse(SpellEntity.level, tier, ["tier"]);
    const ids = new RequestIds(this.view.rulesetData, "this ruleset");
    const spells = ids.resolveAll("spells", spellIds).map((id) => ids.find("spells", id));
    const listed = spells.find((spell) => this.listingsOf(spell).some((listing) => listing.toId === list.id));
    if (listed) throw new RulesError("conflict", `${listed.name} is already on ${list.name}`);
    return {
      activity: {
        entityName: this.klass.name,
        listName: list.name,
        rulesetId: this.view.ruleset.id,
        tier: level,
        toNames: spells.map((spell) => spell.name),
      },
      edits: spells.map((spell) => {
        const added = { tier: level, toId: list.id };
        return list.made
          ? this.planListings(spell, this.listingsOf(spell), added)
          : this.planListings(spell, [...this.listingsOf(spell), added]);
      }),
      listedType: "spells",
      owner: this.klass,
      writes: list.made ? { made: [list.made] } : undefined,
    };
  }

  /**
   * Making the class's own spell list, as its first add makes it (`ownList`), which its Spells tab then fills: with no
   * spells yet ("Barbarian Spells"), or, in a fork that deleted it, the deleted one back with its spells. The list, what
   * it writes, and what its activity records (its create's: the list's name). Refused as a conflict when the class has
   * a list already, its own or the ones it casts from, and as `ownList` refuses it (a feat pool of its name).
   */
  planOwnList(): ListCreatePlan {
    const own = this.table.describeOwnList();
    const lists = this.table.describeSpellLists();
    if (lists.length > 0 && !lists.some((list) => list.id === own.id))
      {throw new RulesError(
        "conflict",
        `${this.klass.name} casts from other spell lists, so it has none of its own to make`,
      );}
    const list = this.ownList();
    if (!list.made) throw new RulesError("conflict", `${list.name} already exists`);
    return {
      activity: { entityName: list.name, rulesetId: this.view.ruleset.id },
      created: { id: list.id, name: list.name, type: "aptitudes" },
      writes: { made: [list.made] },
    };
  }

  /**
   * Removing a spell (`spellId`, its id or its source's) from one of the class's lists (`listId`): its edit, its other
   * lists kept, and what its activity records (the class's and the list's names, the spell as every link's names it,
   * `toId` and `toName`, and its level there). Refused as not found for a spell the ruleset doesn't have, or one that
   * isn't on the list.
   */
  planRemove(listId: string, spellId: string): ListEntriesPlan {
    const list = this.findList(listId);
    const spell = this.view.rulesetData.find("spells", spellId);
    if (!spell) throw this.view.rulesetData.notFound("spells", { where: "in this ruleset" });
    const listings = this.listingsOf(spell);
    const listing = listings.find(({ toId }) => toId === list.id);
    if (!listing) throw new RulesError("not-found", `${spell.name} is not on ${list.name}`);
    return {
      activity: {
        entityName: this.klass.name,
        listName: list.name,
        rulesetId: this.view.ruleset.id,
        tier: listing.tier,
        toId: spell.id,
        toName: spell.name,
      },
      edits: [
        this.planListings(
          spell,
          listings.filter(({ toId }) => toId !== list.id),
        ),
      ],
      listedType: "spells",
      owner: this.klass,
    };
  }
}
