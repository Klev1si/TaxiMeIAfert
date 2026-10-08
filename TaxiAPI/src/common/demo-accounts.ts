/**
 * Accounts handed to App Store / Play Store reviewers (or used for our own
 * testing). Configured as DEMO_ACCOUNT_PHONES — comma-separated E.164 numbers,
 * e.g. "+38344000000,+38349000000". Rides they book are flagged `isTest` so
 * they are labelled in the dashboard and kept out of the headline stats.
 */
export function isDemoPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const list = (process.env.DEMO_ACCOUNT_PHONES ?? '')
    .split(',')
    .map(p => p.replace(/\s+/g, ''))
    .filter(Boolean);
  return list.includes(phone.replace(/\s+/g, ''));
}
