import type { Db } from "@/server/database/index.ts";
import {
  Aptitudes,
  PowersAptitudes,
  Properties,
} from "@/server/repositories/index.ts";
import type { PowerBody, PowersHooks } from "@/server/rulesets/hooks/PowersHooks.ts";
import { SPELL_SCHOOL } from "@/server/rulesets/dnd3.5/properties/index.ts";
import {
  deleteSpellFocusFeats,
  generateSpellFocusFeats,
  generateSpellProperties,
  type SpellFields,
} from "./generators/spellGenerator.ts";

export class Dnd35PowersHooks implements PowersHooks {
  readonly primaryGroupingType = SPELL_SCHOOL;

  extractGroupingValue(body: PowerBody): string | null {
    return typeof body.school === "string" && body.school.length > 0 ? body.school : null;
  }

  async generateProperties(tx: Db, powerId: string, body: PowerBody): Promise<void> {
    const fields = this.extractSpellFields(body);
    if (!fields) return;
    await generateSpellProperties(tx, powerId, fields);
  }

  async generateGroupingFeats(tx: Db, rulesetId: string, sourceChain: string[], value: string): Promise<void> {
    await generateSpellFocusFeats(tx, rulesetId, sourceChain, value);
  }

  async deleteGroupingFeats(tx: Db, rulesetId: string, sourceChain: string[], value: string): Promise<void> {
    await deleteSpellFocusFeats(tx, rulesetId, sourceChain, value);
  }

  async afterPowerLinked(tx: Db, powerId: string, rulesetId: string, sourceChain: string[]): Promise<void> {
    // Get the power's school from properties
    const schoolProps = await Properties.findManyByEntity(tx, {
      entityIds: [powerId],
      entityType: "powers",
      type: SPELL_SCHOOL,
    });
    if (schoolProps.length === 0) return;

    const school = schoolProps[0].value;
    if (school === "Universal") return;

    // Find the specialist aptitude in this ruleset or ancestors
    const specialistAptName = `${school} Specialist Spells`;
    let specialistApt = await Aptitudes.findOne(tx, { name: specialistAptName, rulesetId });
    if (!specialistApt) {
      for (const ancestorId of sourceChain) {
        specialistApt = await Aptitudes.findOne(tx, { name: specialistAptName, rulesetId: ancestorId });
        if (specialistApt) break;
      }
    }
    if (!specialistApt) return;

    // Check if already linked
    const existing = await PowersAptitudes.findOne(tx, { powerId, aptitudeId: specialistApt.id });
    if (existing) return;

    // Find the "Wizard Spells" link to get the level and abilityDcId
    let wizardApt = await Aptitudes.findOne(tx, { name: "Wizard Spells", rulesetId });
    if (!wizardApt) {
      for (const ancestorId of sourceChain) {
        wizardApt = await Aptitudes.findOne(tx, { name: "Wizard Spells", rulesetId: ancestorId });
        if (wizardApt) break;
      }
    }
    if (!wizardApt) return;

    const wizardLink = await PowersAptitudes.findOne(tx, { powerId, aptitudeId: wizardApt.id });
    if (!wizardLink) return;

    await PowersAptitudes.create(tx, {
      powerId,
      aptitudeId: specialistApt.id,
      level: wizardLink.level,
    });
  }

  private extractSpellFields(body: PowerBody): SpellFields | null {
    if (typeof body.school !== "string" || body.school.length === 0) return null;
    return {
      school: body.school,
      subschool: body.subschool,
      descriptors: body.descriptors,
      castingTime: body.castingTime,
      rangeType: body.rangeType,
      target: body.target,
      areaOfEffect: body.areaOfEffect,
      duration: body.duration,
      spellResistance: body.spellResistance,
      components: body.components,
    };
  }
}
