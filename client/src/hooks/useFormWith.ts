import { type DefaultValues, type FieldValues, useForm, type UseFormProps } from "react-hook-form";

/**
 * A form whose every field starts with a value: `defaultValues` is a whole `T` (an empty text is `""`, an unset number
 * `NaN`), which TypeScript checks against the form's type. A controlled field submits only what the form holds, so a
 * field it doesn't hold would reach the server as missing.
 */
export function useFormWith<T extends FieldValues>(
  defaultValues: T & DefaultValues<T>,
  options?: Omit<UseFormProps<T>, "defaultValues">,
) {
  return useForm<T>({ ...options, defaultValues });
}
