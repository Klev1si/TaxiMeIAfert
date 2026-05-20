/**
 * Safely converts any API error message value to a string for Alert.alert.
 *
 * Background: React Native's Android Alert bridge requires a plain string.
 * NestJS can return `message` as:
 *   - string          → returned as-is
 *   - string[]        → joined with newlines
 *   - ValidationError[] (from @ValidateNested) → constraints extracted recursively
 *   - object / other  → fallback returned
 *
 * Passing a non-string directly to Alert.alert crashes on Android:
 *   "Value for message cannot be cast from ReadableNativeMap to String"
 */

/** Recursively extract human-readable messages from a NestJS ValidationError tree. */
function extractValidationMessages(errors: unknown[]): string[] {
  const messages: string[] = [];
  for (const item of errors) {
    if (typeof item === 'string') {
      messages.push(item);
    } else if (item && typeof item === 'object') {
      const e = item as Record<string, unknown>;
      // NestJS ValidationError: { property, constraints?, children? }
      if (e.constraints && typeof e.constraints === 'object') {
        messages.push(...(Object.values(e.constraints) as string[]));
      }
      if (Array.isArray(e.children) && e.children.length > 0) {
        messages.push(...extractValidationMessages(e.children));
      }
    }
  }
  return messages;
}

export function toAlertString(
  raw: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw)) {
    const messages = extractValidationMessages(raw);
    return messages.join('\n') || fallback;
  }
  // Defense: handle objects with a nested .message (e.g. double-wrapped responses)
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj.message !== undefined) {
      return toAlertString(obj.message, fallback);
    }
  }
  return fallback;
}
