/**
 * A row's columns in the order its module declares its answers give them (`order`), or as they are: an order that
 * leaves one out or names one the row lacks is refused.
 */
export function sortColumns<C>(columns: Record<string, C>, order: string[] | undefined): Record<string, C> {
  if (order === undefined) return columns;
  const names = Object.keys(columns);
  if (order.length !== names.length || names.some((name) => !order.includes(name)))
    throw new Error(`The order ${order.join(", ")} isn't the row's columns ${names.join(", ")}`);
  return Object.fromEntries(order.map((name) => [name, columns[name]]));
}
