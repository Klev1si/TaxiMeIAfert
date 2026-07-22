# TaxiApp

A taxi-booking platform with real-time GPS tracking, built for iOS and Android.

## Projects

- **TaxiAPI** — Backend API server (NestJS 11 + PostgreSQL + Redis)
- **TaxiMobile** — Mobile app (React Native 0.84) for clients and drivers
- **TaxiDashboard** — Web dashboard (React + Vite) for companies and admin

## Tech stack

- Node.js 24, TypeScript 6
- NestJS 11, Socket.io 4
- PostgreSQL 16, Redis 7
- React Native 0.84, React 19.2
- Google Maps, Twilio, Stripe, Firebase

## Getting started

See individual README files inside each project folder.

## Development

Run `docker-compose up -d` at root to start PostgreSQL and Redis.

## Android release build

Gradle requires JDK 17+, but the machine default may be older — point `JAVA_HOME`
at Android Studio's bundled JDK before building:

```powershell
cd TaxiMobile\android
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'   # JDK 21
.\gradlew bundleRelease
```

The signed bundle lands at `TaxiMobile\android\app\build\outputs\bundle\release\app-release.aab`
— upload it manually to Google Play Console. Bump `versionCode`/`versionName` in
`TaxiMobile/android/app/build.gradle` before each release. The app targets
Android 16 (API 36), required by Play since the 1.86 release.
