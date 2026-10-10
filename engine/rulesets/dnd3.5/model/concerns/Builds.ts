import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

/**
 * A 3.5 character's build steps, which core's build runs (`CharacterBase.build`): its components set up, its
 * spellcasting and weapon rules before the requirements, its proficiency penalties, its spellcasting after the
 * modifiers, and its spells' DCs applied last.
 */
export function Builds<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Building extends Base {
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

    /** Whether a modifier applies after the spellcasting: a spell's DC, which its school's and its list's read. */
    protected isLateModifier(modifier: Modifier): boolean {
      return PowersPaths.isPowerTarget(modifier.target);
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
      this.components.abilities.initialize(this.data.characterAbilityScores, this.data.abilityIncreases);
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
  }

  return Building;
}
