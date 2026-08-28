# Release Notes

## 1.92 (Android versionCode 105 · iOS build 31)

Single-feature release: passengers who sign in with Google or Apple are now
asked to add and verify a phone number, so a driver always has a reachable
contact. Verification is a one-time SMS code, and clients are guided to add
their number before their first booking.

### Store "What's New"

#### English (en)

**Google Play**

> Signing in with Google or Apple? You'll now be asked to add and verify your phone number so your driver can reach you for pickups. It's a quick, one-time SMS code — and once verified you're ready to book.

**App Store**

> New in 1.92
> • Add your phone in seconds: if you sign in with Google or Apple, we'll now help you add and verify a phone number so your driver can always reach you.
> • Verification is a single SMS code, and you only do it once.
> • You'll be guided to add your number before your first booking.

#### Albanian (sq)

**Google Play**

> Hyni me Google ose Apple? Tani do t'ju kërkohet të shtoni dhe verifikoni numrin tuaj të telefonit që shoferi t'ju kontaktojë për marrjen. Është një kod i shpejtë SMS, vetëm një herë — dhe pasi ta verifikoni, jeni gati të rezervoni.

**App Store**

> E re në 1.92
> • Shtoni telefonin në pak sekonda: nëse hyni me Google ose Apple, tani ju ndihmojmë të shtoni dhe verifikoni një numër telefoni që shoferi t'ju gjejë gjithmonë.
> • Verifikimi është një kod i vetëm SMS, dhe e bëni vetëm një herë.
> • Do të udhëzoheni ta shtoni numrin para rezervimit të parë.

#### Spanish (es)

**Google Play**

> ¿Inicias sesión con Google o Apple? Ahora te pediremos que añadas y verifiques tu número de teléfono para que tu conductor pueda localizarte en la recogida. Es un código SMS rápido y de una sola vez; una vez verificado, ya puedes reservar.

**App Store**

> Novedades en la 1.92
> • Añade tu teléfono en segundos: si inicias sesión con Google o Apple, ahora te ayudamos a añadir y verificar un número para que tu conductor siempre pueda localizarte.
> • La verificación es un único código SMS, y solo se hace una vez.
> • Te guiaremos para añadir tu número antes de tu primera reserva.

#### French (fr)

**Google Play**

> Vous vous connectez avec Google ou Apple ? Nous vous demanderons désormais d'ajouter et de vérifier votre numéro de téléphone pour que votre chauffeur puisse vous joindre lors de la prise en charge. C'est un code SMS rapide et unique — une fois vérifié, vous pouvez réserver.

**App Store**

> Nouveautés de la 1.92
> • Ajoutez votre téléphone en quelques secondes : si vous vous connectez avec Google ou Apple, nous vous aidons désormais à ajouter et vérifier un numéro pour que votre chauffeur puisse toujours vous joindre.
> • La vérification se fait avec un seul code SMS, une seule fois.
> • Vous serez guidé pour ajouter votre numéro avant votre première réservation.

#### Turkish (tr)

**Google Play**

> Google veya Apple ile mi giriş yapıyorsunuz? Sürücünüzün sizi alırken ulaşabilmesi için artık telefon numaranızı ekleyip doğrulamanız istenecek. Hızlı ve tek seferlik bir SMS kodudur — doğruladıktan sonra yolculuk ayırtmaya hazırsınız.

**App Store**

> 1.92'de yenilikler
> • Telefonunuzu saniyeler içinde ekleyin: Google veya Apple ile giriş yaparsanız, sürücünüzün size her zaman ulaşabilmesi için bir numara ekleyip doğrulamanıza yardımcı oluyoruz.
> • Doğrulama tek bir SMS kodudur ve yalnızca bir kez yapılır.
> • İlk rezervasyonunuzdan önce numaranızı eklemeniz için yönlendirileceksiniz.

### Internal changelog

**New: phone capture for Google/Apple sign-ins**

- Google and Apple logins never return a phone number, so those clients
  previously had no reachable contact and could still book. They are now
  required to add and verify one.
- **Backend:** new authenticated `POST /auth/attach-phone` (OTP-verified;
  guards against a number already linked to another account). `requestRide()`
  now rejects clients without a verified phone using a stable `PHONE_REQUIRED`
  code. No schema changes, no data migration — existing rows are only updated
  in place.
- **Mobile:** new `AddPhoneScreen` (enter phone → SMS code), reached both
  proactively (a home-screen nudge for clients with no number) and reactively
  (booking routes there instead of showing an error). Localized in all five
  languages (en/sq/es/fr/tr).

No other functional changes — 1.92 builds on 1.91.
