import type { RulesetData } from "@/engine/core/view/index.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type { CustomizedFeat, CustomizedPower } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import PowersComponent from "@/engine/rulesets/dnd3.5/model/powers/PowersComponent.ts";
import type SpellcastingState from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellcastingState.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier, Power, Property } from "@/shared/relations.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

/** The powers a character's aptitudes give it, each with what it knows of them, and the spell tags they carry. */
export function KnownPowers<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithKnownPowers extends Base {
    /**
     * The class each power-giving aptitude a class level gives slots in belongs to, traced through the applied modifiers:
     * the class level's class, or the class a bonus caster level advances.
     */
    private aptitudeClassNames(appliedModifiers: Modifier[]) {
      const aptitudeIdToClassName = new Map<string, string>();
      const classes = this.classes.getClasses();
      const aptitudes = this.aptitudes.getAptitudes();
      const aptitudePowerAptitudeIds = new Set(this.allAptitudePowers.map((p) => p.aptitudeId));

      for (const modifier of appliedModifiers) {
        if (modifier.sourceType !== "klass_levels") continue;
        const list = AptitudeTargets.parseList(modifier.target);
        if (list === undefined) continue;
        const aptitude = aptitudes[list];
        if (!aptitude || !aptitudePowerAptitudeIds.has(aptitude.id) || aptitudeIdToClassName.has(aptitude.id)) continue;
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
     * knows all its powers.
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
     * The aptitude powers the character doesn't have yet, each given at the first level of its class and free: on the
     * list a class level gives slots in, and on the list of each class a list joins that knows the power's level (a
     * cleric's domain spells on the cleric's). A joining list's power no such list knows stays on its own list, where it
     * knows the level itself (a domain a fighter picks through a prestige class, its slots its own).
     */
    private newKnownPowers(
      powers: CustomizedPower[],
      appliedModifiers: Modifier[],
      klassBonusSpellAbilityMap: Map<string, string>,
    ): CustomizedPower[] {
      const aptitudeIdToClassName = this.aptitudeClassNames(appliedModifiers);
      const classes = this.classes.getClasses();
      const aptitudes = this.aptitudes.getAptitudes();
      const aptitudeKeyById = new Map(Object.entries(aptitudes).map(([key, aptitude]) => [aptitude.id, key]));
      const joining = this.joiningClassNames(appliedModifiers);

      // Deduplicate: exclude powers already present on the character
      const existingPowerIds = new Set(powers.map((p) => p.id));
      const newPowers: CustomizedPower[] = [];
      const give = (power: (typeof this.allAptitudePowers)[number], className: string, aptitudeId: string) => {
        const klassData = classes[className];
        if (!klassData || klassData.levels.length === 0) return;
        const firstLevel = klassData.levels[0];
        const enrichedPower: CustomizedPower = {
          ...power,
          // Its DC's ability, as a loaded spell's (`CustomizesEntities.withDcAbilities`): its class's bonus spell ability
          abilityDcName: klassBonusSpellAbilityMap.get(firstLevel.klassLevel.klassId) ?? null,
          aptitudeId,
          klassLevelId: firstLevel.klassLevel.id,
          characterLevelId: firstLevel.characterLevel.id,
          free: true,
          properties: this.aptitudePowerProperties.filter((p) => p.entityId === power.id),
          modifiers: [],
          requirements: [],
        };
        firstLevel.powers.push(enrichedPower);
        newPowers.push(enrichedPower);
      };

      for (const power of this.allAptitudePowers) {
        if (existingPowerIds.has(power.id)) continue;
        const className = aptitudeIdToClassName.get(power.aptitudeId);
        if (className) give(power, className, power.aptitudeId);

        const list = aptitudeKeyById.get(power.aptitudeId);
        const joiningClassNames = [...((list !== undefined && joining.get(list)) || [])];
        let joined = false;
        for (const joiningClassName of joiningClassNames) {
          const classList = this.classListKnowing(joiningClassName, power.powerLevel);
          if (!classList) continue;
          give(power, joiningClassName, aptitudes[classList].id);
          joined = true;
        }
        const ownLevel = (aptitudes[list ?? ""] as Record<string, unknown> | undefined)?.[String(power.powerLevel)];
        if (
          !joined &&
          joiningClassNames.length > 0 &&
          (ownLevel as AptitudeLevelData | undefined)?.allowed === ALLOWED_ALL
        )
          give(power, joiningClassNames[0], power.aptitudeId);
      }
      return newPowers;
    }

    /** Adds the new powers to the character: known in its spell map, and grouped with their DC ability. */
    private registerKnownPowers(rulesetData: RulesetData, newPowers: CustomizedPower[]) {
      const { spellSlugByAptitudeId } = SpellLists.of(rulesetData);
      this.powers.addPowerEntries(newPowers);
      for (const power of newPowers) {
        const list = rulesetData.aptitudesById.get(power.aptitudeId);
        // Mark as known in spell map
        if (list) {
          const entry = this.powers.getSpellEntry(power.name, list.name);
          if (entry) entry.known = true;
        }
        const aptitudeSlug = spellSlugByAptitudeId.get(power.aptitudeId) ?? power.aptitudeId;
        this.powerGroupings.registerPower({ ...power, aptitudeSlug }, power.properties);
      }
      this.powers.readGroupings();
    }

    /**
     * Tags the spells of each list one of the character's feats brings (`featListIds`: it gives slots in it or joins it
     * to its class's list) with the feat's name: a cleric's domain spells "Fire Domain", a specialist wizard's school
     * spells "Evocation Specialist". A tag shows on that list and on the lists of the class whose level gave the feat.
     */
    protected buildSpellTags(feats: CustomizedFeat[], featListIds: Set<string>) {
      const aptitudes = this.aptitudes.getAptitudes();
      const classNameByKlassLevelId = this.classNameByKlassLevelId();
      const tagsByAptitudeId = new Map<string, string[]>();
      for (const feat of feats) {
        const className = classNameByKlassLevelId.get(feat.klassLevelId);
        const classListIds = className
          ? this.spellListsOf(className).flatMap((key) => (aptitudes[key] ? [aptitudes[key].id] : []))
          : [];
        const lists = new Set(feat.modifiers.flatMap((modifier) => SpellLists.listOpenedBy(modifier.target) ?? []));
        for (const list of lists) {
          const aptitude = aptitudes[list];
          if (!aptitude || !featListIds.has(aptitude.id)) continue;
          const joinsClassList = feat.modifiers.some((modifier) => AptitudeTargets.parseJoin(modifier.target) === list);
          // A feat opening several lists shows its tag on each of them
          const tagged = this.spellTagLists[feat.name] ?? { aptitudeIds: classListIds, joinsClassList: false };
          this.spellTagLists[feat.name] = {
            aptitudeIds: [...new Set([aptitude.id, ...tagged.aptitudeIds])],
            joinsClassList: tagged.joinsClassList || joinsClassList,
          };
          tagsByAptitudeId.set(aptitude.id, [...(tagsByAptitudeId.get(aptitude.id) ?? []), feat.name]);
        }
      }
      if (tagsByAptitudeId.size === 0) return;

      for (const link of this.powerAptitudeLinks) {
        for (const tag of tagsByAptitudeId.get(link.aptitudeId) ?? []) {
          if (!this.spellTags[link.powerId]) this.spellTags[link.powerId] = [];
          this.spellTags[link.powerId].push(tag);
        }
      }
    }

    /**
     * The spells of the lists the character knows every spell of (or a level of), off the view, with their properties
     * and the lists each is on.
     */
    protected collectAptitudePowers(rulesetData: RulesetData, powers: CustomizedPower[], appliedModifiers: Modifier[]) {
      const { perAptitudeLevels, unleveledAptitudeIds } = this.knownAptitudeLevels(appliedModifiers);
      if (perAptitudeLevels.size === 0 && unleveledAptitudeIds.size === 0) return;

      // Iterate the composed powers once, emitting one row per matching
      // (power, aptitude) link — mirrors the old SQL join shape.
      const allAptitudePowers: Array<
        Power & { aptitudeId: string; powerLevel: number | null; saveName: string | null }
      > = [];
      for (const power of rulesetData.powers) {
        const saveName = PowersComponent.saveNameOf(power, rulesetData);
        for (const link of power.powersAptitudesInRules) {
          const leveledSet = perAptitudeLevels.get(link.aptitudeId);
          const isLeveled = leveledSet !== undefined && link.level !== null && leveledSet.has(link.level);
          const isUnleveled = unleveledAptitudeIds.has(link.aptitudeId);
          if (!isLeveled && !isUnleveled) continue;
          allAptitudePowers.push({
            ...power,
            aptitudeId: link.aptitudeId,
            powerLevel: link.level,
            saveName,
          });
        }
      }

      this.allAptitudePowers = allAptitudePowers;
      if (this.allAptitudePowers.length === 0) return;

      // Gather properties (own + template via sourceItemId-style inheritance does
      // not apply to powers) and the power→aptitude link table from the cache.
      // Virtuals already live in `powers` with their properties attached, so
      // they no longer need to be folded into `aptitudePowerProperties`.
      const aptitudePowerIds = new Set(this.allAptitudePowers.map((p) => p.id));
      const propertyEntityIds = new Set<string>(aptitudePowerIds);

      const properties: Property[] = [];
      for (const id of propertyEntityIds) {
        const ps = rulesetData.propertiesByEntity.get(id);
        if (ps) properties.push(...ps);
      }

      const allPowerIdSet = new Set<string>([...powers.map((p) => p.id), ...aptitudePowerIds]);
      const powerAptitudeLinks: { aptitudeId: string; powerId: string }[] = [];
      for (const id of allPowerIdSet) {
        const p = rulesetData.powersById.get(id);
        if (!p) continue;
        for (const link of p.powersAptitudesInRules)
          powerAptitudeLinks.push({ powerId: p.id, aptitudeId: link.aptitudeId });
      }

      this.aptitudePowerProperties = properties;
      this.powerAptitudeLinks = powerAptitudeLinks;
    }

    /** The spells the character's lists make it know, added to its powers with their DCs. */
    protected enrichAllKnownPowers(
      rulesetData: RulesetData,
      powers: CustomizedPower[],
      klassBonusSpellAbilityMap: Map<string, string>,
      appliedModifiers: Modifier[],
    ) {
      if (this.allAptitudePowers.length === 0) return;
      const newPowers = this.newKnownPowers(powers, appliedModifiers, klassBonusSpellAbilityMap);
      if (newPowers.length > 0) this.registerKnownPowers(rulesetData, newPowers);
    }

    getSpellTagLists() {
      return this.spellTagLists;
    }

    getSpellTags() {
      return this.spellTags;
    }
  }
  return WithKnownPowers;
}
