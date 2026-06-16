# iOS release prep — what's done, what's left

Everything below can be done from Windows. The actual *build* will happen
on Expo's macOS workers via EAS Build.

## Already in the repo

| Piece | Where |
|---|---|
| Apple Sign-In service | `src/services/appleAuth.ts` |
| `loginWithApple` action | `src/stores/authStore.ts` |
| Apple button on LoginScreen + SignUpScreen | iOS only via `Platform.OS === 'ios'` |
| `appleSignIn` API call | `src/api/auth.ts` → `POST /auth/apple` |
| `appleSub` column on `users` | `entities/user.entity.ts` + migration `1778800000000` |
| Backend Apple verifier | `auth/auth.service.ts → appleSignIn()` (uses `apple-signin-auth`) |
| Info.plist permission strings | `ios/TaxiMobile/Info.plist` (location/camera/photos/tracking) |
| UIBackgroundModes | `location`, `remote-notification`, `fetch` |
| EAS build config | `eas.json` (development / preview / production profiles) |

## What you'll do AFTER Apple Developer enrollment is fixed

### 1. Apple Developer portal (one-time, ~15 min)

1. Sign in at https://developer.apple.com/account
2. **Certificates, Identifiers & Profiles → Identifiers → App IDs → ➕**
   - Bundle ID: `com.taximelafert`
   - Capabilities: enable **Push Notifications**, **Sign in with Apple**,
     **Background Modes**
3. **Keys → ➕**
   - Name: `TaxiMeIAfert APNs`
   - Tick **Apple Push Notifications service (APNs)**
   - Download the `.p8` file (you can only download once!)
   - Note the Key ID + your Team ID

### 2. Firebase Console (one-time, ~10 min)

1. Project Settings → **Add app → iOS**
   - Bundle ID: `com.taximelafert`
   - Download `GoogleService-Info.plist`
   - Put it at `ios/TaxiMobile/GoogleService-Info.plist`
2. Project Settings → **Cloud Messaging → iOS app configuration**
   - Upload the APNs `.p8` key + Key ID + Team ID

### 3. Railway env vars

Add:
```
APPLE_BUNDLE_ID=com.taximelafert
GOOGLE_IOS_CLIENT_ID=<from Firebase iOS app's GoogleService-Info.plist>
APP_STORE_URL_IOS=https://apps.apple.com/app/idXXXXXXXXX   (after first submit)
```

### 4. App Store Connect (~30 min)

1. https://appstoreconnect.apple.com → My Apps → ➕ New App
2. Platforms: iOS
3. Name: `TaxiMeIAfert`
4. Bundle ID: the App ID you just created
5. SKU: `taximelafert-001`
6. Fill in: description, keywords, support URL (your GitHub Pages legal page),
   privacy policy URL (already published)
7. Privacy Nutrition Labels: same answers as Google Play Data Safety

### 5. EAS Build from Windows (every release)

```bash
npm install -g eas-cli
eas login
cd C:\Project\TaxiApp\TaxiMobile
yarn install                 # picks up the new apple-signin-auth + apple-authentication deps
eas build --platform ios --profile production
```

First run, EAS asks:
- Your Apple ID + app-specific password
- Permission to auto-generate certificates + provisioning profile → **Yes**

Build runs in cloud (~15-30 min). You get a downloadable `.ipa` URL.

### 6. Submit to App Store Connect

```bash
eas submit --platform ios --latest
```

This uploads the build to TestFlight automatically. From there:
- TestFlight: invite yourself / a few testers to validate on a real iPhone
- App Store: fill in remaining listing fields → **Submit for Review**
- Add review notes with: working test credentials, mention of Kosovo focus,
  explanation of background location for drivers
- Review window: usually 24–48 h

## Things to watch out for at App Review

| Issue | How to avoid |
|---|---|
| Missing Sign in with Apple | ✅ Done — present alongside Google |
| Background location not explained | ✅ `NSLocationAlwaysAndWhenInUseUsageDescription` set |
| FCM push fails on iOS | Make sure APNs `.p8` is uploaded to Firebase BEFORE submitting |
| Reviewer can't log in | Provide a working driver + passenger account in review notes |
| Kosovo not recognized as country | Workaround: list app for "Albania" + "Worldwide" if Kosovo fails |
| Empty map for reviewer (no drivers near Cupertino) | Add a "demo mode" toggle, OR note in review notes that reviewers should set their location to Kosovo via simulator |
