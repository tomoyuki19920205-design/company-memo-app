/** Return null while the mobile list is hidden; its measurements are invalid. */
export function requiredListBottomSpace(
  target: number,
  clientHeight: number,
  scrollHeight: number,
  currentSpace: number,
): number | null {
  if (clientHeight === 0) return null;
  const naturalHeight = scrollHeight - currentSpace;
  return Math.max(0, Math.ceil(target + clientHeight - naturalHeight));
}
