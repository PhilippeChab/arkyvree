import type { RulesetData } from "@/engine/core/view/index.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type { HeldFeat, HeldSpell } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type SpellcastingState from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellcastingState.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

/** The spells a character's aptitudes give it, each with what it knows of them, and the spell tags they carry. */
export function KnownSpells<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithKnownSpells extends Base {
    /**
     * The class each spell-giving aptitude a class level gives slots in belongs to, traced through the applied modifiers:
     * the class level's class, or the class a bonus caster level advances.
     */
    private aptitudeClassNames(appliedModifiers: Modifier[]) {
      const aptitudeIdToClassName = new Map<string, string>();
      const classes = this.classes.getClasses();
      const aptitudes = this.aptitudes.getAptitudes();
      const aptitudeSpellAptitudeIds = new Set(this.allAptitudeSpells.map((spell) => spell.viaId));

      for (const modifier of appliedModifiers) {
        if (modifier.sourceType !== "class_levels") continue;
        const list = AptitudeTargets.parseList(modifier.target);
        if (list === undefined) continue;
        const aptitude = aptitudes[list];
        if (!aptitude || !aptitudeSpellAptitudeIds.has(aptitude.id) || aptitudeIdToClassName.has(aptitude.id)) continue;
        // Find which class owns this klass level
        for (const [className, klassData] of Object.entries(classes)) {
          if (klassData.levels.some((level) => level.klassLevel.id === modifier.sourceId)) {
            aptitudeIdToClassName.set(aptitude.id, className);
            break;
          }
        }
        // Fallback: check bonus klass levels from caster level advancement
        if (!aptitudeIdToClassName.has(aptitude.id)) {
          const bonusClassName = this.bonusKlassLevelClassMap.get(modifier.sourceId);
          if (bonusClassName) aptitudeIdToClassName.set(aptitude.id, bonusClassName);
        }
      }
      return aptitudeIdToClassName;
    }

    /**
     * The spell levels each aptitude knows every spell of: a leveled one's levels all known, and those of the classes a
     * list joins (a cleric's domain spells, at the levels the cleric knows his list at). An unleveled one all known
     * knows all its spells.
     */
    private knownAptitudeLevels(appliedModifiers: Modifier[]) {
      const aptitudes = this.aptitudes.getAptitudes();
      const perAptitudeLevels = new Map<string, Set<number>>();
      const unleveledAptitudeIds = new Set<string>();

      for (const [key, aptitude] of Object.entries(aptitudes)) {
        if (this.aptitudes.isLeveledAptitude(key)) {
          const aptitudeObj = aptitude as Record<string, unknown>;
          const levels = new Set<number>();
          for (let level = 0; level <= MAX_SPELL_LEVEL; level++) {
            const levelData = aptitudeObj[String(level)] as { allowed: number } | undefined;
            if (levelData && levelData.allowed === ALLOWED_ALL) levels.add(level);
          }
          if (levels.size > 0) perAptitudeLevels.set(aptitude.id, levels);
        } else if (aptitude.allowed === ALLOWED_ALL) {
          unleveledAptitudeIds.add(aptitude.id);
        }
      }

      for (const [list, classNames] of this.joiningClassNames(appliedModifiers)) {
        const aptitude = aptitudes[list];
        if (!aptitude || !this.aptitudes.isLeveledAptitude(list)) continue;
        const levels = perAptitudeLevels.get(aptitude.id) ?? new Set<number>();
        for (const className of classNames) {
          for (let level = 0; level <= MAX_SPELL_LEVEL; level++)
            if (this.classListKnowing(className, level)) levels.add(level);
        }
        if (levels.size > 0) perAptitudeLevels.set(aptitude.id, levels);
      }
      return { perAptitudeLevels, unleveledAptitudeIds };
    }

    /**
     * The aptitude spells the character doesn't know yet on the list each goes on, each given at the first level of its
     * class and free: on the list a class level gives slots in, and on the list of each class a list joins that knows the
     * spell's level (a cleric's domain spells on the cleric's). A joining list's spell no such list knows stays on its
     * own list, where it knows the level itself (a domain a fighter picks through a prestige class, its slots its own). A
     * spell is known once per list, and another class's list may know it too: a cleric/wizard's cleric list knows the
     * cleric spells in his spellbook, at the cleric's DC.
     */
    private newKnownSpells(
      spells: HeldSpell[],
      appliedModifiers: Modifier[],
      klassBonusSpellAbilityMap: Map<string, string>,
    ): HeldSpell[] {
      const aptitudeIdToClassName = this.aptitudeClassNames(appliedModifiers);
      const classes = this.classes.getClasses();
      const aptitudes = this.aptitudes.getAptitudes();
      const aptitudeKeyById = new Map(Object.entries(aptitudes).map(([key, aptitude]) => [aptitude.id, key]));
      const joining = this.joiningClassNames(appliedModifiers);

      // Each spell the character knows already on its list (picked, granted, or made known by a modifier), by both
      const knownOn = new Set(spells.map(({ entity, viaId }) => `${entity.id}:${viaId}`));
      const newSpells: HeldSpell[] = [];
      const give = (spell: (typeof this.allAptitudeSpells)[number], className: string, aptitudeId: string) => {
        const klassData = classes[className];
        if (!klassData || klassData.levels.length === 0 || knownOn.has(`${spell.entity.id}:${aptitudeId}`)) return;
        const firstLevel = klassData.levels[0];
        // Known at its class's first level, taking no room in its list
        const known: HeldSpell = {
          ...spell,
          // Its DC's ability, as a loaded spell's (`CustomizesEntities.withDcAbilities`): its class's bonus spell ability
          abilityDcName: klassBonusSpellAbilityMap.get(firstLevel.klassLevel.ownerId) ?? null,
          advancementId: firstLevel.characterLevel.id,
          free: true,
          given: false,
          modifiers: [],
          requirements: [],
          step: "spells",
          trackId: firstLevel.klassLevel.id,
          viaId: aptitudeId,
          virtual: false,
        };
        firstLevel.spells.push(known);
        newSpells.push(known);
      };

      for (const spell of this.allAptitudeSpells) {
        const className = aptitudeIdToClassName.get(spell.viaId);
        if (className) give(spell, className, spell.viaId);

        const list = aptitudeKeyById.get(spell.viaId);
        const joiningClassNames = [...((list !== undefined && joining.get(list)) || [])];
        let joined = false;
        for (const joiningClassName of joiningClassNames) {
          const classList = this.classListKnowing(joiningClassName, spell.spellLevel);
          if (!classList) continue;
          give(spell, joiningClassName, aptitudes[classList].id);
          joined = true;
        }
        const ownLevel = (aptitudes[list ?? ""] as Record<string, unknown> | undefined)?.[String(spell.spellLevel)];
        if (
          !joined &&
          joiningClassNames.length > 0 &&
          (ownLevel as AptitudeLevelData | undefined)?.allowed === ALLOWED_ALL
        )
          give(spell, joiningClassNames[0], spell.viaId);
      }
      return newSpells;
    }

    /**
     * Tags the spells of each list one of the character's feats brings (`featListIds`: it gives slots in it or joins it
     * to its class's list) with the feat's name: a cleric's domain spells "Fire Domain", a specialist wizard's school
     * spells "Evocation Specialist". A tag shows on that list and on the lists of the class whose level gave the feat.
     */
    protected buildSpellTags(feats: HeldFeat[], featListIds: Set<string>) {
      const aptitudes = this.aptitudes.getAptitudes();
      const classNameByClassLevelId = this.classNameByClassLevelId();
      const tagsByAptitudeId = new Map<string, string[]>();
      for (const feat of feats) {
        // A feat held at a level is of that level's class: one held without a level (a modifier's) is of none
        const className = feat.trackId === undefined ? undefined : classNameByClassLevelId.get(feat.trackId);
        const classListIds = className
          ? this.spellListsOf(className).flatMap((key) => (aptitudes[key] ? [aptitudes[key].id] : []))
          : [];
        const lists = new Set(feat.modifiers.flatMap((modifier) => SpellLists.listOpenedBy(modifier.target) ?? []));
        for (const list of lists) {
          const aptitude = aptitudes[list];
          if (!aptitude || !featListIds.has(aptitude.id)) continue;
          const joinsClassList = feat.modifiers.some((modifier) => AptitudeTargets.parseJoin(modifier.target) === list);
          // A feat opening several lists shows its tag on each of them
          const tagged = this.spellTagLists[feat.entity.name] ?? { aptitudeIds: classListIds, joinsClassList: false };
          this.spellTagLists[feat.entity.name] = {
            aptitudeIds: [...new Set([aptitude.id, ...tagged.aptitudeIds])],
            joinsClassList: tagged.joinsClassList || joinsClassList,
          };
          tagsByAptitudeId.set(aptitude.id, [...(tagsByAptitudeId.get(aptitude.id) ?? []), feat.entity.name]);
        }
      }
      if (tagsByAptitudeId.size === 0) return;

      for (const link of this.spellAptitudeLinks) {
        for (const tag of tagsByAptitudeId.get(link.aptitudeId) ?? []) {
          if (!this.spellTags[link.spellId]) this.spellTags[link.spellId] = [];
          this.spellTags[link.spellId].push(tag);
        }
      }
    }

    /**
     * The spells of the lists the character knows every spell of (or a level of), off the view, and the lists each is
     * on.
     */
    protected collectAptitudeSpells(rulesetData: RulesetData, spells: HeldSpell[], appliedModifiers: Modifier[]) {
      const dnd35 = Dnd35View.of(rulesetData);
      const { perAptitudeLevels, unleveledAptitudeIds } = this.knownAptitudeLevels(appliedModifiers);
      if (perAptitudeLevels.size === 0 && unleveledAptitudeIds.size === 0) return;

      // Iterate the composed spells once, emitting one row per matching (spell, aptitude) link: a spell on two of the
      // lists the character knows is known on each
      const allAptitudeSpells: typeof this.allAptitudeSpells = [];
      for (const spell of dnd35.spells) {
        const saveName = SpellsComponent.saveNameOf(spell, rulesetData);
        for (const link of dnd35.listLinksOf(spell.id)) {
          const leveledSet = perAptitudeLevels.get(link.toId);
          const isLeveled = leveledSet !== undefined && link.tier !== null && leveledSet.has(link.tier);
          const isUnleveled = unleveledAptitudeIds.has(link.toId);
          if (!isLeveled && !isUnleveled) continue;
          allAptitudeSpells.push({ entity: spell, saveName, spellLevel: link.tier, viaId: link.toId });
        }
      }

      this.allAptitudeSpells = allAptitudeSpells;
      if (this.allAptitudeSpells.length === 0) return;

      // The spell→aptitude link table from the cache
      const aptitudeSpellIds = new Set(this.allAptitudeSpells.map(({ entity }) => entity.id));

      const allSpellIdSet = new Set<string>([...spells.map(({ entity }) => entity.id), ...aptitudeSpellIds]);
      const spellAptitudeLinks: { aptitudeId: string; spellId: string }[] = [];
      for (const id of allSpellIdSet) {
        const p = dnd35.spellsById.get(id);
        if (!p) continue;
        for (const link of dnd35.listLinksOf(p.id)) spellAptitudeLinks.push({ spellId: p.id, aptitudeId: link.toId });
      }

      this.spellAptitudeLinks = spellAptitudeLinks;
    }

    /** The spells the character's lists make it know, added to its spells with their DCs. */
    protected enrichAllKnownSpells(
      rulesetData: RulesetData,
      spells: HeldSpell[],
      klassBonusSpellAbilityMap: Map<string, string>,
      appliedModifiers: Modifier[],
    ) {
      if (this.allAptitudeSpells.length === 0) return;
      const newSpells = this.newKnownSpells(spells, appliedModifiers, klassBonusSpellAbilityMap);
      if (newSpells.length > 0) this.registerKnownSpells(rulesetData, newSpells);
    }

    getSpellTagLists() {
      return this.spellTagLists;
    }

    getSpellTags() {
      return this.spellTags;
    }

    /**
     * Adds spells the character knows past those it loaded to its spells: known in its spell map on their list, and
     * grouped with their DC ability. Those its lists make it know as it finishes, and a spell a modifier's grant makes
     * known as it applies (`PossessesVirtually`).
     */
    registerKnownSpells(rulesetData: RulesetData, newSpells: HeldSpell[]) {
      const { spellSlugByAptitudeId } = SpellLists.of(rulesetData);
      this.spells.addSpellEntries(
        newSpells.map(({ entity }) => entity),
        rulesetData,
      );
      for (const spell of newSpells) {
        const list = Dnd35View.of(rulesetData).aptitudesById.get(spell.viaId);
        // Mark as known in spell map
        if (list) {
          const entry = this.spells.getSpellEntry(spell.entity.name, list.name);
          if (entry) entry.known = true;
        }
        const aptitudeSlug = spellSlugByAptitudeId.get(spell.viaId) ?? spell.viaId;
        this.spellGroupings.registerSpell(spell, aptitudeSlug, rulesetData.valuesOf(spell.entity.id));
      }
      this.spells.readGroupings();
    }
  }
  return WithKnownSpells;
}
