/** Canonical JSON pointer syntax (empty property names are allowed; root is not a field). */
export const isFieldPointer = (value: string) =>
  value.startsWith("/") && !/~(?:[^01]|$)/.test(value);
export const escapePointerPart = (value: string) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");
export const fieldPointer = (value: string) =>
  value.startsWith("/") ? value : "/" + escapePointerPart(value);
export const pointerParts = (value: string) =>
  fieldPointer(value)
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
