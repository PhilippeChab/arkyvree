export interface ClassesHooks {
  /** Extract spellcasting-related property values from raw class properties. */
  readClassProperties(
    properties: { id: string; type: string; value: string }[],
  ): {
    bonusSpellAbilityId: string | null;
    bonusSpellPropertyId: string | null;
    casterTypeValue: string | null;
    casterTypePropertyId: string | null;
  };
}
