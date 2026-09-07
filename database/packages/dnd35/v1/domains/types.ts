export type DomainSpellEntry = {
  name: string;
  level: number; // spell level in this domain (1-9)
};

export type DomainDefinition = {
  name: string;
  description: string;
  modifiers?: { target: string; operator: string; value: string; valueType: string }[];
  properties?: { type: string; value: string }[];
  spells: DomainSpellEntry[];
};
