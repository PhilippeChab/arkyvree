import type { CharacterRows } from "@/engine/core/module/index.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import { type RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** A 3.5 character's build: its data loaded, its components initialized, its modifiers applied in rounds. */
export function Builds<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Building extends Base {
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
      const groups = this.data.requirementGroups.filter((group) => group.length > 0);
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
        const blocked = round.getBlockedKeys();
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
      const blockedAtTheEnd = this.requirementEvaluator.getBlockedKeys();
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
    protected hasFeatWith(rule: "oversizedTwoWeaponFighting" | "weaponFinesse"): boolean {
      return this.rulesetData.feats.some(
        (feat) =>
          (this.components.feats.getFeat(feat.name)?.possessed ?? false) &&
          FEAT_FIELDS.read(this.rulesetData.propertiesByEntity.get(feat.id) ?? [])[rule],
      );
    }

    protected normalizeData(): void {
      this.components.classes.initialize(
        this.data.klasses,
        this.data.klassSkills,
        this.data.klassLevels,
        this.data.characterLevels,
        this.data.feats,
        this.data.skills,
        this.data.powers,
        this.rulesetData.klasses,
      );
      this.components.abilities.initialize(this.data.characterAbilityScores, this.data.characterLevels);
      this.components.identity.initialize(this.character, this.data.race, this.data.languages);
      this.components.aptitudes.initialize(
        this.rulesetData.aptitudes,
        this.data.klassLevelFeatCountsByAptitudeId,
        this.data.klassLevelPowerCountsByAptitudeId,
        SpellLists.of(this.rulesetData).leveledAptitudeIds,
      );
      this.components.feats.initialize(this.rulesetData.feats, this.data.feats);
      // Every feat of a family, had or not, so a check of any of them reads the whole family
      const rulesetFeatsById = new Map(this.rulesetData.feats.map((feat) => [feat.id, feat]));
      for (const prop of this.rulesetData.propertiesByEntityType.get("feats") ?? []) {
        const feat = rulesetFeatsById.get(prop.entityId);
        if (feat) this.components.featGroupings.registerFeat(feat, [prop]);
      }
      this.components.featGroupings.seedEmptyFamilies(FEAT_FAMILIES);
      this.components.feats.injectGroupings(this.components.featGroupings.getFeatGroupings());
      this.components.skills.initialize(
        this.rulesetData.skills,
        this.data.skillPointAbilityId,
        this.data.klassLevelProperties,
        this.data.skillFields,
      );
      this.components.saves.initialize(this.rulesetData.saves, this.data.klassLevelSaves);
      this.components.combat.initialize(this.data.race, this.data.klassLevelProperties);
      this.components.inventory.initialize(this.data.inventory);
      this.components.encumbrance.initialize(this.data.inventory);
      this.components.powers.initialize(this.data.powers, this.rulesetData.powers, SpellLists.of(this.rulesetData));

      // Seed empty buckets for every school/descriptor in the ruleset so a
      // Spell Focus targeting a school the character has no spells in resolves
      // (zero matches → inactive) rather than failing path traversal (skipped).
      const groupingValues = new Set<string>();
      for (const prop of this.rulesetData.propertiesByEntityType.get("powers") ?? [])
        if (prop.type === SPELL_SCHOOL || prop.type === SPELL_DESCRIPTOR) groupingValues.add(prop.value);

      this.components.powerGroupings.seedEmptyGroupings([...groupingValues]);

      // Each class casts a spell with its DC (the loader's `abilityDcName`): keyed by the class's aptitude, as the spell's
      // known flags are
      const { spellSlugByAptitudeId } = SpellLists.of(this.rulesetData);
      for (const power of this.data.powers) {
        const aptitudeSlug = spellSlugByAptitudeId.get(power.aptitudeId) ?? power.aptitudeId;
        this.components.powerGroupings.registerPower({ ...power, aptitudeSlug }, power.properties);
      }
      this.components.powers.seedEmptyDcs(this.rulesetData.powers);
      this.components.powers.injectGroupings(this.components.powerGroupings.getPowerGroupings());
    }

    protected postModifierProcessing(): void {
      const { rulesetData } = this;
      const { characterLevels, feats, klassBonusSpellAbilityMap, klassLevels, powers } = this.data;
      const character = { characterLevels, feats, klassBonusSpellAbilityMap, klassLevels, powers };
      // A target counted as met reads as one any value meets: a class's level gate, which its spell levels replace
      const isGateMet = (modifier: Modifier, metTargets: string[] = []) =>
        this.areRequirementsMet([
          (rulesetData.requirementsByEntity.get(modifier.id) ?? []).map((requirement) =>
            requirement.target && metTargets.includes(requirement.target)
              ? { ...requirement, operator: "greater_than_or_equal", value: "0", valueType: "number" }
              : requirement,
          ),
        ]);
      this.components.spellcasting.finalize(rulesetData, this.components, character, isGateMet);
    }

    protected postRequirementProcessing(): void {
      // A weapon's proficiency is its base item's requirements (the loader's `toCustomizedInventory`), apart from its
      // others, read of the entry holding it: a bastard sword's in the hands it's in, each of an item's entries alone
      const unproficient = this.data.inventory
        .filter((inv) => inv.equipped && !this.areRequirementsMet([inv.item.proficiency], { sourceId: inv.id }))
        .map((inv) => ({ id: inv.id, itemId: inv.item.id }));
      this.components.combat.applyProficiencyPenalties(unproficient);
    }

    protected preRequirementProcessing(): void {
      this.components.spellcasting.initialize(this.rulesetData, this.data.klassCasterTypeMap);
      // The loaded feats include those possession modifiers give: a finessed weapon's attack is what requirements read
      this.components.combat.applyWeaponFinesse(this.hasFeatWith("weaponFinesse"));
      this.components.combat.applyOversizedTwoWeaponFighting(this.hasFeatWith("oversizedTwoWeaponFighting"));
    }

    /**
     * Builds the character from its rows (`rows`) in its ruleset's `view`: it reads nothing. A bonded creature's `master`
     * comes built (`DetailedCharacterBonded`); a character of its own needs none.
     */
    build(rows: CharacterRows, view: RulesetView, _master?: DetailedCharacter) {
      // 1. Assemble the data from the rows and the view: the feats and spells possession modifiers grant included
      this.view = view;
      this.data = this.createDataLoader().load(rows, view);

      // 2. Normalize: each component's initialize, from the loaded data
      this.normalizeData();

      // 3. The components the evaluators walk
      this.builtComponents = this.components;

      // 4. Pre-requirement processing (the spellcasting component, a bonded creature's master and stat block)
      this.preRequirementProcessing();

      // 5. Post-requirement processing (proficiency penalties, which check requirements of their own)
      this.postRequirementProcessing();

      // 6. Non-power modifiers, and the requirements that gate them
      const powerModifiers = this.data.modifiers.filter((m) => PowersPaths.isPowerTarget(m.target));
      const otherModifiers = this.data.modifiers.filter((m) => !PowersPaths.isPowerTarget(m.target));
      this.applyModifiersInRounds(otherModifiers);

      // 7. Post-modifier processing: the spellcasting (bonus caster levels, bonus spells, known spells)
      this.postModifierProcessing();

      // 8. Power modifiers, gated by the final requirement evaluation
      this.modifierEvaluator.evaluateModifiers(this.builtComponents, powerModifiers, this.requirementEvaluator);
    }
  }

  return Building;
}
