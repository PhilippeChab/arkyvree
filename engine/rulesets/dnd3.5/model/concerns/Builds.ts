import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import { type LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import type { ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/model/projection.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** A 3.5 character's build: its data loaded, its components initialized, its modifiers applied in rounds. */
export function Builds<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Building extends Base {
    protected applyLoadedData(data: LoadedCharacterData) {
      this.ruleset = data.ruleset;
      this.player = data.player;
      this.campaign = data.campaign;
      this.rulesetAbilities = data.rulesetAbilities;
      this.rulesetSaves = data.rulesetSaves;
      this.rulesetSkills = data.rulesetSkills;
      this.rulesetFeats = data.rulesetFeats;
      this.rulesetFeatProperties = data.rulesetFeatProperties;
      this.rulesetPowers = data.rulesetPowers;
      this.rulesetPowerProperties = data.rulesetPowerProperties;
      this.rulesetAptitudes = data.rulesetAptitudes;
      this.rulesetKlasses = data.rulesetKlasses;
      this.leveledAptitudeIds = data.leveledAptitudeIds;
      this.featListIds = data.featListIds;
      this.characterAbilityScores = data.characterAbilityScores;
      this.race = data.race;
      this.languages = data.languages;
      this.inventory = data.inventory;
      this.characterLevels = data.characterLevels;
      this.klassLevels = data.klassLevels;
      this.klassSkills = data.klassSkills;
      this.klassLevelSaves = data.klassLevelSaves;
      this.klasses = data.klasses;
      this.feats = data.feats;
      this.skills = data.skills;
      this.powers = data.powers;
      this.klassLevelFeatCountsByAptitudeId = data.klassLevelFeatCountsByAptitudeId;
      this.klassLevelPowerCountsByAptitudeId = data.klassLevelPowerCountsByAptitudeId;
      this.modifiers = data.modifiers;
      this.itemModifiers = new Map(
        data.modifiers.filter((m) => m.sourceType === "items").map((m) => [m.id, m.sourceId]),
      );
      this.requirementGroups = data.requirementGroups;
      this.validRulesetIds = data.validRulesetIds;
      this.skillPointAbilityId = data.skillPointAbilityId;
      this.skillFields = data.skillFields;
      this.klassLevelProperties = data.klassLevelProperties;
      this.klassBonusSpellAbilityMap = data.klassBonusSpellAbilityMap;
      this.klassCasterTypeMap = data.klassCasterTypeMap;
    }

    /**
     * Applies the modifiers in rounds, so a modifier's requirements read the sheet the other modifiers have already
     * changed (an item's Strength counts toward a feat's prerequisite): first those no requirement gates, then, round
     * after round, the gated ones whose requirements the sheet now meets, until a round applies none. Each round checks
     * only the requirements gating a modifier still waiting. A template modifier, which reads the sheet, applies last.
     * The requirements are evaluated once more on the final sheet: the evaluation the templates, the power modifiers and
     * the validation read.
     */
    private applyModifiersInRounds(modifiers: Modifier[]): void {
      const components = this.builtComponents!;
      const groups = this.requirementGroups.filter((group) => group.length > 0);
      const gateKey = (r: Requirement) => `${r.entityId}:${r.entityType}`;
      const keysOf = (m: Modifier) => [`${m.sourceId}:${m.sourceType}`, `${m.id}:modifiers`];
      const gateKeys = new Set(groups.flatMap((group) => group.map(gateKey)));
      const literal = modifiers.filter((m) => !isTemplateValue(m.value));

      for (const modifier of literal.filter((m) => !keysOf(m).some((key) => gateKeys.has(key))))
        this.modifierEvaluator.evaluateModifier(modifier, components);

      let waiting = literal.filter((m) => keysOf(m).some((key) => gateKeys.has(key)));
      const appliedGated: Modifier[] = [];
      while (waiting.length > 0) {
        const waitingKeys = new Set(waiting.flatMap(keysOf));
        const round = new RequirementEvaluator(this.targetPaths);
        round.evaluateRequirements(
          components,
          groups.filter((group) => group.some((r) => waitingKeys.has(gateKey(r)))),
          this.itemOf,
        );
        const blocked = ModifierEvaluator.blockedKeys(round);
        const ready = waiting.filter((m) => !keysOf(m).some((key) => blocked.has(key)));
        if (ready.length === 0) break;
        for (const modifier of ready) this.modifierEvaluator.evaluateModifier(modifier, components);
        appliedGated.push(...ready);
        waiting = waiting.filter((m) => !ready.includes(m));
      }

      this.requirementEvaluator.evaluateRequirements(components, groups, this.itemOf);
      // A modifier can break a requirement already met, another's or its own: the modifiers it gated stay applied (undoing
      // them could loop, two modifiers breaking each other's), and validation reports them. A ready one a round skipped,
      // or that reached nothing, didn't apply
      const blockedAtTheEnd = ModifierEvaluator.blockedKeys(this.requirementEvaluator);
      const appliedIds = new Set(this.modifierEvaluator.getModifiers().appliedModifiers.map((m) => m.id));
      this.modifiersPastTheirGates = appliedGated.filter(
        (m) => appliedIds.has(m.id) && keysOf(m).some((key) => blockedAtTheEnd.has(key)),
      );
      // The modifiers still waiting are recorded as gated out; the templates apply, or are, by the final evaluation
      this.modifierEvaluator.evaluateModifiers(
        components,
        [...waiting, ...modifiers.filter((m) => isTemplateValue(m.value))],
        this.requirementEvaluator,
      );
    }

    /**
     * Whether the character has a feat that changes this weapon rule (Weapon Finesse's): picked, granted or given by a
     * modifier. Only the feats it has are read.
     */
    protected hasFeatWith(rulesetData: RulesetData, rule: "oversizedTwoWeaponFighting" | "weaponFinesse"): boolean {
      return rulesetData.feats.some(
        (feat) =>
          (this.components.feats.getFeat(feat.name)?.possessed ?? false) &&
          FEAT_FIELDS.read(rulesetData.propertiesByEntity.get(feat.id) ?? [])[rule],
      );
    }

    protected normalizeData(): void {
      this.components.classes.initialize(
        this.klasses,
        this.klassSkills,
        this.klassLevels,
        this.characterLevels,
        this.feats,
        this.skills,
        this.powers,
        this.rulesetKlasses,
      );
      this.components.abilities.initialize(this.characterAbilityScores, this.characterLevels);
      this.components.identity.initialize(this.character, this.race, this.languages);
      this.components.skills.setSkillPointDependencies(
        this.rulesetAbilities,
        this.skillPointAbilityId,
        this.klassLevelProperties,
      );
      this.components.aptitudes.initialize(
        this.rulesetAptitudes,
        this.klassLevelFeatCountsByAptitudeId,
        this.klassLevelPowerCountsByAptitudeId,
        this.leveledAptitudeIds,
      );
      this.components.feats.initialize(this.rulesetFeats, this.feats);
      // Every feat of a family, had or not, so a check of any of them reads the whole family
      const rulesetFeatsById = new Map(this.rulesetFeats.map((feat) => [feat.id, feat]));
      for (const prop of this.rulesetFeatProperties) {
        const feat = rulesetFeatsById.get(prop.entityId);
        if (feat) this.components.featGroupings.registerFeat(feat, [prop]);
      }
      this.components.featGroupings.seedEmptyFamilies(FEAT_FAMILIES);
      this.components.feats.injectGroupings(this.components.featGroupings.getFeatGroupings());
      this.components.skills.initialize(this.rulesetSkills, this.rulesetAbilities, this.race.size, this.skillFields);
      this.components.savingThrows.initialize(this.rulesetSaves, this.rulesetAbilities, this.klassLevelSaves);
      this.components.combat.initialize(this.race, this.klassLevelProperties);
      this.components.inventory.initialize(this.inventory);
      this.components.encumbrance.initialize(this.inventory, this.race);
      this.components.powers.initialize(this.powers, this.rulesetPowers, this.rulesetAptitudes, this.featListIds);

      // Seed empty buckets for every school/descriptor in the ruleset so a
      // Spell Focus targeting a school the character has no spells in resolves
      // (zero matches → inactive) rather than failing path traversal (skipped).
      const groupingValues = new Set<string>();
      for (const prop of this.rulesetPowerProperties)
        if (prop.type === SPELL_SCHOOL || prop.type === SPELL_DESCRIPTOR) groupingValues.add(prop.value);

      this.components.powerGroupings.seedEmptyGroupings([...groupingValues]);

      // Build aptitudeId → DC ability lookup from real spells once so virtual
      // spells (granted via `set powers.X.Y.known`) — which carry no klass
      // level pointer — can resolve their DC ability via their aptitudeId.
      const aptitudeIdToAbilityName = new Map<string, string>();
      for (const power of this.powers) {
        if (power.virtual) continue;
        const klassLevel = this.klassLevels.find((kl) => kl.id === power.klassLevelId);
        if (!klassLevel) continue;
        const abilityName = this.klassBonusSpellAbilityMap.get(klassLevel.klassId);
        if (abilityName) aptitudeIdToAbilityName.set(power.aptitudeId, abilityName);
      }

      // Each class casts a spell with its DC: keyed by the class's aptitude, as the spell's known flags are
      const aptitudeSlugById = new Map(this.rulesetAptitudes.map((apt) => [apt.id, toSpellPossessionSlug(apt.name)]));
      for (const power of this.powers) {
        let abilityDcName: string | null = null;
        if (power.virtual) {
          abilityDcName = aptitudeIdToAbilityName.get(power.aptitudeId) ?? null;
        } else {
          const klassLevel = this.klassLevels.find((kl) => kl.id === power.klassLevelId);
          if (klassLevel) abilityDcName = this.klassBonusSpellAbilityMap.get(klassLevel.klassId) ?? null;
        }
        const aptitudeSlug = aptitudeSlugById.get(power.aptitudeId) ?? power.aptitudeId;
        this.components.powerGroupings.registerPower({ ...power, abilityDcName, aptitudeSlug }, power.properties);
      }
      this.components.powers.seedEmptyDcs(this.rulesetPowers);
      this.components.powers.injectGroupings(this.components.powerGroupings.getPowerGroupings());

      this.components.skills.updateSkillPointTotals();
    }

    protected postModifierProcessing(rulesetData: RulesetData): void {
      this.components.spellcasting.fetchBonusCasterLevelData(
        rulesetData,
        this.klassLevels,
        this.feats,
        this.characterLevels,
        this.rulesetKlasses,
      );
      this.components.spellcasting.applyBonusCasterLevelModifiers(
        this.components!,
        this.feats,
        this.featListIds,
        // A target counted as met reads as one any value meets: a class's level gate, which its spell levels replace
        (modifier, metTargets = []) =>
          this.areRequirementsMet([
            (rulesetData.requirementsByEntity.get(modifier.id) ?? []).map((requirement) =>
              requirement.target && metTargets.includes(requirement.target)
                ? { ...requirement, operator: "greater_than_or_equal", value: "0", valueType: "number" }
                : requirement,
            ),
          ]),
      );
      this.components.spellcasting.applyBonusSpellsFromAbilities(this.klassBonusSpellAbilityMap);
      this.components.spellcasting.computeSpellcasting(this.klassCasterTypeMap);
      this.components.spellcasting.fetchAptitudePowerData(rulesetData, this.powers);
      this.components.spellcasting.enrichAllKnownPowers(
        this.powers,
        this.klassLevels,
        this.rulesetAptitudes,
        this.klassBonusSpellAbilityMap,
      );
      this.components.spellcasting.buildSpellTags(this.feats, this.featListIds);
    }

    protected postRequirementProcessing(): void {
      // A weapon's proficiency is its base item's requirements (the loader's `toCustomizedInventory`), apart from its
      // others, read of the entry holding it: a bastard sword's in the hands it's in, each of an item's entries alone
      const unproficient = this.inventory
        .filter((inv) => inv.equipped && !this.areRequirementsMet([inv.item.proficiency], { sourceId: inv.id }))
        .map((inv) => ({ id: inv.id, itemId: inv.item.id }));
      this.components.combat.applyProficiencyPenalties(unproficient);
    }

    protected preApplyPossessionModifiers() {
      for (const mod of this.modifiers) {
        if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;

        const featSlug = FeatsPaths.parsePossessed(mod.target);
        if (featSlug !== undefined) {
          const feat = this.components.feats.getFeat(featSlug);
          if (feat && !feat.possessed) {
            feat.possessed = true;
            feat.count += 1;
          }
          continue;
        }

        const known = PowersPaths.parseKnown(mod.target);
        if (known) {
          const spell = this.components.powers.getSpellEntry(known.spell, known.list);
          if (spell && !spell.known) spell.known = true;
        }
      }
    }

    protected preRequirementProcessing(rulesetData: RulesetData): void {
      this.components.spellcasting.loadClassLists(rulesetData);
      this.components.spellcasting.initCasterLevels(this.modifiers, this.klassCasterTypeMap);
      // Possession modifiers have given their feats: a finessed weapon's attack is what requirements read
      this.components.combat.applyWeaponFinesse(this.hasFeatWith(rulesetData, "weaponFinesse"));
      this.components.combat.applyOversizedTwoWeaponFighting(
        this.hasFeatWith(rulesetData, "oversizedTwoWeaponFighting"),
      );
    }

    /**
     * Builds the character from its rows (`rows`) in its ruleset's `view`, with a level-up's `projectedData`: it reads
     * nothing. A bonded creature's `master` comes built (`DetailedCharacterBonded`); a character of its own needs none.
     */
    build(rows: CharacterRows, view: RulesetView, projectedData?: ProjectedCharacterData, _master?: DetailedCharacter) {
      const { rulesetData } = view;
      // 1. Assemble the data from the rows and the view
      this.applyLoadedData(this.createDataLoader().load(rows, view, projectedData));

      // 2. Normalize: each component's initialize, from the loaded data
      this.normalizeData();

      // 3. Pre-apply possession modifiers: the feats and spells they grant, before anything reads them
      this.preApplyPossessionModifiers();

      // 4. The components the evaluators walk
      this.builtComponents = this.components;

      // 5. Pre-requirement processing (the spellcasting component, a bonded creature's master and stat block)
      this.preRequirementProcessing(rulesetData);

      // 6. Post-requirement processing (proficiency penalties, which check requirements of their own)
      this.postRequirementProcessing();

      // 7. Non-power modifiers, and the requirements that gate them
      const powerModifiers = this.modifiers.filter((m) => PowersPaths.isPowerTarget(m.target));
      const otherModifiers = this.modifiers.filter((m) => !PowersPaths.isPowerTarget(m.target));
      this.applyModifiersInRounds(otherModifiers);

      // 8. Post-modifier processing: the spellcasting (bonus caster levels, bonus spells, known spells)
      this.postModifierProcessing(rulesetData);

      // 9. Power modifiers, gated by the final requirement evaluation
      this.modifierEvaluator.evaluateModifiers(this.builtComponents, powerModifiers, this.requirementEvaluator);
    }
  }

  return Building;
}
