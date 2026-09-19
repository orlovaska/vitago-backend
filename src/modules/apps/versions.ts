/** `major.minor.patch`, as shown in the stores. */
export const VERSION_PATTERN = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
