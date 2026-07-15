/**
 * Public URLs for the Privacy Policy and Support pages, served by the
 * TaxiDashboard deployment on the custom domain. Linked from the Profile
 * screens in all three role UIs so users can reach them without leaving
 * the app. Same URLs are declared in the App Store Connect and Play
 * Console listings.
 */
export const LEGAL_URLS = {
  privacyPolicy: 'https://dashboard.taximeiafert.com/privacy',
  support:       'https://dashboard.taximeiafert.com/support',
} as const;
