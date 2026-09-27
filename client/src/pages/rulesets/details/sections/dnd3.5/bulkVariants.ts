export interface VariantRow {
  name: string;
  description?: string;
}

export interface BulkVariantsFormValues {
  variants: VariantRow[];
}

/** The nth variant row of an item: its name numbered, its description copied. */
export const variantRow = (item: { name: string; description?: string | null }, copyNumber: number): VariantRow => ({
  name: `${item.name} (Copy ${copyNumber})`,
  description: item.description ?? "",
});
