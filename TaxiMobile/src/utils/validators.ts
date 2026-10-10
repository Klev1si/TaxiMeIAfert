/**
 * Shared validation regexes. Single source of truth so we never drift
 * between screens that all need to check the same thing.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE  = /^\+[1-9]\d{6,14}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isValidE164Phone(s: string): boolean {
  return E164_RE.test(s.trim());
}

// Placeholders the backend writes when Google/Apple don't share a name.
const PLACEHOLDER_NAMES = new Set(['user', 'apple', 'google', 'test', 'name', '—', '-']);
// Letters (any alphabet), spaces, hyphens and apostrophes — no digits or symbols.
const NAME_CHARS_RE = /^[^\d!@#$%^&*()_+=[\]{};:"\\|,.<>/?~`]+$/;

/** A first or last name a person would plausibly have: 2+ letters, no digits/symbols, not a placeholder. */
export function isRealName(s: string | null | undefined): boolean {
  const v = (s ?? '').trim();
  return v.length >= 2 && NAME_CHARS_RE.test(v) && !PLACEHOLDER_NAMES.has(v.toLowerCase());
}
