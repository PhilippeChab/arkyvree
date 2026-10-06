/** A school of magic a wizard can specialize in, and how many schools its specialist gives up. */
export type WizardSchoolDefinition = {
  name: string;
  description: string;
  prohibitedSchoolCount: number;
};
