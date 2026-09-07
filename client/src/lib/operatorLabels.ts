export const MODIFIER_OPERATOR_LABELS: Record<string, string> = {
  set: "=",
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
};

export const REQUIREMENT_OPERATOR_LABELS: Record<string, string> = {
  equal: "==",
  not_equal: "!=",
  greater_than: ">",
  less_than: "<",
  greater_than_or_equal: ">=",
  less_than_or_equal: "<=",
};

export const OPERATOR_LABELS: Record<string, string> = {
  ...MODIFIER_OPERATOR_LABELS,
  ...REQUIREMENT_OPERATOR_LABELS,
};
