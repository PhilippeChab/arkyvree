/** What a modifier's or a requirement's edit dialog sends of its condition. */

/** A condition's form's text: its target path and its value. */
interface ConditionText {
  target?: string;
  value?: string;
}

/** Whether a dialog's field holds other text than it opened on: one it doesn't send (a group's) is unchanged. */
function isChanged(sent: string | undefined, opened: string | undefined) {
  return sent !== undefined && sent !== opened;
}

/**
 * A condition's edit as its dialog sends it (`data`, from the form it opened on, `opened`): its target and its value
 * only when its author changed them. The server keeps what one it isn't sent means, so a dialog opened before an entity
 * was renamed saves a new operator or value without reading the old name again, which names nothing since, or another
 * entity that took it.
 */
export function toConditionEdit<T extends ConditionText>(data: T, opened: ConditionText) {
  const { target, value, ...rest } = data;
  return {
    ...rest,
    ...(isChanged(target, opened.target) && { target }),
    ...(isChanged(value, opened.value) && { value }),
  };
}
