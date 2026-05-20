/**
 * Lightweight semver comparison for version strings like "1.2.3".
 *
 * Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) { return -1; }
    if (na > nb) { return  1; }
  }
  return 0;
}

/** Returns true if version `a` is strictly less than version `b`. */
export function isOlderThan(a: string, b: string): boolean {
  return compareSemver(a, b) === -1;
}
