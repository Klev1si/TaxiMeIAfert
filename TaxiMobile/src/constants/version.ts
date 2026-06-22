/**
 * Current app version — MUST stay in sync with the native build:
 *   android/app/build.gradle    (versionName)
 *   ios/TaxiMobile/Info.plist   (CFBundleShortVersionString)
 *
 * Why this matters: App.tsx compares APP_VERSION against the server's
 * latestVersion / minimumVersion to decide whether to show the update
 * modal. If APP_VERSION is stale, every user sees the update prompt on
 * every launch even when they already have the newest build.
 *
 * Release checklist: when you bump versionName in build.gradle, bump
 * this constant in the same commit.
 */
export const APP_VERSION = '1.71';
