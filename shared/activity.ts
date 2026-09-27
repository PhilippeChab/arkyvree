/** One field an update changed, as an activity records it; long text fields carry no values. */
export interface ChangedField {
  field: string;
  from?: string;
  to?: string;
}
