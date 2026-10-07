/** A power's fields its properties hold: a spell's school, components, range… */
export interface PowerFields {
  areaOfEffect?: string;
  castingTime?: string;
  components?: string[];
  descriptors?: string[];
  duration?: string;
  rangeType?: string;
  school?: string;
  spellResistance?: string;
  subschool?: string;
  target?: string;
}

/** The rules a power follows: how it's grouped (a spell's school). */
export interface PowersRules {
  extractGroupingValue(fields: PowerFields): string | null;
  readProperties(properties: { type: string; value: string }[]): PowerFields;
}
