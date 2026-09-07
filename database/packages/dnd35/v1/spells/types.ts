export type PowerSeed = {
  name: string;
  description: string;
  aptitudes: string[];
  aptitudeLevels?: Record<string, number>;
  savingThrow?: string;
  properties: { type: string; value: string }[];
};
