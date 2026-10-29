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

## Teknologjitë e përdorura

### Gjuha dhe baza
- **TypeScript**: gjuha kryesore për backend-in, aplikacionin mobile dhe dashboard-in.
- **Node.js 24**: mjedisi ku ekzekutohet serveri dhe veglat e build-it.

### Backend (TaxiAPI)
- **NestJS 11**: framework-u i API-së (REST).
- **PostgreSQL 16 + TypeORM**: databaza kryesore (shoferë, udhëtime, pagesa) dhe migrimet e saj.
- **Redis 7 (ioredis)**: cache dhe ruajtje e shpejtë e të dhënave, p.sh. pozicionet GPS.
- **Socket.io**: komunikim në kohë reale (gjurmimi i shoferit, statusi i udhëtimit).
- **JWT + Passport + bcrypt**: identifikimi i përdoruesve dhe ruajtja e sigurt e fjalëkalimeve.
- **Hyrje me Google dhe Apple** (`google-auth-library`, `apple-signin-auth`).
- **class-validator / Joi**: kontrolli i të dhënave që vijnë në API dhe i konfigurimit.
- **Helmet + Throttler**: siguria e header-ave dhe kufizimi i numrit të kërkesave.
- **@nestjs/schedule**: punë të planifikuara (cron), p.sh. për abonimet.
- **Stripe + Paysera**: pagesat.
- **Twilio**: SMS dhe verifikimi i numrit të telefonit.
- **Nodemailer**: dërgimi i email-eve (p.sh. rivendosja e fjalëkalimit).
- **Cloudinary**: ruajtja e fotove dhe e dokumenteve të shoferëve.
- **Firebase Admin**: njoftimet push.
- **Jest + Supertest**: testet.

### Aplikacioni mobile (TaxiMobile)
- **React Native 0.84 + React 19**: një aplikacion i vetëm për iOS dhe Android, për klientët dhe shoferët.
- **React Navigation**: navigimi mes ekraneve (stack dhe tabs).
- **Zustand**: menaxhimi i gjendjes së aplikacionit.
- **Axios + Socket.io-client**: lidhja me API-në.
- **react-native-maps + Google Maps** (Directions, Geocoding): hartat dhe rrugët.
- **Geolocation + Foreground Service**: GPS edhe kur aplikacioni është në sfond.
- **Firebase**: njoftimet push (Messaging), Analytics dhe Crashlytics.
- **Stripe React Native**: pagesat me kartë.
- **Google Sign-In dhe Apple Authentication**: hyrja me llogari Google ose Apple.
- **Keychain + AsyncStorage**: ruajtja e sigurt e token-ave dhe e të dhënave lokale.
- **react-native-config**: variablat e mjedisit.
- Librari të tjera: image picker, vector icons, in-app review.

### Dashboard-i web (TaxiDashboard)
- **React 19 + Vite**: paneli për kompanitë dhe adminin.
- **Tailwind CSS**: stilimi.
- **React Router**: navigimi mes faqeve.
- **React Hook Form + Zod**: format dhe validimi i tyre.
- **Zustand**: menaxhimi i gjendjes.
- **Recharts**: grafikët dhe statistikat.
- **Axios + Socket.io-client**: lidhja me API-në.

### Website-i (TaxiMeIAfertWebSite)
- **HTML + CSS + JavaScript** i thjeshtë, pa framework.
- **Three.js**: efektet 3D në faqen kryesore.
- **SEO**: `sitemap.xml`, `robots.txt`, imazh për rrjetet sociale (og-image) dhe faqe për qytete (Prizren, Kosovë etj.).

### Infrastruktura, DevOps dhe CI/CD
- **Docker + Docker Compose**: PostgreSQL dhe Redis për zhvillim dhe për prodhim.
- **GitHub Actions**: kontrolli i rregullave të React hooks dhe publikimi i faqeve ligjore.
- **GitHub Pages**: hoston faqet ligjore (privatësia, kushtet, fshirja e llogarisë) në shqip dhe anglisht.
- **Codemagic**: build-i i iOS dhe dërgimi në TestFlight.
- **EAS (Expo Application Services)**: build-et mobile (`eas.json`).
- **Gradle / Xcode**: build-et native për Android dhe iOS.

### Cilësia e kodit
- **ESLint + Prettier**: rregullat dhe formatimi i kodit.
- **Skripte vetanake** (`check-hooks-order`, `lint-hooks`): kontrollojnë që hooks të React-it të jenë në rendin e duhur.

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
