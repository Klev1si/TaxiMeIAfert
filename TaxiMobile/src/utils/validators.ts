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
